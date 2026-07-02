# RouteSense (React + TypeScript + Vite)

A 1:1 React/TypeScript port of the original single-file `../index.html`
(RouteSense — OSM route navigation-data QA + edit mileage). Same two modes,
same checks (C1–C7), same visual design; no backend. Leaflet is still loaded
from a CDN (see `index.html`), so it's not bundled.

## Prerequisites

Node.js (18+) and npm — **not currently installed on this machine.** Install
one of:

- Official installer: https://nodejs.org (LTS)
- Homebrew: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` then `brew install node`
- nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash` then `nvm install --lts`

## Run

```bash
cd web
npm install
npm run dev        # http://localhost:5173/roadmeter/
```

## Build / preview (production, GitHub Pages layout)

```bash
npm run build      # type-checks then builds to web/dist
npm run preview    # serve the built site with the /roadmeter/ base path
```

`vite.config.ts` sets `base: "/roadmeter/"` to match the GitHub Pages project
URL (`https://<user>.github.io/roadmeter/`). For local dev the base is applied
automatically (the dev URL includes `/roadmeter/`). Set `base: "/"` if you host
at a domain root.

## Structure

```
src/
  App.tsx              header + mode tabs
  lib/                 pure logic (no React) — net, geo, osm, route, checks, query, csv
  hooks/useLeafletMap  Leaflet map lifecycle
  components/
    ContributorMode    changeset search + mileage + OSMCha-style inspector
    RoadMode           route QA report card (C1–C7)
    Maps               Leaflet draw components (route / inspect / mileage)
```

## Deviation from the original

The original CSS only sized `#map` (300 px); the road-mode map div is `#rmap`
and had **no height rule**, so the road map rendered at 0 px. This port adds an
`#rmap` height rule so the documented "click an issue row to zoom the map"
behaviour is actually visible.
