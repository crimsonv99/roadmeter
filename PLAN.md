# Plan — Route Traffic-Guidance QA (O3KR3 · KR 3)

> **Status:** Draft for review — *no code written yet.*
> **Owner:** map operation engineer (you) · **Tool:** extends Roadmeter (`roadmeter.html`)
> **Maps to:** O3KR3.3 — "Develop a toolset to check traffic-guidance (navigation/routing) data along a route."

---

## 1. Goal

Turn Roadmeter's **By road** mode from a single maxspeed-coverage view into a **route QA report card**: pick a road (relation by name/ref/id), run a battery of navigation-data checks, and get a prioritized list of issues — *where* they are on the map and *why* they matter for routing.

Think "OSMCha for route correctness" — but focused on whether a navigation engine could follow this road end-to-end without errors.

**Definition of done (KR 3):** Given a route relation, the tool reports — with map locations and CSV export — every: connectivity gap, oneway contradiction, missing/invalid turn restriction, speed anomaly, and attribute-completeness gap, ranked by severity.

---

## 2. Scope

**In scope**
- Read-only QA over OSM data (OSM API + Overpass), in the browser. No backend.
- Route = an OSM relation (or a set of ways sharing a ref).
- Checks listed in §4.

**Out of scope (other KRs / other people)**
- Login, accounts, backend, the internal Spatial DB Server (KR 3.1 — software engineers).
- Approve/reject *write-back* (KR 3.2 — needs backend).
- POI/contributor data (KR 2b).
- Editing OSM. This tool *flags*; humans fix in iD/JOSM (we'll deep-link to them).

---

## 3. How it fits the current tool

Reuse what already exists in `roadmeter.html`:
- relation → ways resolution (Overpass `rel(...);way(r);out geom tags;`)
- per-way geometry, length, maxspeed parsing
- the coverage-bar + distribution + per-way table + Leaflet map + CSV pattern

New pieces:
- **Ordered route assembly** — sort relation member ways into a connected chain (current code treats ways as an unordered bag).
- A **check registry** — each check is a small function `(route) -> issues[]`, so we can add checks incrementally.
- A **report card** UI — headline scores + a severity-sorted issues table + map markers for each issue.

---

## 4. The checks (prioritized)

Severity legend: 🔴 blocks/breaks routing · 🟠 degrades guidance · 🟡 completeness/quality.

| # | Check | What it flags | Severity | Data source | Phase |
|---|-------|---------------|----------|-------------|-------|
| C1 | **Connectivity / continuity** | Consecutive route ways don't share an end node; gaps; dangling ends | 🔴 | relation members + way nd refs | 1 |
| C2 | **Oneway consistency** | Direction flips along route; oneway on a through-route segment that contradicts neighbors; `oneway=-1` handling | 🔴 | `oneway` tag + node order | 1 |
| C3 | **Maxspeed sanity** | Missing maxspeed; implausible values; large jumps between adjacent segments | 🟠 | `maxspeed*` tags (already parsed) | 1 |
| C4 | **Turn restrictions** | `type=restriction` relations on route junctions: missing where expected, invalid from/via/to membership, conflicting | 🟠 | `relation(bn)`/`node(w)` around junctions | 2 |
| C5 | **Name / ref continuity** | `ref`/`name` changes mid-route, missing ref on members | 🟡 | member tags | 2 |
| C6 | **Lanes & turn:lanes** | Missing `lanes`; `turn:lanes` count mismatch; missing `destination` at junctions | 🟡 | way tags + junction nodes | 3 |
| C7 | **Access / barrier anomalies** | Unexpected `access=no/private`, `barrier=gate` mid-route without context | 🟡 | tags + nodes | 3 |
| ~~C8~~ | ~~Reference speed compare~~ | **Dropped** — Waze data is WME/Tampermonkey-only, can't run standalone | — | — | — |

**Phase 1 = C1–C3** (the routing-breakers + the baseline you already have). That's the demoable MVP.

---

## 5. UX / output

- **Report card header** (like the OSM Lane Visualizer screenshot): total length, % maxspeed coverage, # of 🔴/🟠/🟡 issues.
- **Issues table**, sorted by severity: `Severity | Check | Where (way/node link) | Detail | Fix-in iD/JOSM ↗`.
- **Map**: route drawn; issues as markers/highlights (red gap markers, amber arrows for oneway, etc.). Click an issue row → zoom to it.
- **CSV export** of all issues (reuse existing CSV helper).

---

## 6. Phasing & milestones

- **M1 (MVP):** ✅ *Done (2026-06-18, deployed).* Ordered route assembly + C1, C2, C3 + report card + issues table + issues CSV + "ways by ref" search.
- **M2:** C4 (turn restrictions) + C5 (ref/name continuity).
- **M3:** C6, C7, polish (deep-links, severity tuning).

---

## 7. Decisions (resolved)

1. **Route definition:** ✅ **Both.** Support OSM **route relations** *and* "all ways sharing a `ref` (e.g. `ref=QL51`) in a country/bbox" for unrelationed roads. The route assembler takes either source and produces the same ordered-chain structure. For ref-based input, connectivity (C1) is best-effort — we order by node adjacency and report the gaps rather than assuming a clean chain.
2. **Direction:** ✅ Validate whatever `oneway`/carriageway tags exist (handle `oneway=yes/-1/no`, divided carriageways). No user tuning needed — C2 checks direction consistency along the assembled chain.
3. **Turn restrictions (C4, Phase 2):** ✅ **List/validate existing only** — no prediction of missing restrictions. (Recommended default.)
4. **Reference data (C8):** ✅ **Dropped.** Waze comparison stays out — Tampermonkey/WME-only, runs only inside the Waze editor runtime. KR 3 = OSM-internal consistency. C8 removed from the roadmap.
5. **Severity thresholds (defaults, tunable later):** maxspeed jump anomalous at **Δ ≥ 30 km/h** between adjacent segments; missing maxspeed = 🟠; connectivity gap > ~5 m between consecutive way endpoints = 🔴.

**→ Unblocked. Proceeding to M1.**

---

## 8. Risks / limits

- **Overpass load:** large national routes (e.g. full QL51) = big queries. Mitigate with the existing 3-endpoint fallback + per-relation scoping.
- **Unrelationed roads:** if a road has no route relation, C1/C2 ordering is unreliable — see decision #1.
- **Connectivity false positives:** legitimate cases (ferries, roundabouts, dual carriageway splits) need allowlisting so we don't cry wolf.
- This is a **flagging** tool; it never edits OSM.

---

### Next step
Review §7 decisions. Once you confirm, I'll start **M1** (ordered route assembly + C1–C3 + report card) and keep it on the same GitHub Pages deploy.
