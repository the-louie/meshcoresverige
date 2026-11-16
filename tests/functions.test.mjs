import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, chosenCounty } from "../functions/index.js";

const PAGES = { "08": "/kalmar/", "12": "/sk%C3%A5ne/" };
function ctx(url, cookie) {
  const fetched = [];
  return {
    fetched,
    request: new Request(url, { headers: cookie ? { Cookie: cookie } : {} }),
    env: { ASSETS: { fetch: async (u) => {
      const p = new URL(u).pathname; fetched.push(p);
      if (p === "/lan/pages.json") return new Response(JSON.stringify(PAGES));
      if (Object.values(PAGES).includes(p)) return new Response(`county ${p}`, { headers: { "Content-Type": "text/html" } });
      return new Response("not found", { status: 404 });
    } } },
    next: async () => new Response("sverige", { headers: { "Content-Type": "text/html" } }),
  };
}

test("the cookie's county is read strictly", () => {
  assert.equal(chosenCounty("a=1; lan=12; b=2"), "12");
  assert.equal(chosenCounty("lan=se"), null);
  assert.equal(chosenCounty("xlan=12"), null);
  assert.equal(chosenCounty(""), null);
});
test("a saved county's front page at /, not cached for others", async () => {
  const c = ctx("https://meshcore-swe.se/", "lan=12");
  const r = await onRequestGet(c);
  assert.equal(await r.text(), "county /sk%C3%A5ne/");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Vary"), "Cookie");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  assert.equal(r.headers.get("Location"), null, "no redirect: the address stays /");
});
test("Sverige, no cookie, ?lan= or a county without a page: the ordinary /", async () => {
  for (const [url, cookie] of [["https://meshcore-swe.se/", "lan=se"], ["https://meshcore-swe.se/", ""], ["https://meshcore-swe.se/?lan=se", "lan=12"], ["https://meshcore-swe.se/", "lan=06"]]) {
    const r = await onRequestGet(ctx(url, cookie));
    assert.equal(await r.text(), "sverige", `${url} ${cookie}`);
    assert.equal(r.headers.get("Vary"), "Cookie");
  }
});
