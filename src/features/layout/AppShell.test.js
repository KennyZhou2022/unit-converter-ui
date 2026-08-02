import test from "node:test";
import assert from "node:assert/strict";

import { shell } from "./AppShell.js";

test("renders Convert, Units, and About navigation with the active page", () => {
  const markup = shell("", "/units", "2.0.0");

  assert.match(markup, /href="\/"[^>]*>Convert<\/a>/);
  assert.match(markup, /href="\/units"[^>]*aria-current="page"[^>]*>Units<\/a>/);
  assert.match(markup, /href="\/about"[^>]*>About<\/a>/);
  assert.match(markup, />v2\.0\.0<\/span>/);
});
