import { html, raw } from "../../components/dom.js";

export function shell(content, activePath, appVersion = "1.1.0") {
  return raw`
    <div class="app-shell">
      <a class="skip-link" href="#main-content">Skip to main content</a>
      <header class="app-header">
        <div class="app-header__inner">
          <a class="brand" href="/" data-link>
            <span class="brand__mark" aria-hidden="true">U</span>
            <span class="brand__name">Unit Converter</span>
            <span class="brand__version">v${html`${appVersion}`}</span>
          </a>
          <nav class="nav" aria-label="Main navigation">
            <a href="/" data-link ${activePath === "/" ? 'aria-current="page"' : ""}>Convert</a>
            <a href="/units" data-link ${activePath === "/units" ? 'aria-current="page"' : ""}>Units</a>
            <a href="/about" data-link ${activePath === "/about" ? 'aria-current="page"' : ""}>About</a>
            <a class="header-link" href="https://github.com/KennyZhou2022/unit-converter-ui" target="_blank" rel="noreferrer" aria-label="Open GitHub repository" title="GitHub repository">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M12 .3C5.4.3 0 5.7 0 12.3c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.6 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.8-1.6 8.2-6.1 8.2-11.4C24 5.7 18.6.3 12 .3Z"/>
              </svg>
            </a>
          </nav>
        </div>
      </header>
      ${content}
    </div>
  `;
}
