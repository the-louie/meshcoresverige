// The map pictures for link previews of the map's share addresses (/karta/, /<county>/karta/;
// the template's layouts/mapshare): the real map of each region as the built site draws it, in the
// dark theme, with the logo and "MeshCore Sverige" on top. Written to <out>/karta-<scb|se>.jpg.
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
const jobs = [{ key: "se", url: "/", width: 1200, height: 1200 },
  ...Object.entries(pages).map(([scb, url]) => ({ key: scb, url, width: 1200, height: 630 }))];
await mkdir(out, { recursive: true });

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
      const box = job.key === "se" ? sweden : el.regionBox();
      if (box) map.fitBounds(box, { padding: job.key === "se" ? 0 : { top: 130, bottom: 50, left: 60, right: 60 }, animate: false });
      await document.fonts.ready;
      await new Promise((r) => { map.once("idle", r); map.triggerRepaint(); });
    }, job, SWEDEN);
    await new Promise((r) => setTimeout(r, 1500)); // the links are drawn a moment after the nodes
    // The Sverige overview stays soft, with the muted repeater dots the site's own map has (operator 2026-11-22).
    await page.evaluate(() => new Promise((r) => { const m = document.getElementById("map").mapgl; m.once("idle", r); m.triggerRepaint(); }));
    await page.screenshot({ path: path.join(out, `karta-${job.key}.jpg`), type: "jpeg", quality: 86 });
    console.log(`ok   karta-${job.key}.jpg`);
  } catch (e) { failed++; console.log(`FAIL karta-${job.key}: ${e.message}`); } finally { await page.close(); }
}
try {
  // Three at a time: the pages share one Beacon and one tile server.
  const queue = process.env.ONLY ? jobs.filter((j) => process.env.ONLY.split(",").includes(j.key)) : [...jobs];
  // Sverige first and alone: it loads every region's nodes and links.
  if (queue[0]?.key === "se") await shoot(queue.shift());
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) await shoot(queue.shift()); }));
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
