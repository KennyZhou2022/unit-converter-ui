import test from "node:test";
import assert from "node:assert/strict";

import { createConversionRequestGate } from "./conversionRequestGate.js";

test("only treats the latest scheduled conversion request as current", () => {
  const gate = createConversionRequestGate();

  const firstRequest = gate.next();
  const secondRequest = gate.next();

  assert.equal(gate.isCurrent(firstRequest), false);
  assert.equal(gate.isCurrent(secondRequest), true);
});
