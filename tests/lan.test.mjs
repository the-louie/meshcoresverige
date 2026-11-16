// The county files (data/lan/<scb>.toml): one per county, only known keys, a unique address.
// The parser reads only the small TOML subset the files use, so anything else is refused too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../data/lan/", import.meta.url);
const SCB = ["01", "03", "04", "05", "06", "07", "08", "09", "10", "12", "13", "14", "17", "18", "19", "20", "21", "22", "23", "24", "25"];
const TOP = { scb: "s", slug: "s", short: "s", site: "s", checked: "d", iata: "s", center: "a", zoom: "n", place: "s", meshmapper: "s", text: "s", text_by: "s" };
const TABLES = {
  channels: { name: "s", purpose: "s", note: "s" },
  groups: { name: "s", url: "s" },
  wanted: { name: "s", lat: "n", lon: "n", note: "s" },
};

export function parse(src) {
  const out = {};
  let cur = out, schema = TOP, where = "top";
  src.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, "").replace(/^#.*$/, "").trim();
    if (!line) return;
    const t = line.match(/^\[\[(\w+)\]\]$/);
    if (t) {
      if (!TABLES[t[1]]) throw new Error(`line ${i + 1}: unknown table [[${t[1]}]]`);
      (out[t[1]] ||= []).push((cur = {}));
      schema = TABLES[t[1]]; where = t[1];
      return;
    }
    const m = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!m) throw new Error(`line ${i + 1}: not key = value`);
    const [, k, v] = m;
    const type = schema[k];
    if (!type) throw new Error(`line ${i + 1}: unknown key "${k}" in ${where}`);
    if (k in cur) throw new Error(`line ${i + 1}: "${k}" twice`);
    if (type === "s") { if (!/^"([^"\\]|\\.)*"$/.test(v)) throw new Error(`line ${i + 1}: ${k} must be a "string"`); cur[k] = JSON.parse(v); }
    else if (type === "n") { if (!/^-?\d+(\.\d+)?$/.test(v)) throw new Error(`line ${i + 1}: ${k} must be a number`); cur[k] = Number(v); }
    else if (type === "d") { if (!/^\d{4}-\d\d-\d\d$/.test(v)) throw new Error(`line ${i + 1}: ${k} must be a date YYYY-MM-DD`); cur[k] = v; }
    else if (type === "a") { if (!/^\[\s*(-?\d+(\.\d+)?\s*(,\s*-?\d+(\.\d+)?\s*)*)?\]$/.test(v)) throw new Error(`line ${i + 1}: ${k} must be [numbers]`); cur[k] = JSON.parse(v); }
  });
  return out;
}

export function checkCounty(file, c) {
  const errs = [];
  const scb = file.replace(/\.toml$/, "");
  if (!SCB.includes(scb)) errs.push(`${file}: no county has SCB code ${scb}`);
  if (c.scb !== scb) errs.push(`${file}: scb "${c.scb}" is not the file name`);
  if (!/^[a-zåäö]+(-[a-zåäö]+)*$/.test(c.slug || "")) errs.push(`${file}: slug "${c.slug}" must be lower-case words with hyphens`);
  if (!c.short) errs.push(`${file}: short is missing`);
  if (!c.checked) errs.push(`${file}: checked is missing`);
  if (c.site && !/^https:\/\/[^\s"]+\/$/.test(c.site)) errs.push(`${file}: site must be an https address ending in /`);
  if (c.meshmapper && !/^https:\/\//.test(c.meshmapper)) errs.push(`${file}: meshmapper must be an https address`);
  if (c.text_by && !c.text) errs.push(`${file}: text_by without text`);
  if (c.center && c.center.length !== 2) errs.push(`${file}: center is [lat, lon]`);
  for (const g of c.groups || []) if (!g.name || !/^https:\/\//.test(g.url || "")) errs.push(`${file}: a group needs a name and an https url`);
  for (const ch of c.channels || []) if (!/^#[a-z0-9-]+$/.test(ch.name || "")) errs.push(`${file}: channel "${ch.name}" must be #lower-case`);
  for (const w of c.wanted || []) if (!w.name || !(w.lat > 55 && w.lat < 69.1 && w.lon > 10.9 && w.lon < 24.2)) errs.push(`${file}: wanted place "${w.name}" needs a name and a position in Sweden`);
  return errs;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".toml")).sort();

test("there is one file per county, 21 in all", () => {
  assert.deepEqual(files, SCB.map((s) => `${s}.toml`));
});

test("every county file parses and passes its checks", () => {
  const errs = [];
  for (const f of files) {
    try { errs.push(...checkCounty(f, parse(readFileSync(new URL(f, DIR), "utf8")))); }
    catch (e) { errs.push(`${f}: ${e.message}`); }
  }
  assert.deepEqual(errs, []);
});

test("no two counties share an address", () => {
  const seen = new Map();
  for (const f of files) {
    const { slug } = parse(readFileSync(new URL(f, DIR), "utf8"));
    assert.ok(!seen.has(slug), `${f} and ${seen.get(slug)} both use /${slug}/`);
    seen.set(slug, f);
  }
});

test("the checks refuse what they should", () => {
  assert.throws(() => parse('scb = "08"\nfoo = "x"\n'), /unknown key "foo"/);
  assert.throws(() => parse('[[members]]\nname = "x"\n'), /unknown table/);
  assert.throws(() => parse('scb = 08\n'), /must be a "string"/);
  assert.match(checkCounty("08.toml", { scb: "09", slug: "kalmar", short: "K", checked: "2026-11-16" }).join(), /not the file name/);
  assert.match(checkCounty("11.toml", { scb: "11", slug: "x", short: "K", checked: "2026-11-16" }).join(), /no county has SCB code 11/);
  assert.match(checkCounty("08.toml", { scb: "08", slug: "Kalmar län", short: "K", checked: "2026-11-16" }).join(), /lower-case/);
  assert.match(checkCounty("08.toml", { scb: "08", slug: "kalmar", short: "K", checked: "2026-11-16", site: "http://x" }).join(), /https/);
  assert.match(checkCounty("08.toml", { scb: "08", slug: "kalmar", short: "K", checked: "2026-11-16", wanted: [{ name: "x", lat: 40, lon: 10 }] }).join(), /position in Sweden/);
});
