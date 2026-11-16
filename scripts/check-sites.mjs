#!/usr/bin/env node
// Do the counties' own sites still answer? (plan 6.6: "an own site goes away"). Reads every `site`
// in data/lan/*.toml and asks it for its front page; a county whose site fails is reported, so its
// file's `site` can be emptied and the county gets its pages here again. Run monthly by CI.
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../data/lan/", import.meta.url);
let fail = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith(".toml")).sort()) {
  const m = /^site\s*=\s*"([^"]*)"/m.exec(readFileSync(new URL(f, dir), "utf8"));
  const site = m ? m[1] : "";
  if (!site) continue;
  try {
    const r = await fetch(site, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "meshcore-swe link check" } });
    if (r.ok) console.log(`ok   ${f}: ${site} (${r.status})`);
    else { console.log(`FAIL ${f}: ${site} answers ${r.status}`); fail = 1; }
  } catch (e) { console.log(`FAIL ${f}: ${site} (${e.message})`); fail = 1; }
}
process.exit(fail);
