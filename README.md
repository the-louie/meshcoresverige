# meshcoresverige.se

The national MeshCore website for Sweden: the guides and wizards of the shared template, a
county chosen in the browser, and a front page with local pages for every county that has no
MeshCore site of its own. A county with its own site is linked, never copied.

Built with Hugo from
[sweden-mesh/meshcore-regional-template](https://github.com/sweden-mesh/meshcore-regional-template)
in national mode (`params.national = true`). This repository holds what is national: `hugo.toml`,
the county files under `data/lan/`, `content/om.md`, the Pages Functions and the headers.

Live data: the public API of https://beacon.meshcore-jkp.se, until the site's own Beacon name exists.

## County data

One file per county, `data/lan/<scb>.toml` (SCB county code). Anyone may correct one with a pull
request; see `CONTRIBUTING.md`.

## Build

Hugo ≥ 0.146 and Go:

```sh
hugo --gc --minify              # the site in public/, with the template tag in go.mod
scripts/preview.sh server       # local preview against ../meshcore-regional-template
npm test                        # county files and functions
```

## Functions and checks

- `functions/index.js`: `/` answers with the saved county's front page (cookie `lan`), the address
  unchanged; `functions/p/`: the Plausible proxy, shut until `PLAUSIBLE_SCRIPT` is set.
- `npm test`: the county files' schema and the functions.
- `scripts/check-sites.mjs` (monthly in CI): the counties' own sites still answer.

## Deploy

`.github/workflows/deploy.yml` builds on every push and pull request, and every 6 h from `main`
(cron), so the Beacon numbers on the county pages and /nya-repeatrar/ follow the network without a
commit. The Cloudflare Pages deploy runs when the repository variable `DEPLOY_ENABLED` is `true`.

Before Hugo, `scripts/new-repeaters.mjs` writes `data/new_repeaters.json` (the repeaters first heard
in the last 7 days) and `static/data/first-seen.json` (every first-heard date found so far, which the
next run reads back from the live site, so only new keys are looked up). Both are build output, never
committed. A key the seed's list shows was heard before the window is settled without a call; the rest
are asked of our Beacon once each, and of the seed (another operator's server) at most 40 calls a run.

After a production deploy, `scripts/indexnow.mjs` sends the URLs that are new or whose `<lastmod>`
changed (the live sitemap before the deploy against the new one) to IndexNow; the key is
`static/<key>.txt`.

### Release step: the sitemap to Google, at most once a day

After a release is verified live, from the workspace (the Search Console service account stays there):

```sh
python3 planning/meshcore-jkp.se/tools/gsc.py submit-daily sc-domain:meshcoresverige.se https://meshcoresverige.se/sitemap.xml
```

`submit-daily` reads `lastSubmitted` and skips the submit when it is under 24 h old, so several
releases in a day submit once.
