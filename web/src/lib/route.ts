// Ordered route assembly + connectivity (union-find + 250m coalesce). Ported verbatim.
import { haversine } from "./geo";
import type { LatLon, Segment, Way } from "../types";

// Greedy walk over shared endpoint nodes → array of segments, each an ordered
// list of {wi, forward}. forward = traversed node0→nodeLast (left→right in chain).
export function assembleRoute(ways: Way[]): Segment[] {
  const ep = new Map<string, { wi: number; end: number }[]>(); // endpoint key -> [{wi, end}]
  ways.forEach((w, wi) =>
    [0, 1].forEach((end) => {
      const k = w.endKeys[end];
      if (!ep.has(k)) ep.set(k, []);
      ep.get(k)!.push({ wi, end });
    }),
  );
  const used = new Array(ways.length).fill(false);

  function extend(seq: Segment, key: string, dir: "fwd" | "back") {
    while (true) {
      const cands = (ep.get(key) || []).filter((c) => !used[c.wi]);
      if (!cands.length) return;
      const { wi, end } = cands[0];
      used[wi] = true;
      const other = end === 0 ? 1 : 0;
      const forward = dir === "fwd" ? end === 0 : end === 1;
      if (dir === "fwd") seq.push({ wi, forward });
      else seq.unshift({ wi, forward });
      key = ways[wi].endKeys[other];
    }
  }

  // seed order: ways touching a degree-1 endpoint first (true route ends)
  const deg = (k: string) => (ep.get(k) || []).length;
  const seeds = ways
    .map((_w, wi) => wi)
    .sort((a, b) => {
      const da = Math.min(deg(ways[a].endKeys[0]), deg(ways[a].endKeys[1]));
      const db = Math.min(deg(ways[b].endKeys[0]), deg(ways[b].endKeys[1]));
      return da - db;
    });

  const segments: Segment[] = [];
  for (const wi of seeds) {
    if (used[wi]) continue;
    used[wi] = true;
    const seq: Segment = [{ wi, forward: true }];
    extend(seq, ways[wi].endKeys[1], "fwd");
    extend(seq, ways[wi].endKeys[0], "back");
    segments.push(seq);
  }
  return segments;
}

// Real connectivity: union-find over ALL shared nodes (not just endpoints), so
// ways meeting at a junction count as connected. Returns arrays of way indices,
// one per connected component, largest (by km) first — "routing islands" = the rest.
export function connectedComponents(ways: Way[]): number[][] {
  const parent = ways.map((_w, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const firstWayAt = new Map<string, number>(); // node key -> first way index seen
  ways.forEach((w, wi) => {
    for (const k of w.nodeKeys) {
      if (firstWayAt.has(k)) union(wi, firstWayAt.get(k)!);
      else firstWayAt.set(k, wi);
    }
  });
  const comps = new Map<number, number[]>();
  ways.forEach((_w, wi) => {
    const r = find(wi);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(wi);
  });
  const arr = [...comps.values()];
  const kmOf = (comp: number[]) => comp.reduce((s, i) => s + ways[i].km, 0);
  arr.sort((a, b) => kmOf(b) - kmOf(a));
  return arr;
}

// Merge components whose endpoints are within maxGapM of each other — in
// "ways by ref" mode the connecting/intersection ways often lack the ref and
// are excluded, leaving artificial sub-metre-to-~hundred-metre gaps. Uses a
// grid hash over endpoints so it stays near-linear. Genuinely far-apart
// components (real routing islands) survive.
export function coalesceComponents(
  ways: Way[],
  comps: number[][],
  maxGapM: number,
): number[][] {
  if (comps.length < 2) return comps;
  const compOf = new Map<number, number>();
  comps.forEach((c, ci) => c.forEach((wi) => compOf.set(wi, ci)));
  const parent = comps.map((_c, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const cell = maxGapM / 111320; // ~degrees per metre (lat); fine at VN latitudes
  const eps: { p: LatLon; ci: number }[] = [];
  ways.forEach((w, wi) => {
    const ci = compOf.get(wi)!;
    [w.coords[0], w.coords[w.coords.length - 1]].forEach((p) =>
      eps.push({ p, ci }),
    );
  });
  const grid = new Map<string, number[]>();
  eps.forEach((e, idx) => {
    const k = Math.round(e.p[0] / cell) + ":" + Math.round(e.p[1] / cell);
    (grid.get(k) || grid.set(k, []).get(k)!).push(idx);
  });
  for (const e of eps) {
    const gi = Math.round(e.p[0] / cell),
      gj = Math.round(e.p[1] / cell);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const arr = grid.get(gi + di + ":" + (gj + dj));
        if (!arr) continue;
        for (const oidx of arr) {
          const o = eps[oidx];
          if (o.ci === e.ci) continue;
          if (haversine(e.p[0], e.p[1], o.p[0], o.p[1]) <= maxGapM)
            union(e.ci, o.ci);
        }
      }
  }
  const merged = new Map<number, number[]>();
  comps.forEach((c, ci) => {
    const r = find(ci);
    if (!merged.has(r)) merged.set(r, []);
    merged.get(r)!.push(...c);
  });
  const out = [...merged.values()];
  const kmOf = (comp: number[]) => comp.reduce((s, i) => s + ways[i].km, 0);
  out.sort((a, b) => kmOf(b) - kmOf(a));
  return out;
}
