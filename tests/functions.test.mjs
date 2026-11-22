import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, chosenCounty } from "../functions/index.js";

const PAGES = { "01": "https://meshcore-sth.se/", "08": "/kalmar/", "12": "/sk%C3%A5ne/" };
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
  const c = ctx("https://meshcoresverige.se/", "lan=12");
  const r = await onRequestGet(c);
  assert.equal(await r.text(), "county /sk%C3%A5ne/");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Vary"), "Cookie");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  assert.equal(r.headers.get("Location"), null, "no redirect: the address stays /");
});
test("a saved county with its own site: / answers 302 to that site (B-327)", async () => {
  const r = await onRequestGet(ctx("https://meshcoresverige.se/", "lan=01"));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("Location"), "https://meshcore-sth.se/");
  assert.equal(r.headers.get("Vary"), "Cookie");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
});
test("Sverige, no cookie, ?lan= or a county without a page: the ordinary /", async () => {
  for (const [url, cookie] of [["https://meshcoresverige.se/", "lan=se"], ["https://meshcoresverige.se/", ""], ["https://meshcoresverige.se/?lan=se", "lan=12"], ["https://meshcoresverige.se/", "lan=06"]]) {
    const r = await onRequestGet(ctx(url, cookie));
    assert.equal(await r.text(), "sverige", `${url} ${cookie}`);
    assert.equal(r.headers.get("Vary"), "Cookie");
  }
});

test("the Plausible proxy stays shut until the site's script path is set", async () => {
  const { onRequest } = await import("../functions/p/[[path]].js");
  const r = await onRequest({ request: new Request("https://meshcoresverige.se/p/s.js"), params: { path: ["s.js"] }, env: {} });
  assert.equal(r.status, 404);
});

test("the Sverige map's share address hands Discord the square picture, others the wide one", async () => {
  const { onRequestGet: share, showsWhole, squarePicture } = await import("../functions/karta/index.js");
  assert.equal(showsWhole("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"), true);
  assert.equal(showsWhole("facebookexternalhit/1.1"), false);
  const html = '<meta property="og:image" content="https://x/og/karta-se-wide.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">';
  assert.equal(squarePicture(html), '<meta property="og:image" content="https://x/og/karta-se.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="1200">');
  assert.match(squarePicture('<meta property="og:image:height" content=630>'), /content=1200>/);
  const next = async () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  const ask = async (ua) => (await share({ request: new Request("https://x/karta/", { headers: { "User-Agent": ua } }), next })).text();
  assert.match(await ask("Discordbot/2.0"), /karta-se\.jpg/);
  assert.match(await ask("WhatsApp/2.23"), /karta-se-wide\.jpg/);
});
