import { createElement, html, raw } from "../components/dom.js";
import { renderCatalogPage } from "../features/catalog/CatalogPage.js";
import { createConverterWorkspace } from "../features/converter/ConverterWorkspace.js";
import { findConverter, firstConverter } from "../features/converter/unitFilters.js";
import { createFavoriteStore } from "../features/favorites/favoriteStore.js";
import { isFavoritesStorageEvent } from "../features/favorites/favoriteStorageSync.js";
import { shell } from "../features/layout/AppShell.js";
import { unitConverterApi } from "../services/api/unitConverterApi.js";
import { parseRoute } from "./router.js";

export async function mountApp(root) {
  const appVersion = await loadAppVersion();
  document.title = `Unit Converter v${appVersion}`;
  root.innerHTML = shell(
    raw`<main class="page page--converter" id="main-content" tabindex="-1">
      <div class="loading" role="status" aria-live="polite">
        <div class="loading__rail" aria-hidden="true"><span></span></div>
        <strong>Loading the unit catalog</strong>
        <p>Preparing supported measures and conversion rules.</p>
      </div>
    </main>`,
    activeNavigationPath(location.pathname),
    appVersion,
  );

  let catalog;
  try {
    catalog = await unitConverterApi.catalog();
  } catch (error) {
    root.innerHTML = shell(
      raw`<main class="page page--converter" id="main-content" tabindex="-1">
        <section class="state-view state-view--error" role="alert" aria-labelledby="service-error-title">
          <p class="eyebrow">Connection check</p>
          <h1 id="service-error-title">Conversion service unavailable</h1>
          <p>${html`${error.code || "API_UNAVAILABLE"}: ${error.message}`}</p>
          <p>For local development, run <code>sh scripts/setup-local-api.sh</code>, then restart the service.</p>
          <button class="button button--primary" type="button" data-action="retry">Try again</button>
        </section>
      </main>`,
      activeNavigationPath(location.pathname),
      appVersion,
    );
    root.querySelector('[data-action="retry"]')?.addEventListener("click", () => {
      location.reload();
    });
    return;
  }

  let health;
  try {
    health = await unitConverterApi.health();
  } catch {
    health = { packageVersion: "Unavailable" };
  }
  const storage = browserStorage();
  const favoriteStore = createFavoriteStore(storage);
  let activeView;

  function navigate(path) {
    history.pushState({}, "", path);
    render();
    root.querySelector("#main-content")?.focus({ preventScroll: true });
  }

  function render() {
    activeView?.destroy?.();
    activeView = undefined;
    const route = parseRoute(location.pathname);
    if (route.name === "units") {
      root.innerHTML = shell("", "/units", appVersion);
      root.querySelector(".app-shell").append(renderCatalogPage(catalog));
      return;
    }

    if (route.name === "about") {
      root.innerHTML = shell(renderAboutPage(catalog, health), "/about", appVersion);
      return;
    }

    const converter =
      route.name === "convert"
        ? findConverter(catalog, route.groupSlug, route.converterSlug)
        : firstConverter(catalog);
    root.innerHTML = shell("", "/", appVersion);
    activeView = createConverterPage(catalog, converter, favoriteStore);
    root.querySelector(".app-shell").append(activeView.element);
  }

  window.addEventListener("storage", (event) => {
    if (isFavoritesStorageEvent(event, storage)) {
      favoriteStore.reload();
    }
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link || link.origin !== location.origin) {
      return;
    }
    event.preventDefault();
    navigate(link.pathname);
  });
  window.addEventListener("popstate", render);
  render();
}

async function loadAppVersion() {
  try {
    const response = await fetch("/VERSION", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`VERSION returned ${response.status}`);
    }
    const version = (await response.text()).trim();
    return version || "1.1.0";
  } catch {
    return "1.1.0";
  }
}

function activeNavigationPath(pathname) {
  const route = parseRoute(pathname);
  if (route.name === "units") {
    return "/units";
  }
  if (route.name === "about") {
    return "/about";
  }
  return "/";
}

function createConverterPage(catalog, converter, favoriteStore) {
  const page = createElement(raw`
    <main class="page page--converter" id="main-content" tabindex="-1">
      <div class="converter-shell" data-slot="converter"></div>
    </main>
  `);
  const workspace = createConverterWorkspace({ catalog, converter, favoriteStore });
  page.querySelector('[data-slot="converter"]').append(workspace.element);
  return {
    destroy: workspace.destroy,
    element: page,
  };
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function renderAboutPage(catalog, health) {
  const packageVersion = health?.packageVersion || "Unavailable";
  return raw`
    <main class="page" id="main-content" tabindex="-1">
      <section>
        <p class="eyebrow">Reference &amp; provenance</p>
        <h1>About</h1>
        <p class="lede">Where the supported units come from, which engine performs the conversion, and how to report a problem.</p>
      </section>
      <section class="section about-grid">
        <div class="about-box">
          <h2>Data Source</h2>
          <p>${html`${catalog.source}`}</p>
          <p>
            Original PDF:
            <a href="https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication811e2008.pdf" target="_blank" rel="noreferrer">
              NIST Special Publication 811 (2008)
            </a>
          </p>
        </div>
        <div class="about-box">
          <h2>Python Package</h2>
          <p>
            Current wheel package version:
            <strong>unit-converter ${html`${packageVersion}`}</strong>
          </p>
          <p>
            Wheel files are available from the backend package releases:
            <a href="https://github.com/KennyZhou2022/unit-converter/releases" target="_blank" rel="noreferrer">
              unit-converter releases
            </a>
          </p>
        </div>
        <div class="about-box">
          <h2>Report Issues</h2>
          <p>
            Found a bug or incorrect conversion behavior? Please open an issue
            in the UI repository:
            <a href="https://github.com/KennyZhou2022/unit-converter-ui/issues/new" target="_blank" rel="noreferrer">
              Create a GitHub issue
            </a>
          </p>
        </div>
      </section>
    </main>
  `;
}
