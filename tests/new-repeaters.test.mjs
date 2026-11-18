import { test } from "node:test";
import assert from "node:assert/strict";
import { selectNew, version, metres, seenBefore, DAY } from "../scripts/new-repeaters.mjs";

const now = Date.UTC(2026, 10, 20);
const node = (publicKey, extra = {}) => ({ publicKey, name: publicKey, lat: 57.78, lng: 14.16, lastSeen: now, ...extra });

test("new: first heard within 7 days, newest first; older or unknown dates are not new (B-362)", () => {
  const first = { a: now - 2 * DAY, b: now - 8 * DAY, d: now - 1 * DAY };
  const nodes = [node("a", { lat: 57 }), node("b", { lat: 58 }), node("c", { lat: 59 }), node("d", { lat: 60 })];
  assert.deepEqual(selectNew(nodes, first, nodes, now).map((n) => n.publicKey), ["d", "a"]);
});

test("re-keyed: the same name as an older key is not new; a different name is (B-362)", () => {
  const first = { old: now - 30 * DAY, fresh: now - DAY, other: now - DAY };
  const old = node("old", { name: "SE-JKG-Söder ", lat: 57.7, lastSeen: now - 3 * DAY });
  const fresh = node("fresh", { name: "se-jkg-söder", lat: 57.9 });
  const other = node("other", { name: "SE-JKG-Söder-2", lat: 58.1 });
  assert.deepEqual(selectNew([fresh, other], first, [old, fresh, other], now).map((n) => n.publicKey), ["other"]);
});

test("re-keyed: within 50 m of a node last heard before the new key appeared is not new; beside a live one is (B-362)", () => {
  const first = { gone: now - 30 * DAY, live: now - 30 * DAY, n1: now - DAY, n2: now - DAY };
  const gone = node("gone", { lat: 57.0, lng: 14.0, lastSeen: now - 2 * DAY });
  const live = node("live", { lat: 58.0, lng: 14.0, lastSeen: now });
  const n1 = node("n1", { lat: 57.0002, lng: 14.0 });
  const n2 = node("n2", { lat: 58.0002, lng: 14.0 });
  assert.deepEqual(selectNew([n1, n2], first, [gone, live, n1, n2], now).map((n) => n.publicKey), ["n2"]);
});

test("version and metres", () => {
  assert.equal(version("esp32s3-v1.17.0-observer-autoreply-observer-113bc21b"), "1.17.0");
  assert.equal(version("1.14.0+"), "1.14.0");
  assert.equal(version(undefined), "");
  assert.ok(Math.abs(metres({ lat: 57, lng: 14 }, { lat: 57.001, lng: 14 }) - 110.6) < 1);
});

test("seenBefore: the earliest of lastSeen and the map areas' lastHeard, 0 without any (B-362)", () => {
  assert.equal(seenBefore({ lastSeen: 900, iatas: [{ iata: "MMX", lastHeard: 800 }, { iata: "KLR", lastHeard: 300 }] }), 300);
  assert.equal(seenBefore({ lastSeen: 900 }), 900);
  assert.equal(seenBefore(undefined), 0);
});
