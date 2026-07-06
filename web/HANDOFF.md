# RouteSense (React port) — Developer Handoff

This is a **React 18 + TypeScript + Vite** port of RouteSense, an OpenStreetMap
route-QA + edit-mileage tool. It is a **static, client-only** app — no backend.
All data comes from the public **OSM API** and **Overpass API** at runtime.

Origin: 1:1 functional port of a single-file `index.html` (vanilla JS + Leaflet).
The logic was preserved and split into framework-agnostic modules; React only
handles view + state.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/
npm run build      # static output in dist/
npm run typecheck  # tsc --noEmit
```

Node 18+ (built/tested on Node 20 in CI, Node 24 locally). No env vars, no
secrets, no server.

> If `npm install` warns that esbuild's install script was skipped (npm's
> newer script-blocking default), run `npm rebuild esbuild` once.

---

## Architecture

```
src/
  main.tsx            # React entry
  App.tsx             # header + mode tabs; mounts both modes (toggled via display)
  styles.css          # all styling (ported verbatim; plain classes, no CSS modules)
  types.ts            # shared domain types

  lib/                # PURE, framework-agnostic — no React imports. Lift these freely.
    net.ts            # OSM + Overpass fetch, 3-endpoint Overpass fallback
    geo.ts            # haversine, polylineKm, coord helpers
    osm.ts            # OsmChange/XML parsing, changeset geometry, inspector features
    route.ts          # ordered route assembly + connectivity (union-find + 250m coalesce)
    checks.ts         # route QA checks C1–C7 + turn restrictions; severity thresholds
    query.ts          # Overpass query builders + keyword regex
    csv.ts            # CSV builders + download
    util.ts           # esc() (for Leaflet popups only) + date fmt
    leaflet.ts        # Leaflet accessor (see "Leaflet" below)

  hooks/
    useLeafletMap.ts  # creates/owns one Leaflet map per container div

  components/         # view + local state only
    ContributorMode.tsx   # "By contributor": load changesets, mileage, inspector
    ChangesetList.tsx
    ChangesetInspector.tsx # OSMCha-style tag-diff + map highlight
    MileageReadout.tsx
    RoadMode.tsx          # "By road": Overpass query -> assemble -> checks -> report
    RoadReadout.tsx       # report card, issues table, ways table, route map
    RoadSidebar.tsx       # maxspeed distribution
    Maps.tsx              # MileageMap / InspectMap / RouteMap (imperative Leaflet in effects)
    CsvButtons.tsx        # Copy/Download CSV pair
```

**State:** each mode component holds its own state (`useState`); no global store,
no Context. `oscCache` is a `useRef<Map>`. The two modes are fully independent.

---

## Integration notes (merging into a bigger tool)

- **Business logic is isolated in `src/lib/`** — pure functions, no React, no DOM
  (except the OsmChange XML parsing, which uses the browser `DOMParser`). These
  are the pieces most worth reusing directly.
- **Leaflet is loaded via a CDN `<script>` in `index.html`**, not an npm
  dependency, and accessed through `src/lib/leaflet.ts` (`getL()` → `window.L`).
  If the host app bundles Leaflet, replace `getL()` with `import * as L from
  "leaflet"` (and add `leaflet` + `@types/leaflet` to deps, plus its CSS).
- **`base: "/roadmeter/"`** in `vite.config.ts` is applied only for the production
  build (GitHub Pages project path). Change or remove it for any other host /
  mount path.
- **Styling** is one global `styles.css` with plain class names (matches the
  original design). Namespace or scope it if merging into an app with global CSS.
- **No routing library** — mode switching is local state. Swap for the host app's
  router if needed.
- **Network:** `src/lib/net.ts` hits `api.openstreetmap.org` and three public
  Overpass endpoints (fallback in order). No API keys. Rate limits apply to
  Overpass; large queries can be heavy.

## What the tool does (functional summary)

- **By contributor:** enter an OSM username (+ optional date range) → list
  changesets → select several to compute edited km, or click one to inspect it
  (tag diffs, created/modified/deleted geometry, moved nodes, old shapes via
  Overpass augmented diff). CSV export.
- **By road:** search a route (relation by name/ref/id, or ways sharing a `ref`)
  → assembles an ordered route, runs checks C1–C7 (connectivity/routing islands,
  oneway consistency, maxspeed sanity, turn restrictions, ref continuity, lanes,
  access) → severity-ranked issues table + map markers + CSV. Flags only; deep-
  links to the iD editor for fixes.

Severity thresholds and tunables live at the top of `src/lib/checks.ts`
(`SPEED_JUMP`, `SPEED_MAX`, `GAP_MERGE_M`, oneway sets).

---

## Known deviation from the original

The original single-file version had a CSS bug: the road-mode map container
(`#rmap`) had no height rule, so that map effectively didn't render. This port
adds a `#rmap` height rule in `styles.css` so the route map displays as intended.