// Route QA checks C1–C7 + turn restrictions (C4). Ported verbatim; the two
// `$("#rhwy").checked` DOM reads in the original are replaced by the
// `highwaysOnly` parameter threaded in from the caller.
import { overpass } from "./net";
import { midCoord, rightCoord } from "./geo";
import type { Issue, LatLon, Restriction, Segment, Way } from "../types";

// severity thresholds (PLAN.md §7.5 defaults — tunable here)
export const SPEED_JUMP = 30; // km/h Δ between adjacent segments that counts as a jump
export const SPEED_MAX = 150; // km/h above which a value is implausible
export const GAP_MERGE_M = 250; // components whose endpoints are within this are treated as
// connected (a missing/un-reffed connector bridges them)
const ONEWAY_YES = new Set(["yes", "true", "1"]);
const ONEWAY_REV = new Set(["-1", "reverse"]);
const ONEWAY_OK = new Set([
  "yes",
  "true",
  "1",
  "-1",
  "reverse",
  "no",
  "false",
  "0",
  "reversible",
  "alternating",
]);

export function sortIssues(issues: Issue[]): Issue[] {
  const rank: Record<string, number> = { high: 0, med: 1, low: 2 };
  issues.sort((x, y) => rank[x.sev] - rank[y.sev]);
  return issues;
}

export function runChecks(
  ways: Way[],
  route: Segment[],
  comps: number[][],
  highwaysOnly: boolean,
): Issue[] {
  const issues: Issue[] = [];
  const link = (w: Way) => `https://www.openstreetmap.org/way/${w.id}`;
  const josm = (w: Way) => `https://www.openstreetmap.org/edit?way=${w.id}`;
  const at = (c: LatLon | null) => (c ? { lat: c[0], lon: c[1] } : null);

  // C1 — connectivity (routing islands): anything not in the main component.
  if (comps && comps.length > 1) {
    const MAX_ISLANDS = 25;
    const islands = comps.slice(1);
    islands.slice(0, MAX_ISLANDS).forEach((comp) => {
      const w = ways[comp[0]];
      const kmSum = comp.reduce((s, i) => s + ways[i].km, 0);
      issues.push({
        sev: "high",
        check: "Connectivity",
        detail: `Routing island — ${comp.length} way(s), ${kmSum.toFixed(2)} km, not connected to the main route (e.g. ${w.name}); no shared node and nothing within ${GAP_MERGE_M} m. Routing can't cross into this segment.`,
        where: at(midCoord(w)),
        link: link(w),
        josm: josm(w),
        wayId: w.id,
      });
    });
    if (islands.length > MAX_ISLANDS) {
      issues.push({
        sev: "high",
        check: "Connectivity",
        detail: `…and ${islands.length - MAX_ISLANDS} more disconnected island(s). The route is highly fragmented — check whether the search pulled in unrelated ways.`,
        where: null,
        link: null,
        josm: null,
        wayId: null,
      });
    }
  }

  // C2 — oneway consistency (per connected piece)
  route.forEach((seg) => {
    let withCount = 0,
      againstCount = 0;
    const oneways: { it: Segment[number]; w: Way; withFlow: boolean }[] = [];
    seg.forEach((it) => {
      const w = ways[it.wi];
      if (!w.oneway || w.oneway === "no" || w.oneway === "false" || w.oneway === "0")
        return;
      if (!ONEWAY_OK.has(w.oneway)) {
        issues.push({
          sev: "med",
          check: "Oneway",
          detail: `Invalid oneway value "${w.oneway}" on ${w.name}.`,
          where: at(midCoord(w)),
          link: link(w),
          josm: josm(w),
          wayId: w.id,
        });
        return;
      }
      if (ONEWAY_YES.has(w.oneway) || ONEWAY_REV.has(w.oneway)) {
        const dir = ONEWAY_YES.has(w.oneway) ? 1 : -1; // tagged allowed direction
        const withFlow = it.forward ? dir === 1 : dir === -1; // matches chain traversal?
        withFlow ? withCount++ : againstCount++;
        oneways.push({ it, w, withFlow });
      }
    });
    // minority direction in a clearly-directed chain → likely a reversed oneway
    const total = withCount + againstCount;
    if (total >= 4) {
      const flagWith = withCount < againstCount; // flag the smaller (minority) group
      const minCount = Math.min(withCount, againstCount);
      if (minCount > 0 && minCount / total <= 0.34) {
        oneways
          .filter((o) => o.withFlow === flagWith)
          .forEach((o) => {
            issues.push({
              sev: "med",
              check: "Oneway",
              detail: `Oneway runs against the route's dominant direction here (${o.w.oneway}) — possible reversed oneway, or an opposing divided-carriageway side.`,
              where: at(midCoord(o.w)),
              link: link(o.w),
              josm: josm(o.w),
              wayId: o.w.id,
            });
          });
      }
    }
  });

  // C3 — maxspeed sanity
  let missingCount = 0,
    missingKm = 0,
    firstMissing: Way | null = null;
  ways.forEach((w) => {
    if (!w.highway && highwaysOnly) return;
    if (w.maxspeed == null) {
      missingCount++;
      missingKm += w.km;
      if (!firstMissing) firstMissing = w;
    } else if (
      typeof w.maxspeed === "number" &&
      (w.maxspeed <= 0 || w.maxspeed > SPEED_MAX)
    ) {
      issues.push({
        sev: "med",
        check: "Maxspeed",
        detail: `Implausible maxspeed ${w.maxspeedRaw || w.maxspeed} on ${w.name}.`,
        where: at(midCoord(w)),
        link: link(w),
        josm: josm(w),
        wayId: w.id,
      });
    }
  });
  if (missingCount && firstMissing) {
    const fm: Way = firstMissing;
    issues.push({
      sev: "low",
      check: "Maxspeed",
      detail: `${missingCount} way(s) (${missingKm.toFixed(1)} km) have no maxspeed tag.`,
      where: at(midCoord(fm)),
      link: link(fm),
      josm: josm(fm),
      wayId: fm.id,
    });
  }
  // jumps between adjacent (connected) ways
  route.forEach((seg) => {
    for (let i = 0; i < seg.length - 1; i++) {
      const a = ways[seg[i].wi],
        b = ways[seg[i + 1].wi];
      if (typeof a.maxspeed === "number" && typeof b.maxspeed === "number") {
        const d = Math.abs(a.maxspeed - b.maxspeed);
        if (d >= SPEED_JUMP) {
          const coord = rightCoord(ways, seg[i]);
          issues.push({
            sev: "med",
            check: "Maxspeed",
            detail: `Speed jump ${a.maxspeed}→${b.maxspeed} km/h (Δ${d}) between ${a.name} and ${b.name}.`,
            where: at(coord),
            link: link(b),
            josm: josm(b),
            wayId: b.id,
          });
        }
      }
    }
  });

  // C5 — ref / name continuity
  route.forEach((seg) => {
    const seen = new Set<string>(); // dedupe identical transitions within a piece
    for (let i = 0; i < seg.length - 1; i++) {
      const a = ways[seg[i].wi],
        b = ways[seg[i + 1].wi];
      if (a.ref && b.ref && a.ref !== b.ref) {
        const key = a.ref + "|" + b.ref;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({
          sev: "low",
          check: "Ref continuity",
          detail: `Ref changes ${a.ref} → ${b.ref} along the route.`,
          where: at(rightCoord(ways, seg[i])),
          link: link(b),
          josm: josm(b),
          wayId: b.id,
        });
      }
    }
  });
  // aggregated missing ref (only when the route mostly carries a ref)
  const refWays = ways.filter((w) => w.ref).length;
  if (refWays >= Math.max(2, ways.length * 0.3)) {
    let miss = 0,
      missKm = 0,
      first: Way | null = null;
    ways.forEach((w) => {
      if (!w.ref && (!highwaysOnly || w.highway)) {
        miss++;
        missKm += w.km;
        if (!first) first = w;
      }
    });
    if (miss && first) {
      const f: Way = first;
      issues.push({
        sev: "low",
        check: "Ref continuity",
        detail: `${miss} way(s) (${missKm.toFixed(1)} km) have no ref, though the route mostly does.`,
        where: at(midCoord(f)),
        link: link(f),
        josm: josm(f),
        wayId: f.id,
      });
    }
  }

  // C6 — lanes / turn:lanes
  ways.forEach((w) => {
    const t = w.tags || {};
    const lanes = t.lanes != null ? Number(t.lanes) : null;
    if (t.lanes != null && (!Number.isInteger(lanes) || lanes! <= 0 || lanes! > 12)) {
      issues.push({
        sev: "low",
        check: "Lanes",
        detail: `Unusual lanes value "${t.lanes}" on ${w.name}.`,
        where: at(midCoord(w)),
        link: link(w),
        josm: josm(w),
        wayId: w.id,
      });
    }
    const tl = t["turn:lanes"];
    if (
      tl &&
      lanes != null &&
      Number.isInteger(lanes) &&
      (ONEWAY_YES.has(w.oneway) || ONEWAY_REV.has(w.oneway))
    ) {
      const count = tl.split("|").length;
      if (count !== lanes) {
        issues.push({
          sev: "low",
          check: "Lanes",
          detail: `turn:lanes lists ${count} lane(s) but lanes=${t.lanes} on ${w.name}.`,
          where: at(midCoord(w)),
          link: link(w),
          josm: josm(w),
          wayId: w.id,
        });
      }
    }
  });

  // C7 — access / barrier anomalies (way-level access tags)
  ways.forEach((w) => {
    const t = w.tags || {};
    const key =
      t.access != null
        ? "access"
        : t.motor_vehicle != null
          ? "motor_vehicle"
          : t.vehicle != null
            ? "vehicle"
            : null;
    if (!key) return;
    const v = t[key];
    if (v === "no" || v === "private") {
      issues.push({
        sev: "low",
        check: "Access",
        detail: `${key}=${v} on ${w.name} — vehicles may be barred from routing through here.`,
        where: at(midCoord(w)),
        link: link(w),
        josm: josm(w),
        wayId: w.id,
      });
    }
  });

  sortIssues(issues);
  return issues;
}

// ---------- C4: turn restrictions ----------
// Fetch type=restriction relations referencing any of the route's ways.
export async function fetchRestrictions(ways: Way[]): Promise<Restriction[]> {
  const ids = ways.map((w) => w.id);
  if (!ids.length) return [];
  const CHUNK = 600,
    seen = new Set<number>(),
    out: Restriction[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const q = `[out:json][timeout:90];way(id:${chunk.join(",")})->.w;relation(bw.w)["type"="restriction"];out geom;`;
    const json = await overpass(q);
    for (const el of json.elements || []) {
      if (el.type !== "relation" || seen.has(el.id)) continue;
      seen.add(el.id);
      out.push(parseRestriction(el));
    }
  }
  return out;
}

export function parseRestriction(el: any): Restriction {
  const t = el.tags || {};
  const restriction =
    t.restriction ||
    t["restriction:conditional"] ||
    t["restriction:hgv"] ||
    t["restriction:motorcar"] ||
    "";
  const r: Restriction = {
    id: el.id,
    restriction,
    from: [],
    to: [],
    via: [],
    viaWays: [],
  };
  (el.members || []).forEach((m: any) => {
    if (m.type === "node") {
      if (m.role === "via" && m.lat != null)
        r.via.push({ ref: m.ref, coord: [m.lat, m.lon] });
    } else if (m.type === "way") {
      const coords: LatLon[] = (m.geometry || []).map(
        (g: any) => [g.lat, g.lon] as LatLon,
      );
      if (m.role === "from") r.from.push({ ref: m.ref, coords });
      else if (m.role === "to") r.to.push({ ref: m.ref, coords });
      else if (m.role === "via") r.viaWays.push({ ref: m.ref, coords });
    }
  });
  return r;
}

// Validate each restriction's structure; flag only the broken ones.
export function checkRestrictions(restrictions: Restriction[]): Issue[] {
  const issues: Issue[] = [];
  const rl = (id: number) => `https://www.openstreetmap.org/relation/${id}`;
  const rj = (id: number) => `https://www.openstreetmap.org/edit?relation=${id}`;
  restrictions.forEach((r) => {
    let where: { lat: number; lon: number } | null = null;
    if (r.via.length && r.via[0].coord)
      where = { lat: r.via[0].coord[0], lon: r.via[0].coord[1] };
    else if (r.from.length && r.from[0].coords.length) {
      const c = r.from[0].coords[Math.floor(r.from[0].coords.length / 2)];
      where = { lat: c[0], lon: c[1] };
    }

    const probs: string[] = [];
    if (!r.restriction) probs.push("no restriction tag");
    else if (!/^(no_|only_)/.test(r.restriction))
      probs.push(`unusual restriction value "${r.restriction}"`);
    if (!r.from.length) probs.push("missing 'from' member");
    if (!r.to.length) probs.push("missing 'to' member");
    if (!r.via.length && !r.viaWays.length) probs.push("missing 'via' member");

    // node-via should be shared by both a from-way and a to-way
    if (r.via.length && r.via[0].coord && r.from.length && r.to.length) {
      const vk =
        r.via[0].coord[0].toFixed(6) + "," + r.via[0].coord[1].toFixed(6);
      const touches = (arr: { coords: LatLon[] }[]) =>
        arr.some((w) =>
          w.coords.some((c) => c[0].toFixed(6) + "," + c[1].toFixed(6) === vk),
        );
      if (!touches(r.from)) probs.push("'from' way doesn't meet the via node");
      if (!touches(r.to)) probs.push("'to' way doesn't meet the via node");
    }

    if (probs.length) {
      issues.push({
        sev: "med",
        check: "Turn restriction",
        detail: `${r.restriction || "restriction"} (relation ${r.id}): ${probs.join("; ")}.`,
        where,
        link: rl(r.id),
        josm: rj(r.id),
        wayId: null,
      });
    }
  });
  return issues;
}
