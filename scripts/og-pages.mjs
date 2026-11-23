// One link-preview picture per page (operator 2026-11-23: a picture "that explains what the link is about"):
// the map of the page's county, or of Sverige, as background (bg-<key>.jpg, from scripts/og-maps.mjs), the site's name, a label for the kind
// of page, the page's title large, one line of what the reader gets, and on a county's front page and the
// site's the live numbers the page itself shows. Read from the built site, so a title, a description or a
// number that changes gives a new picture at the next build. Written to <out>/<key>.jpg, where <key> is the
// first 12 hex digits of the md5 of the page's address path: the template's head.html uses the picture when
// static/og/s/<key>.jpg exists, so the site is built once more after this script (deploy.yml).
//   node scripts/og-pages.mjs [site dir = public] [out dir = static/og/s] [map pictures = static/og]
// The words: data/og-cards.json (labels per section, and a title or a line for a page where the page's own
// do not fit). Needs puppeteer or puppeteer-core (PUPPETEER) and a Chrome (CHROME), as og-maps.mjs.
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";

const site = path.resolve(process.argv[2] || "public");
const out = path.resolve(process.argv[3] || "static/og/s");
const maps = path.resolve(process.argv[4] || "static/og");
const words = JSON.parse(await readFile(new URL("../data/og-cards.json", import.meta.url), "utf8"));
export const LINE_MAX = 125; // characters of the line under the title: two rows at this size

const unescape = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27|#34);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", "#34": '"' })[e]);
const strip = (s) => unescape(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attr = (html, re) => { const m = html.match(re); return m ? unescape(m[1] ?? m[2] ?? "") : ""; };
export const keyOf = (url) => createHash("md5").update(url).digest("hex").slice(0, 12);

// The line under the title: the page's own, else the description's first sentence, else the description.
export function lineOf(desc, own) {
  if (own) return own;
  const first = desc.split(/(?<=[.!?])\s/)[0];
  if (first.length <= LINE_MAX) return first.length < 40 && desc.length <= LINE_MAX ? desc : first;
  return desc.length <= LINE_MAX ? desc : "";
}

// What a page's picture says, from its built HTML. null for a page that gets none.
export function cardOf(url, html) {
  if (/http-equiv=["']?refresh/i.test(html.slice(0, 2000))) return null; // an alias; a page without a heading (a map share address) gets none either
  const lang = attr(html, /<html[^>]* lang=["']?([\w-]+)/) || "sv";
  const h1 = strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "");
  const desc = attr(html, /<meta name=["']?description["']? content=(?:"([^"]*)"|([^ >]*))/);
  if (!h1) return null;
  const scb = attr(html, /data-lan-page=["']?(\d\d)/);
  const lanHome = !!scb && /class=["']?stats[^>]*data-lan-scb=/.test(html) && /<section class=["']?hero/.test(html);
  // A page's own words, else the first rule its address matches (`county`: "home" a county's front page,
  // "sub" a page under one); {scope} in a line is the county's region.
  const rule = (words.rules || []).find((r) => new RegExp(r.match).test(url) && (!r.county || (r.county === "home" ? lanHome : !!scb && !lanHome)));
  const own = { ...rule, ...words.pages[url] };
  if (own.line) own.line = own.line.replace("{scope}", strip((html.match(/data-r=["']?scope["']?>([^<]+)</) || [])[1] || ""));
  let crumbs = [];
  for (const m of html.matchAll(/<script type=["']?application\/ld\+json["']?>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); for (const n of j["@graph"] || [j]) if (n["@type"] === "BreadcrumbList") crumbs = n.itemListElement.map((i) => i.name || i.item?.name); } catch { /* not ours */ }
  }
  const county = (s) => s.replace(/^MeshCore (i|in) /, "");
  const home = url === "/" || url === `/${lang}/`;
  let label = own.label ?? "";
  if (!("label" in own)) {
    const sect = Object.keys(words.sections).filter((p) => url.startsWith(p) && url !== p).sort((a, b) => b.length - a.length)[0];
    if (home) label = words.home[lang] || "";
    else if (lanHome) label = county(h1);
    else if (scb && crumbs.length > 2) label = county(crumbs[1]);
    else if (sect) label = words.sections[sect];
    else if (crumbs.length > 2) label = crumbs[crumbs.length - 2];
  }
  // A county's front page: the short form of its name, as the page's own title has it before the dash.
  const ogt = attr(html, /<meta property=["']?og:title["']? content=(?:"([^"]*)"|([^ >]*))/).split(" – ")[0];
  const title = own.title || (lanHome && ogt ? ogt : h1);
  const chips = []; let rep = null;
  if (home || lanHome) for (const k of ["repeaters", "online"]) {
    const m = html.match(new RegExp(`<dt>([^<]+)</dt><dd data-stat=["']?${k}["']?>([^<]+)</dd>`));
    if (m && /\d/.test(m[2]) && m[2].trim() !== "0") { chips.push(`${m[2].trim()} ${unescape(m[1]).toLowerCase()}`); if (k === "repeaters") rep = [Number(m[2]), unescape(m[1]).toLowerCase()]; }
  }
  return { key: keyOf(encodeURI(url)), url, // as Hugo writes the path (RelPermalink), percent-encoded
    lang, label, title, line: lineOf(desc, own.line), chips, bg: scb ? `bg-${scb}.jpg` : "bg-se-wide.jpg", strong: home || lanHome, home, lanHome, rep };
}

async function pagesIn(dir, rel = "") {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!["og", "pagefind", "js", "css", "lib", "fonts", "images", "data"].includes(e.name) || rel) found.push(...await pagesIn(path.join(dir, e.name), `${rel}/${e.name}`)); }
    else if (e.name === "index.html") found.push({ url: `${rel}/`, file: path.join(dir, e.name) });
  }
  return found;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pageHtml = (c, a) => `<!doctype html><meta charset=utf-8><style>
@font-face{font-family:P;font-weight:400;src:url(${a.f400})}@font-face{font-family:P;font-weight:600;src:url(${a.f600})}@font-face{font-family:P;font-weight:700;src:url(${a.f700})}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;font-family:P,system-ui,sans-serif;color:#fff;background:#0b141b url(${a.bg}) center/cover;position:relative;overflow:hidden}
.dim{position:absolute;inset:0;background:rgba(11,20,27,${c.strong ? 0.22 : 0.72})}
.fade{position:absolute;left:0;right:0;bottom:0;height:450px;background:linear-gradient(#0b141b00,#0b141bd9 45%,#0b141bf5)}
.brand{position:absolute;left:0;top:0;display:flex;align-items:center;gap:18px;padding:36px 44px;font:700 46px/1 P;letter-spacing:-.01em}.brand img{width:64px;height:64px}
.t{position:absolute;left:56px;right:56px;bottom:48px}
.label{font:600 26px/1.1 P;letter-spacing:.06em;text-transform:uppercase;color:#7dd3a8;margin-bottom:16px}
h1{font:700 ${c.title.length <= 22 ? 78 : c.title.length <= 34 ? 68 : c.title.length <= 52 ? 56 : 46}px/1.06 P;letter-spacing:-.015em;margin-bottom:18px;text-wrap:balance}
p{font:400 30px/1.3 P;color:#d5dee5;max-width:1000px;text-wrap:pretty}
.credit{position:absolute;right:20px;bottom:14px;font:400 15px/1 P;color:#8b9aa6}
.chips{display:flex;gap:12px;margin-top:20px}.chips span{font:600 24px/1 P;padding:10px 16px;border:2px solid #7dd3a8;border-radius:8px;color:#eafff3;background:#0b141b99}
</style><div class=dim></div><div class=fade></div><div class=credit>© OpenStreetMap · OpenMapTiles · OpenFreeMap</div><div class=brand><img src="${a.logo}">${esc(a.brand)}</div>
<div class=t>${c.label ? `<div class=label>${esc(c.label)}</div>` : ""}<h1>${esc(c.title)}</h1>${c.line ? `<p>${esc(c.line)}</p>` : ""}${c.chips.length ? `<div class=chips>${c.chips.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}</div>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const cards = [];
  for (const p of await pagesIn(site)) { const c = cardOf(p.url, await readFile(p.file, "utf8")); if (c) cards.push(c); }
  // The site's front page has no number of its own at build time: the counties' repeaters added up, and the counties.
  for (const h of cards.filter((c) => c.home)) {
    const lans = cards.filter((c) => c.lanHome && c.lang === h.lang), withRep = lans.filter((c) => c.rep);
    if (withRep.length) h.chips = [`${withRep.reduce((n, c) => n + c.rep[0], 0)} ${withRep[0].rep[1]}`, `${lans.length} ${words.counties[h.lang] || words.counties.sv}`];
  }
  if (process.env.LIST) { for (const c of cards) console.log([c.url, c.label, c.title, c.line || "(NO LINE)", c.chips.join(", ")].join(" | ")); process.exit(0); }
  const only = process.env.ONLY?.split(",");
  const todo = only ? cards.filter((c) => only.includes(c.url)) : cards;
  const data = async (file, type) => `data:${type};base64,${(await readFile(file)).toString("base64")}`;
  const fonts = {}; for (const w of [400, 600, 700]) fonts[`f${w}`] = await data(path.join(site, `fonts/plex-sans-latin-${w}.woff2`), "font/woff2");
  const logoFile = (await readFile(path.join(site, "index.html"), "utf8")).match(/class=["']?brand-logo["']?[^>]* src=["']?([^ "'>]+)/)?.[1] || (await readFile(path.join(site, "index.html"), "utf8")).match(/src=["']?([^ "'>]+)["']?[^>]* class=["']?brand-logo/)?.[1];
  const logo = await data(path.join(site, decodeURIComponent(logoFile)), logoFile.endsWith(".svg") ? "image/svg+xml" : "image/png");
  const bgs = new Map();
  const bg = async (name) => { if (!bgs.has(name)) bgs.set(name, await data(path.join(maps, name), "image/jpeg").catch(() => "")); return bgs.get(name); };
  const require = createRequire(import.meta.url), name = process.env.PUPPETEER || "puppeteer";
  let puppeteer; try { puppeteer = require(name); } catch { puppeteer = require(path.join(execSync("npm root -g").toString().trim(), name)); }
  puppeteer = puppeteer.default || puppeteer;
  if (!only) await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  // One browser per worker: tabs of one headless browser do not take pictures at the same time.
  let failed = 0, done = 0;
  const queue = [...todo];
  await Promise.all([0, 1, 2].map(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--disable-dev-shm-usage", ...(process.env.CI ? ["--no-sandbox"] : [])] });
    try {
      const page = await browser.newPage(); await page.setViewport({ width: 1200, height: 630 });
      while (queue.length) {
        const c = queue.shift();
        try {
          await page.setContent(pageHtml(c, { ...fonts, logo, bg: await bg(c.bg), brand: words.brand[c.lang] || words.brand.sv }), { waitUntil: "load" });
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: path.join(out, `${c.key}.jpg`), type: "jpeg", quality: c.strong ? 86 : 80 });
          done++;
        } catch (e) { failed++; console.log(`FAIL ${c.url}: ${e.message}`); }
      }
    } finally { await browser.close(); }
  }));
  await writeFile(path.join(out, "index.json"), JSON.stringify(Object.fromEntries(todo.map((c) => [c.url, c.key])), null, 1));
  console.log(`${done} page pictures, ${failed} failed, ${todo.filter((c) => !c.line).length} without a line`);
  process.exit(failed ? 1 : 0);
}
