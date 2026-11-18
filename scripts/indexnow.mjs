#!/usr/bin/env node
// IndexNow (SEO-SV-29): after a production deploy, tell Bing and the other IndexNow engines which
// URLs are new or changed: the sitemap that was live before the deploy against the one just built,
// URL by URL on <lastmod>. Not Google (it does not take IndexNow; the sitemap resubmit is the release
// step's). The key is public by design: static/<key>.txt holds it, and the engines fetch it to check.
// Usage: node scripts/indexnow.mjs <old sitemap.xml> <new sitemap.xml>   (old may be missing: all URLs)
import { readFileSync, readdirSync } from "node:fs";

export function entries(xml) {
  const out = new Map();
  for (const m of (xml || "").matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(m[1])?.[1]?.trim();
    if (loc) out.set(loc, /<lastmod>([^<]+)<\/lastmod>/.exec(m[1])?.[1]?.trim() || "");
  }
  return out;
}

// URLs in `next` that are not in `prev` or whose lastmod differs.
export function changedUrls(prevXml, nextXml) {
  const prev = entries(prevXml), next = entries(nextXml);
  return [...next].filter(([loc, mod]) => !prev.has(loc) || prev.get(loc) !== mod).map(([loc]) => loc);
}

async function main() {
  const [oldPath, newPath] = process.argv.slice(2);
  let prev = "";
  try { prev = readFileSync(oldPath, "utf8"); } catch { /* first deploy: every URL */ }
  if (prev && !/<urlset/.test(prev)) { console.log("indexnow: the old sitemap is not a sitemap; nothing sent"); return; }
  const next = readFileSync(newPath, "utf8");
  const urls = changedUrls(prev, next).slice(0, 10000);
  if (!urls.length) { console.log("indexnow: no changed URLs"); return; }
  const keyFile = readdirSync(new URL("../static/", import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!keyFile) { console.log("indexnow: no key file in static/"); return; }
  const key = keyFile.slice(0, -4);
  const host = new URL(urls[0]).host;
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `https://${host}/${keyFile}`, urlList: urls }),
    signal: AbortSignal.timeout(30000),
  });
  console.log(`indexnow: ${urls.length} URL(s) sent, HTTP ${r.status}`);
  for (const u of urls) console.log(`  ${u}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.log(`indexnow: ${e.message}`); });
