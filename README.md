# meshcore-swe.se

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

`.github/workflows/deploy.yml` builds on every push and pull request. The Cloudflare Pages
deploy is off until the domain and the Pages project exist (repository variable
`DEPLOY_ENABLED=true`).
