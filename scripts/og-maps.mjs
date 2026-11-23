// The map pictures for link previews of the map's share addresses (/karta/, /<county>/karta/;
// the template's layouts/mapshare): the real map of each region as the built site draws it, in the
// dark theme, with the logo and "MeshCore Sverige" on top. Written to <out>/karta-<scb|se|se-wide>.jpg.
//   node scripts/og-maps.mjs [site dir = public] [out dir = static/og]
// Sverige is square, from just south of Skåne to just north of Säter (operator 2026-11-22); a county
// is 1200 x 630, framed on its border. Needs the built site, a Chrome (CHROME, else the system's) and
// puppeteer or puppeteer-core (PUPPETEER names the package). The nodes and links come live from Beacon,
// so the pictures show the mesh as it is when the script runs.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";

const site = path.resolve(process.argv[2] || "public");
const out = path.resolve(process.argv[3] || "static/og");
const SWEDEN = [[10.0, 55.2], [20.0, 60.5]]; // square in Web Mercator: 10 degrees wide, Smygehuk to north of Säter
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webp": "image/webp" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(site, p);
    if (!file.startsWith(site)) throw new Error("outside");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const require = createRequire(import.meta.url);
const name = process.env.PUPPETEER || "puppeteer";
let puppeteer;
try { puppeteer = require(name); } catch { puppeteer = require(path.join(execSync("npm root -g").toString().trim(), name)); }
puppeteer = puppeteer.default || puppeteer;

const pages = JSON.parse(await readFile(path.join(site, "lan/pages.json"), "utf8"));
// Sverige twice: square for a service that shows a picture whole, and wide (the same span south to north,
// more sea and neighbours at the sides) for the many that crop to about 1.9:1 (functions/karta/index.js).
const jobs = [{ key: "se", url: "/", width: 1200, height: 1200 }, { key: "se-wide", url: "/", width: 1200, height: 630 },
  ...Object.entries(pages).map(([scb, url]) => ({ key: scb, url, width: 1200, height: 630 }))];
await mkdir(out, { recursive: true });

// A message storm, stopped in mid-flight (operator 2026-11-23: the plain map was "a bit boring"): about
// SHARE of the repeaters in view that have a link are shown transmitting, with the map's own effects
// (the template's flow.js: white flash, lit links, travelling bubbles) and one or two orange observer
// glows. The storm spreads from a few starting repeaters along the real links, as a flood does, each
// repeater later in its flash than the one it heard. The choice is seeded by the picture's name, so
// the same mesh gives the same picture at every build. Runs in the page; returns a line for the log.
const SHARE = Number(process.env.STORM ?? 0.1);
function stage(key, share) {
  const el = document.getElementById("map"), map = el.mapgl, flows = el.mapDebug?.flows;
  const links = map.getSource("links")?._data?.features || map.getSource("links")?.serialize?.().data?.features;
  if (!flows || !links?.length || !(share > 0)) return "no storm";
  let seed = [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // The repeaters in view and their link ends, from the links the map has drawn.
  const b = map.getBounds(), at = new Map(), ends = new Map();
  for (const f of links) {
    const { a, b: z, colour, role } = f.properties, [pa, pb] = f.geometry.coordinates;
    if (role === "background") continue;
    at.set(a, pa); at.set(z, pb);
    if (!ends.has(a)) ends.set(a, []); if (!ends.has(z)) ends.set(z, []);
    ends.get(a).push({ id: z, lng: pb[0], lat: pb[1], colour }); ends.get(z).push({ id: a, lng: pa[0], lat: pa[1], colour });
  }
  // On a county's picture the storm stays in the county (its own border test, set by lan/map-county.js).
  const own = (c) => b.contains(c) && !(key.startsWith("se") ? false : el.isOutside?.({ lng: c[0], lat: c[1] }));
  const inView = [...at.keys()].filter((id) => own(at.get(id))).sort();
  if (!inView.length) return "no storm";
  const want = Math.max(1, Math.round(inView.length * share)); // a small county still gets one
  // A few starting points, then outwards along the links, nearest first.
  const picked = [], seen = new Set(), queue = [];
  const start = () => { const free = inView.filter((id) => !seen.has(id)); const id = free[Math.floor(rnd() * free.length)]; seen.add(id); queue.push(id); };
  for (let i = 0; i < Math.max(1, Math.round(want / 12)); i++) start();
  while (picked.length < want) {
    if (!queue.length) start();
    const id = queue.shift(); picked.push(id);
    for (const e of ends.get(id).filter((e) => !seen.has(e.id) && own([e.lng, e.lat])).sort(() => rnd() - 0.5).slice(0, 3)) { seen.add(e.id); queue.push(e.id); }
  }
  // Stopped clock: the first to send are fading, the last have their bubbles on the way.
  const now = 1e6; flows.now = () => now; flows.enabled = true; flows.kick = () => {};
  flows.transmits = picked.map((id, i) => ({ p: { id, lng: at.get(id)[0], lat: at.get(id)[1] }, neighbours: ends.get(id),
    t0: now - (1150 - 950 * (picked.length > 1 ? i / (picked.length - 1) : 1)) }));
  flows.glows.clear();
  const rest = inView.filter((id) => !picked.includes(id));
  for (let i = 0; i < Math.min(rest.length, want > 20 ? 2 : 1); i++) { const id = rest[Math.floor(rnd() * rest.length)]; flows.glows.set(id, { p: { id, lng: at.get(id)[0], lat: at.get(id)[1] }, t0: now - 150 }); }
  // The resting links step back as they do under live traffic, so the lit ones stand out.
  map.setPaintProperty("links", "line-opacity", ["*", 0.35, ["get", "opacity"]]);
  flows.render();
  return `storm: ${picked.length} of ${inView.length} repeaters`;
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  args: ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", ...(process.env.CI ? ["--no-sandbox"] : [])] });
let failed = 0;
async function shoot(job) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: job.width, height: job.height });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem("theme", "dark"); } catch { /* none */ } });
    if (process.env.DEBUG) { page.on("pageerror", (e) => console.log("pageerror", e.message)); page.on("requestfailed", (r) => console.log("failed", r.url().slice(0, 90))); page.on("response", (r) => { if (r.status() >= 400) console.log(r.status(), r.url().slice(0, 90)); }); page.on("console", (m) => console.log("console", m.text().slice(0, 200))); }
    await page.goto(`${base}${job.url}?live=0&full=1`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.getElementById("map").scrollIntoView());
    await page.waitForFunction(() => { const el = document.getElementById("map"); return el.mapgl?.getSource("nodes") && el.mapgl.getLayer("node-points"); }, { timeout: Number(process.env.WAIT || 60000) });
    await page.addStyleTag({ content: `.maplibregl-ctrl-top-right, .maplibregl-ctrl-top-left, .map-panel, .map-loading, .lan-tip, .site-header { display: none !important; }
      .og-brand { position: absolute; left: 0; top: 0; right: 0; z-index: 5; display: flex; align-items: center; gap: 18px; padding: 36px 44px 90px;
        background: linear-gradient(#0b141bf2, #0b141bb0 55%, #0b141b00); color: #fff; font: 700 46px/1 "IBM Plex Sans", system-ui, sans-serif; letter-spacing: -.01em; }
      .og-brand img { width: 64px; height: 64px; }` });
    await page.evaluate(async (job, sweden) => {
      const el = document.getElementById("map"), map = el.mapgl;
      const brand = document.createElement("div"); brand.className = "og-brand";
      const img = new Image(); img.src = document.querySelector(".brand-logo").src; await img.decode();
      brand.append(img, document.createTextNode("MeshCore Sverige"));
      el.append(brand);
      const box = job.key.startsWith("se") ? sweden : el.regionBox();
      const padding = job.key === "se" ? 0 : job.key === "se-wide" ? { top: 100, bottom: 0, left: 0, right: 0 } : { top: 130, bottom: 50, left: 60, right: 60 };
      if (box) map.fitBounds(box, { padding, animate: false });
      await document.fonts.ready;
      await new Promise((r) => { map.once("idle", r); map.triggerRepaint(); });
    }, job, SWEDEN);
    await new Promise((r) => setTimeout(r, 1500)); // the links are drawn a moment after the nodes
    // The Sverige overview stays soft, with the muted repeater dots the site's own map has (operator 2026-11-22).
    const storm = await page.evaluate(stage, job.key, SHARE);
    await page.evaluate(() => new Promise((r) => { const m = document.getElementById("map").mapgl; m.once("idle", r); m.triggerRepaint(); }));
    await page.screenshot({ path: path.join(out, `karta-${job.key}.jpg`), type: "jpeg", quality: 86 });
    console.log(`ok   karta-${job.key}.jpg  ${storm}`);
  } catch (e) { failed++; console.log(`FAIL karta-${job.key}: ${e.message}`); } finally { await page.close(); }
}
try {
  // Three at a time: the pages share one Beacon and one tile server.
  const queue = process.env.ONLY ? jobs.filter((j) => process.env.ONLY.split(",").includes(j.key)) : [...jobs];
  // Sverige first and alone: it loads every region's nodes and links.
  while (queue[0]?.key.startsWith("se")) await shoot(queue.shift());
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) await shoot(queue.shift()); }));
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
