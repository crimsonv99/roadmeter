# RouteSense — Progress Report

**Tool:** RouteSense — route navigation-data QA for OpenStreetMap
**Live:** https://crimsonv99.github.io/roadmeter/
**Maps to:** O3KR3 · KR 3 — *toolset to check traffic-guidance (chỉ dẫn giao thông) data along a route*
**Status as of 2026-06-19:** Full planned check set (C1–C7) shipped and deployed; self-tested on real data.

---

## 1. What it is

A standalone, browser-only QA tool (no backend, no install) that reads OpenStreetMap data directly from the **OSM API** and **Overpass API** and flags problems in road/route data. It runs entirely client-side and is hosted as a static page on GitHub Pages.

It has two modes:

- **By road** *(the KR 3 deliverable)* — pick a road and get a **route QA report card**: a battery of navigation-data checks, a severity-ranked issue list, map markers, and CSV export.
- **By contributor** — measure a mapper's edit mileage per changeset, with an OSMCha-style changeset inspector (map highlight, tag diffs, moved nodes, deleted/old geometry).

Built from two earlier internal tools (a changeset-km calculator and a WME Waze/OSM speed-compare userscript). The Waze comparison was intentionally dropped from the web tool because that data only exists inside the Waze Map Editor runtime.

---

## 2. The route checks (the core of KR 3)

Given a road, RouteSense assembles it into an ordered, connected route and runs these checks. Severity: 🔴 breaks routing · 🟠 degrades guidance · 🟡 completeness/quality.

| # | Check | What it flags | Severity |
|---|-------|---------------|----------|
| C1 | **Connectivity** | "Routing islands" — segments not joined to the main route by any shared node (the router can't cross into them) | 🔴 |
| C2 | **Oneway consistency** | Invalid `oneway` values; segments running against the route's dominant direction (possible reversed oneway) | 🟠 |
| C3 | **Maxspeed sanity** | Missing `maxspeed`; implausible values (>150); large jumps (≥30 km/h) between adjacent segments | 🟠 / 🟡 |
| C4 | **Turn restrictions** | Structurally broken `type=restriction` relations: missing restriction tag or from/via/to members; via node not shared by the from/to ways | 🟠 |
| C5 | **Ref continuity** | `ref` changes mid-route; ways missing a `ref` when the route mostly carries one | 🟡 |
| C6 | **Lanes / turn:lanes** | Unusual `lanes` values; `turn:lanes` count not matching `lanes` on oneway segments | 🟡 |
| C7 | **Access** | `access` / `vehicle` / `motor_vehicle` = `no`/`private` mid-route (vehicles may be barred) | 🟡 |

**Output:** a report card (total km, maxspeed coverage %, connected-component count, restriction count, 🔴/🟠/🟡 tallies), a severity-sorted issues table (filterable to 🔴/🟠 only; click a row to zoom the map; per-issue deep-link into the iD editor), route + issue markers on a Leaflet map, and CSV export of both the issues and the per-way breakdown.

---

## 2b. Changeset review (By contributor mode)

The second mode is a **changeset review / edit-audit** tool — the slice that maps to reviewing OSM changes (KR 2a). You enter an OSM username (and optional date range) and get every changeset, newest first.

- **Edit mileage:** select one or many changesets and it computes how many km of road each one created/modified (highways-only optional), with a per-changeset breakdown and CSV export — useful for measuring contributor output.
- **OSMCha-style changeset inspector:** click any changeset and it shows *what actually changed*:
  - The map **zooms to the edit area** and highlights the geometry — created (green), modified (amber), deleted (red).
  - A **per-element attribute diff table**: for every created/modified/deleted node, way, and relation, it shows the tag changes vs the previous version (`+ added`, `− removed`, `~ changed`).
  - **Moved nodes** are drawn as a before→after arrow with the distance moved.
  - **Deleted and previous geometry** (the old shape of edited ways) is reconstructed via the Overpass **augmented diff** and drawn dashed, so you can see what a way looked like before the edit — close to OSMCha parity.
  - Direct deep-links to the changeset on **OSM** and **OSMCha**.

This makes the tool usable for **editorial review of a mapper's work**, not just route QA.

---

## 3. Search flexibility

- **Search by:** relation (name / ref / id), or **ways by ref** (for roads with no route relation — common in Vietnam).
- **Multiple variants:** the query accepts `;`-separated alternatives so one search catches inconsistent OSM tagging, e.g. `QL1; Quốc lộ 1; QL.1`.
- **Match mode:** *Exact keyword* (value equals the keyword, or is a token in a `;`-list — `QL1` matches `QL1;AH1` but not `QL1A`) or *Almost (partial)* (substring).
- **Country scoping** and **highways-only** filter.

---

## 4. How it works (architecture)

- **Route assembly:** relation members (or ways sharing a ref) are walked end-to-end via shared endpoint nodes into ordered chains, used for adjacency-based checks (oneway direction, speed jumps, ref changes).
- **Connectivity:** a union-find over **all** shared nodes computes connected components ("routing islands"), then a coalescing step merges components whose endpoints are within **250 m** of each other — because connector/intersection ways often lack the road's ref and would otherwise create false gaps. This is the standard routing-network connectivity approach from the OSM data-quality literature, tuned for ref-based queries.
- **Resilience:** all Overpass calls fall back across three public endpoints; large/heavy queries (e.g. augmented-diff) are size-gated; failures in optional steps (like turn restrictions) don't break the rest of the report.

---

## 5. Testing done

The connectivity logic was self-tested with the actual code (not copies):

- **Unit tests (synthetic graphs), 7/7 passing:** simple chains, branches at junctions (must stay 1 component, not fragment), genuine islands, interior shared-node intersections, and the coordinate-fallback path used when Overpass omits node IDs.
- **Real end-to-end test on QL51** (328 ways via live Overpass): exposed that early connectivity over-reported (3 "islands" that were only 11 m and ~135 m apart — missing un-reffed connectors). Added the 250 m coalescing step; QL51 now correctly reports **1 connected route / 0 connectivity issues**, while segments genuinely >250 m apart still flag.

---

## 6. Where this sits against O3KR3

- **KR 3 (route traffic-guidance QA):** the substantive, demoable deliverable — connectivity, oneway, maxspeed, turn restrictions, lanes, access, ref continuity. **Covered.**
- **KR 2a (review/diff of OSM changes):** the contributor mode's OSMCha-style changeset inspector covers the *review/diff* slice. **Partially covered.**
- **Not in this tool (other people's lanes):** login/auth and the business-function shell (KR 3.1), approve/write-back into the internal Spatial DB Server (KR 3.2), and the POI/place data pipeline (KR 2b). These need backend/infrastructure work outside a browser-only tool.

---

## 7. Known limitations

- **Ways-by-ref connectivity is approximate.** Roads without a route relation rely on the ref tag, so un-reffed connectors are invisible; the 250 m coalesce mitigates this but a proper route *relation* gives exact connectivity.
- **Oneway / speed-jump checks** use greedy ordered chains, so on heavily-branched routes they evaluate per-chain rather than across the whole network.
- **Turn restrictions:** node-via restrictions are geometrically validated; way-via cases are detected as present but not fully validated. Missing-restriction *prediction* is out of scope by design (we validate what exists).
- **Flagging tool only** — RouteSense never edits OSM; it deep-links to iD/JOSM for the human fix.
- Large national routes produce heavy Overpass queries; scoping by country/segment helps.

---

## 8. Suggested next steps

1. **Field validation** with the map-ops team across road types (divided highways, routes with restrictions) to tune severity thresholds.
2. Decide whether the ref-based connectivity tolerance (250 m) and the maxspeed jump threshold (30 km/h) match Vietnamese road realities.
3. If KR 3 needs write-back/approval, that's the backend track (KR 3.1/3.2) — coordinate with the software engineers; RouteSense can feed it the issue list (CSV/JSON).
