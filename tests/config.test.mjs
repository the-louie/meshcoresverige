import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the site runs the template in national mode", () => {
  const cfg = readFileSync(new URL("../hugo.toml", import.meta.url), "utf8");
  assert.match(cfg, /^\s*national\s*=\s*true\b/m);
});
