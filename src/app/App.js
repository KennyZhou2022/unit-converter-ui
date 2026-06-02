import { createElement, html, raw } from "../components/dom.js";
import { renderCatalogPage } from "../features/catalog/CatalogPage.js";
import { renderCategoryGrid } from "../features/catalog/CategoryGrid.js";
import { renderConverterForm } from "../features/converter/ConverterForm.js";
import { findConverter, firstConverter } from "../features/converter/unitFilters.js";
import { shell } from "../features/layout/AppShell.js";
import { unitConverterApi } from "../services/api/unitConverterApi.js";
import { parseRoute } from "./router.js";

export async function mountApp(root) {
  const appVersion = await loadAppVersion();
  document.title = `Unit Converter v${appVersion}`;
  root.innerHTML = shell(
    '<main class="page"><div class="loading">Loading catalog...</div></main>',
    location.pathname,
    appVersion,
  );

  let catalog;
  let health;
  try {
    catalog = await unitConverterApi.catalog();
  } catch (error) {
    root.innerHTML = shell(
      raw`<main class="page"><div class="empty-state">
        <strong>API unavailable</strong>
        <p>${html`${error.code || "API_UNAVAILABLE"}: ${error.message}`}</p>
        <p>Run <code>sh scripts/setup-local-api.sh</code>, then start <code>python api/server.py --host 127.0.0.1 --port 5173</code>.</p>
      </div></main>`,
      location.pathname,
      appVersion,
    );
    return;
  }
  try {
    health = await unitConverterApi.health();
  } catch {
    health = { packageVersion: "Unavailable" };
  }

  function navigate(path) {
    history.pushState({}, "", path);
    render();
  }

  function render() {
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

    root.innerHTML = shell("", route.name === "home" ? "/" : converter.route, appVersion);
    root.querySelector(".app-shell").append(renderHomePage(catalog, converter, navigate, route.name));
  }

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
    return version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

function renderHomePage(catalog, converter, navigate, routeName) {
  const title = converter.groupName;
  const page = createElement(raw`
    <main class="page">
      <section class="hero">
        <div class="hero__copy">
          <h1>${html`${title}`}</h1>
        </div>
        <div class="converter-shell" data-slot="converter"></div>
      </section>
      <section class="section">
        <div class="section__header">
          <div>
            <h2>Converter Groups</h2>
            <p>Grouped for a UnitConverters.net-style browsing flow, backed by the Python package catalog.</p>
          </div>
        </div>
        <div data-slot="categories"></div>
      </section>
    </main>
  `);

  page.querySelector('[data-slot="converter"]').append(
    renderConverterForm({
      catalog,
      converter,
      onNavigate: navigate,
      showAllCategories: routeName === "home",
    }),
  );
  page.querySelector('[data-slot="categories"]').append(renderCategoryGrid(catalog));

  return page;
}

function renderAboutPage(catalog, health) {
  const packageVersion = health?.packageVersion || "Unavailable";
  return raw`
    <main class="page">
      <section>
        <h1>About</h1>
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
