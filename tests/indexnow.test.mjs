import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { changedUrls } from "../scripts/indexnow.mjs";

const map = (rows) => `<urlset>${rows.map(([l, m]) => `<url><loc>${l}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`).join("")}</urlset>`;

test("IndexNow sends new URLs and URLs whose lastmod changed, nothing else (SEO-SV-29)", () => {
  const prev = map([["https://x.se/a/", "2026-11-17"], ["https://x.se/b/", "2026-11-18"], ["https://x.se/c/", ""]]);
  const next = map([["https://x.se/a/", "2026-11-18"], ["https://x.se/b/", "2026-11-18"], ["https://x.se/c/", ""], ["https://x.se/d/", ""]]);
  assert.deepEqual(changedUrls(prev, next), ["https://x.se/a/", "https://x.se/d/"]);
  assert.equal(changedUrls("", next).length, 4);
});

test("the IndexNow key file holds its own name", () => {
  const f = readdirSync(new URL("../static/", import.meta.url)).filter((n) => /^[0-9a-f]{32}\.txt$/.test(n));
  assert.equal(f.length, 1);
  assert.equal(readFileSync(new URL(`../static/${f[0]}`, import.meta.url), "utf8").trim(), f[0].slice(0, -4));
});
