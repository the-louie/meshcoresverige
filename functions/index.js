// The bare address with a saved county (plan §6.8, Q7.4): / answers with that county's front page,
// and the address stays /. The cookie "lan" holds the visitor's choice (written by the site's
// script, never sent anywhere else); /lan/pages.json, built by Hugo, maps each SCB code to its
// county page. A county with its own site maps to that site's address, and / answers 302 there
// (B-327). Sverige (se), no cookie, ?lan=… or an unknown code get the ordinary / page.

export function chosenCounty(cookieHeader) {
  const m = /(?:^|;\s*)lan=(\d\d)(?:;|$)/.exec(cookieHeader || "");
  return m ? m[1] : null;
}

export async function onRequestGet({ request, env, next }) {
  const url = new URL(request.url);
  const scb = url.search ? null : chosenCounty(request.headers.get("Cookie"));
  if (!scb) return withVary(await next());
  let path = null;
  try {
    const map = await (await env.ASSETS.fetch(new URL("/lan/pages.json", url))).json();
    path = map[scb] || null;
  } catch (e) { /* no map: the ordinary page */ }
  if (!path) return withVary(await next());
  if (/^https:\/\//.test(path)) return withVary(new Response(null, { status: 302, headers: { Location: path } }));
  const page = await env.ASSETS.fetch(new URL(path, url));
  if (!page.ok) return withVary(await next());
  const headers = new Headers(page.headers);
  headers.set("Vary", "Cookie");
  headers.set("Cache-Control", "private, no-store");
  return new Response(page.body, { status: 200, headers });
}

// / differs by cookie, so no shared cache may keep one visitor's answer for another.
function withVary(res) {
  const r = new Response(res.body, res);
  r.headers.set("Vary", "Cookie");
  r.headers.set("Cache-Control", "private, no-store");
  return r;
}
