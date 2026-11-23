// The pages' own link-preview pictures (scripts/og-pages.mjs): what a picture says, from a page's built HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardOf, lineOf, keyOf, LINE_MAX } from "../scripts/og-pages.mjs";

const words = JSON.parse(readFileSync(new URL("../data/og-cards.json", import.meta.url), "utf8"));
const page = ({ h1 = "Bygg en repeater", desc = "Kort mening. Och en till.", head = "", body = "" } = {}) =>
  `<!doctype html><html lang=sv><head><meta name=description content="${desc}">${head}</head><body>${body}<h1>${h1}</h1></body></html>`;

test("the key is the first 12 hex digits of the md5 of the path as Hugo writes it", () => {
  assert.equal(keyOf("/"), "6666cd76f969");
  assert.equal(cardOf("/västra-götaland/x/", page()).key, keyOf("/v%C3%A4stra-g%C3%B6taland/x/"));
});

test("an alias page and a page without a heading get no picture", () => {
  assert.equal(cardOf("/x/", `<html><head><meta http-equiv=refresh content="0; url=/y/"></head></html>`), null);
  assert.equal(cardOf("/x/", "<html lang=sv><body></body></html>"), null);
});

test("the line: the page's own, else the first sentence, else the description, never cut", () => {
  assert.equal(lineOf("Kort mening. Och en till.", "Egen rad."), "Egen rad.");
  assert.equal(lineOf("En första mening som är lagom lång för bilden. Och en till som inte ska med.", ""), "En första mening som är lagom lång för bilden.");
  assert.equal(lineOf("x".repeat(LINE_MAX + 1), ""), "");
});

test("label from the section, title from the heading, a guide in a hardware section gets the longer match", () => {
  const c = cardOf("/guider/skaffa-hardvara/antenn/", page({ h1: "Antenner" }));
  assert.equal(c.label, words.sections["/guider/skaffa-hardvara/"]);
  assert.equal(c.title, "Antenner");
  assert.equal(c.bg, "bg-se-wide.jpg");
  assert.deepEqual(c.chips, []);
});

test("a county's front page: its map, the county as label, the region in the line, the page's numbers", () => {
  const html = `<!doctype html><html lang=sv data-lan-page=14><head><meta name=description content="x"><meta property="og:title" content="MeshCore i Västra Götaland – karta"></head><body>
    <section class=hero><h1>MeshCore i Västra Götalands län</h1></section><div class=stats data-lan-scb=14><dl><div><dt>Repeatrar</dt><dd data-stat=repeaters>79</dd></div><div><dt>Observatörer</dt><dd data-stat=online>0</dd></div></dl></div>
    <code class=scope data-r=scope>se-vgr</code></body></html>`;
  const c = cardOf("/västra-götaland/", html);
  assert.equal(c.label, "Västra Götalands län");
  assert.equal(c.title, "MeshCore i Västra Götaland");
  assert.match(c.line, /se-vgr/);
  assert.deepEqual(c.chips, ["79 repeatrar"]);
  assert.equal(c.bg, "bg-14.jpg");
});

test("every written line fits, and every rule is a valid pattern", () => {
  for (const [url, p] of Object.entries(words.pages)) if (p.line) assert.ok(p.line.length <= LINE_MAX, `${url}: ${p.line.length} characters`);
  for (const r of words.rules) { new RegExp(r.match); assert.ok(r.line.length <= LINE_MAX + 10, r.match); }
});
