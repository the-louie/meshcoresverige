#!/usr/bin/env node
// "Nya repeatrar" (B-362): the repeaters first heard in the last 7 days, written to
// data/new_repeaters.json for the build (the template's new-repeaters page reads it), and the
// first-heard dates learned so far to static/data/first-seen.json, which the deployed site serves
// so that the next build starts from them. Run by the deploy workflow before Hugo, every 6 h.
//
// First heard is the earliest of our Beacon's and the seed's (params.beacon.url, params.beacon.seeds
// in hugo.toml): ours has heard nothing before 2026-11-12 and would call every repeater new. Beacon's
// node list has no firstSeen, only each node's detail, and a burst of detail calls is refused, so
// the calls are throttled, time-boxed, and made only for keys the saved state does not know; the
// seed (another operator's server) gets at most SEED_CALLS (40) calls a round, 2 s apart. A key not
// settled this round is left out (never shown as new on a guess) and settled in a later one.
// A new key that only replaces an older node (re-keyed: the same name, or within 50 m of a node last
// heard before the new one appeared) is not new. A renamed node keeps its key, so its date.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

export const DAY = 86400000;
export const WINDOW_DAYS = 7;

const norm = (s) => (s || "").trim().toLowerCase();
const placed = (n) => Number.isFinite(n.lat) && Number.isFinite(n.lng) && !(n.lat === 0 && n.lng === 0);

// Metres between two positions; equirectangular, plenty for 50 m.
export function metres(a, b) {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dx = (a.lng - b.lng) * k * 111320, dy = (a.lat - b.lat) * 110574;
  return Math.hypot(dx, dy);
}

// "esp32s3-v1.17.0-observer-…" or "1.14.0+" → "1.17.0" / "1.14.0"; "" when there is no version.
export function version(s) {
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(s || "");
  return m ? m[1] : "";
}

// The earliest moment a Beacon's list item shows the node was heard: its lastSeen, or an earlier
// lastHeard in one of its map areas. An upper bound on its first day; 0 when there is none.
export function seenBefore(item) {
  const t = [item?.lastSeen, ...(item?.iatas || []).map((i) => i.lastHeard)].map(Number).filter((x) => x > 0);
  return t.length ? Math.min(...t) : 0;
}

// The new repeaters: those in `nodes` whose first-heard date in `first` (pubkey → ms) is within the
// window, less the ones that only replace an older node. `others` holds every node of either Beacon
// (pubkey, name, lat, lng, lastSeen) to look for a predecessor in.
export function selectNew(nodes, first, others, now, windowDays = WINDOW_DAYS) {
  const since = now - windowDays * DAY;
  const out = [];
  for (const n of nodes) {
    const f = first[n.publicKey];
    if (!f || f < since) continue;
    const before = (o) => o.publicKey !== n.publicKey && ((first[o.publicKey] && first[o.publicKey] < since) || (o.lastSeen && o.lastSeen < f));
    const rekeyed = others.some((o) => before(o) && ((norm(o.name) && norm(o.name) === norm(n.name)) ||
      (placed(o) && placed(n) && o.lastSeen && o.lastSeen < f && metres(o, n) <= 50)));
    if (!rekeyed) out.push({ ...n, firstSeen: f });
  }
  return out.sort((a, b) => b.firstSeen - a.firstSeen);
}

// --- network ---------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(base, { gap = 200, deadline }) {
  let next = 0;
  return async function get(path, params = {}) {
    const u = new URL(`${base.replace(/\/$/, "")}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
    for (let attempt = 0; attempt < 6; attempt++) {
      if (Date.now() > deadline) throw new Error("time box reached");
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + gap;
      const r = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "meshcoresverige build" }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status === 503) { await sleep(5000 * (attempt + 1)); continue; }
      const body = await r.json().catch(() => null);
      if (body?.error?.code === "rate_limited") { await sleep(5000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error(`${u.pathname}: HTTP ${r.status}`);
      return body;
    }
    throw new Error(`${u.pathname}: still refused`);
  };
}

async function all(get, path, params) {
  const items = [];
  let pageCursor;
  for (let page = 0; page < 30; page++) {
    const body = await get(path, { ...params, limit: 2000, pageCursor });
    items.push(...(Array.isArray(body) ? body : body?.items || []));
    if (!body?.hasMore || !body.nextPageCursor) break;
    pageCursor = body.nextPageCursor;
  }
  return items;
}

function config() {
  const toml = readFileSync(new URL("../hugo.toml", import.meta.url), "utf8");
  const str = (key) => (new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m").exec(toml) || [])[1];
  const list = (key) => ((new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(toml) || [])[1] || "").match(/"[^"]*"/g)?.map((s) => s.slice(1, -1)) || [];
  const beacon = (/^\[params\.beacon\]([\s\S]*?)^\[/m.exec(toml) || [])[1] || "";
  const ours = (/^\s*url\s*=\s*"([^"]*)"/m.exec(beacon) || [])[1];
  return { base: str("baseURL"), ours, seeds: list("seeds"), iatas: list("iatas") };
}

async function main() {
  const started = Date.now();
  // Normal runs look up a handful of keys; the first (no saved state) asks ours about every repeater.
  const deadline = started + Number(process.env.NEW_REPEATERS_SECONDS || 900) * 1000;
  const cfg = config();
  const stateURL = process.env.FIRST_SEEN_URL || new URL("data/first-seen.json", cfg.base).href;
  const ours = client(cfg.ours, { deadline, gap: 300 });
  const seed = cfg.seeds[0] ? client(cfg.seeds[0], { deadline, gap: 2000 }) : null;
  const iatas = cfg.iatas.join(",");

  let first = {}, pending = {}, loaded = false;
  try {
    const r = await fetch(stateURL, { signal: AbortSignal.timeout(20000) });
    if (r.ok) { const j = await r.json(); first = j.first || {}; pending = j.pending || {}; loaded = true; }
  } catch { /* first run, or the site is down: start empty */ }
  const known = Object.keys(first).length;

  // The state is written whatever happens next, so a failed round never loses the dates already known.
  const save = (nodes) => {
    mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
    mkdirSync(new URL("../static/data/", import.meta.url), { recursive: true });
    const at = new Date().toISOString();
    if (nodes) writeFileSync(new URL("../data/new_repeaters.json", import.meta.url), JSON.stringify({ at, windowDays: WINDOW_DAYS, nodes }, null, 1) + "\n");
    if (loaded || Object.keys(first).length || Object.keys(pending).length) writeFileSync(new URL("../static/data/first-seen.json", import.meta.url), JSON.stringify({ at, first, pending }) + "\n");
  };
  try {
    let [mine, seeded, observers] = await Promise.all([
      all(ours, "/nodes", { iatas }),
      seed ? all(seed, "/nodes", { iatas }).catch((e) => (console.warn(`seed list: ${e.message}`), null)) : [],
      all(ours, "/observers", { iatas }).catch(() => []),
    ]);
    const repeaters = mine.filter((n) => n.nodeType === 2);
    // Without the seed's list every repeater would look new to ours: look nothing up this round.
    const seedOK = !seed || (Array.isArray(seeded) && seeded.length > 0);
    if (!seedOK) seeded = [];
    const seedBy = new Map(seeded.map((n) => [n.publicKey, n]));
    const since = Date.now() - WINDOW_DAYS * DAY;

    // Look up the keys the state does not know. Ours first, its date kept in `pending` so that it is asked
    // once; a date older than the window is final (the node is not new, whatever the seed knows). A recent
    // one needs the seed's date too, and the seed is someone else's server: a few calls per round, slowly.
    let looked = 0, seedCalls = Number(process.env.SEED_CALLS || 40);
    // No call at all where the seed's list already shows the node is old: it heard the key in some map
    // area before the window opened, so the key's first day is earlier still.
    for (const n of repeaters) {
      const heard = seenBefore(seedBy.get(n.publicKey));
      if (!first[n.publicKey] && heard && heard < since) { first[n.publicKey] = heard; delete pending[n.publicKey]; looked++; }
    }
    // Ours, once per key: a first day older than the window settles it (not new, whatever the seed knows).
    for (const n of repeaters) {
      if (first[n.publicKey] || pending[n.publicKey]) continue;
      if (Date.now() > deadline) break;
      try {
        const f = Number((await ours(`/nodes/${n.id}`))?.firstSeen) || 0;
        if (f) pending[n.publicKey] = f;
      } catch (e) { if (process.env.DEBUG) console.warn(`${n.publicKey.slice(0, 6)}: ${e.message}`); }
    }
    for (const [k, f] of Object.entries(pending)) if (f < since || !seed) { first[k] = f; delete pending[k]; looked++; }
    // The seed for the recent ones: keys it does not list first (the likely new ones), then the newest.
    const order = repeaters.filter((n) => pending[n.publicKey])
      .sort((a, b) => (seedBy.has(a.publicKey) - seedBy.has(b.publicKey)) || (pending[b.publicKey] - pending[a.publicKey]));
    for (const n of order) {
      if (!seedOK || seedCalls < 2 || Date.now() > deadline) break;
      try {
        let f = pending[n.publicKey];
        // The seed may know the key under a map area outside our list: ask it by key.
        let id = seedBy.get(n.publicKey)?.id;
        if (!id) { seedCalls--; id = (await seed("/nodes", { pubkey: n.publicKey, limit: 1 }))?.items?.[0]?.id; }
        if (id) { seedCalls--; const fs = Number((await seed(`/nodes/${id}`))?.firstSeen) || 0; if (fs && fs < f) f = fs; }
        first[n.publicKey] = f; delete pending[n.publicKey]; looked++;
      } catch (e) { if (process.env.DEBUG) console.warn(`${n.publicKey.slice(0, 6)}: ${e.message}`); /* waits for the next round */ }
    }
    const left = repeaters.filter((n) => !first[n.publicKey]).length;

    // Firmware and hardware for the new observers, where their observer record has them.
    const others = [...mine, ...seeded].map((n) => ({ publicKey: n.publicKey, name: n.name, lat: n.lat, lng: n.lng, lastSeen: n.lastSeen }));
    const fresh = selectNew(repeaters, first, others, Date.now());
    const obsByName = new Map(observers.map((o) => [norm(o.displayName), o]));
    const nodes = [];
    for (const n of fresh) {
      const row = { publicKey: n.publicKey, name: n.name || "", lat: placed(n) ? n.lat : null, lng: placed(n) ? n.lng : null,
        firstSeen: n.firstSeen, lastSeen: n.lastSeen, isObserver: !!n.isObserver, possiblyForeign: !!n.possiblyForeign,
        iatas: (n.iatas || []).map((i) => i.iata), firmware: "", firmwareMin: version(n.minFirmwareVersion), hardware: "" };
      const o = n.isObserver && obsByName.get(norm(n.name));
      if (o) {
        try {
          const d = await ours(`/observers/${o.id}`);
          if (d?.publicKey === n.publicKey) { row.firmware = version(d.firmwareVersion || d.softwareVersion); row.hardware = d.hardwareModel || ""; }
        } catch { /* leave them out */ }
      }
      nodes.push(row);
    }

    save(nodes);
    console.log(`new repeaters: ${nodes.length} of ${repeaters.length}; dates known ${known} → ${Object.keys(first).length} (${looked} settled, ${left} left for next time, ${Object.keys(pending).length} waiting for the seed) in ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (e) {
    save(null);
    throw e;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(`new repeaters: ${e.message}`); process.exit(0); });
