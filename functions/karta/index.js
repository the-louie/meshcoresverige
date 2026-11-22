// The Sverige map's share address (/karta/, /en/map/): which preview picture a service gets.
// Facebook, X, LinkedIn, WhatsApp and Telegram crop the picture to about 1.9:1, so the page names
// the wide one (og/karta-se-wide.jpg). Discord shows a picture whole, so its fetcher is handed the
// square one, Skåne to north of Säter (operator 2026-11-22). Everything else passes through.

export const showsWhole = (userAgent) => /Discordbot/i.test(userAgent || "");

export function squarePicture(html) {
  return html.replace(/og\/karta-se-wide\.jpg/g, "og/karta-se.jpg")
    .replace(/(og:image:height"?\s+content="?)630/, "$11200");
}

export async function onRequestGet({ request, next }) {
  const res = await next();
  const type = res.headers.get("Content-Type") || "";
  if (!res.ok || !type.includes("text/html")) return res;
  const headers = new Headers(res.headers);
  headers.set("Vary", "User-Agent");
  if (!showsWhole(request.headers.get("User-Agent"))) return new Response(res.body, { status: res.status, headers });
  headers.delete("Content-Length"); headers.delete("ETag");
  return new Response(squarePicture(await res.text()), { status: res.status, headers });
}
