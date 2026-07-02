// OSM/OsmChange parsing + geometry + changeset-inspector feature building.
// Ported verbatim from the vanilla script.
import { OSM, httpGet, overpass, overpassText } from "./net";
import { haversine, polylineKm } from "./geo";
import type {
  Actions,
  AdiffWays,
  ChangesetMeta,
  DiffRow,
  Features,
  LatLon,
  OldInfo,
  OscElement,
  Tags,
  TagDiff,
  WayGeom,
} from "../types";

// inspector caps (mirrors the original module-level constants)
export const MAX_DIFF = 120; // cap elements we fetch a "before" version for
export const MAX_ROWS = 400; // cap rows rendered in the attribute table
export const MAX_ADIFF_DEG = 0.6; // skip augmented diff over very large bboxes

// parse maxspeed like the WME script did: number when possible, else raw string
export function parseMaxspeed(tags: Tags): number | string | null {
  const raw = tags.maxspeed || tags["maxspeed:forward"] || tags["maxspeed:backward"];
  if (!raw) return null;
  const m = String(raw).match(/\d+/);
  return m ? Number(m[0]) : String(raw);
}

export async function wayGeometry(ids: number[]): Promise<Map<number, WayGeom>> {
  const map = new Map<number, WayGeom>(),
    CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const q = `[out:json][timeout:120];way(id:${chunk.join(",")});out geom tags;`;
    const json = await overpass(q);
    for (const el of json.elements || []) {
      if (el.type !== "way" || !el.geometry) continue;
      const t: Tags = el.tags || {};
      map.set(el.id, {
        km: polylineKm(el.geometry),
        highway: !!t.highway,
        ref: t.ref || t.name || "",
        maxspeed: parseMaxspeed(t),
        coords: el.geometry.map((g: any) => [g.lat, g.lon] as LatLon),
      });
    }
  }
  return map;
}

export function editedWayIds(xml: string): Set<number> {
  const ids = new Set<number>();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  ["create", "modify"].forEach((a) => {
    doc.querySelectorAll(`${a} way`).forEach((w) => {
      const id = Number(w.getAttribute("id"));
      if (id > 0) ids.add(id);
    });
  });
  return ids;
}

export async function getOsc(
  id: number,
  cache: Map<number, string>,
): Promise<string> {
  if (cache.has(id)) return cache.get(id)!;
  const xml = await httpGet(`${OSM}/changeset/${id}/download`);
  cache.set(id, xml);
  return xml;
}

export async function getChangesetMeta(id: number): Promise<ChangesetMeta> {
  const json = JSON.parse(await httpGet(`${OSM}/changeset/${id}.json`));
  return json.changeset || (json.elements && json.elements[0]) || {};
}

// Parse OsmChange XML -> {created,modified,deleted}
export function parseOsc(xml: string): Actions {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: Actions = { created: [], modified: [], deleted: [] };
  const map: Record<string, keyof Actions> = {
    create: "created",
    modify: "modified",
    delete: "deleted",
  };
  for (const action of ["create", "modify", "delete"]) {
    doc.querySelectorAll(action).forEach((block) => {
      block.querySelectorAll("node,way,relation").forEach((el) => {
        const tags: Tags = {};
        el.querySelectorAll(":scope > tag").forEach(
          (t) => (tags[t.getAttribute("k")!] = t.getAttribute("v")!),
        );
        out[map[action]].push({
          type: el.tagName.toLowerCase(),
          id: Number(el.getAttribute("id")),
          version: Number(el.getAttribute("version")),
          lat: el.hasAttribute("lat") ? Number(el.getAttribute("lat")) : null,
          lon: el.hasAttribute("lon") ? Number(el.getAttribute("lon")) : null,
          tags,
        });
      });
    });
  }
  return out;
}

export function diffTags(oldT: Tags | undefined, newT: Tags | undefined): TagDiff[] {
  const keys = new Set([
    ...Object.keys(oldT || {}),
    ...Object.keys(newT || {}),
  ]);
  const rows: TagDiff[] = [];
  for (const k of keys) {
    const o = oldT ? oldT[k] : undefined,
      n = newT ? newT[k] : undefined;
    if (o === n) continue;
    rows.push({
      k,
      o,
      n,
      kind: o === undefined ? "added" : n === undefined ? "removed" : "changed",
    });
  }
  return rows;
}

// Fetch previous-version info (tags + node position) for modified/deleted elements.
export async function fetchOldInfo(
  elems: OscElement[],
): Promise<Map<string, OldInfo | null>> {
  const result = new Map<string, OldInfo | null>();
  let i = 0;
  async function worker() {
    while (i < elems.length) {
      const e = elems[i++];
      const key = e.type + "/" + e.id;
      if (!e.version || e.version < 2) {
        result.set(key, null);
        continue;
      }
      try {
        const j = JSON.parse(
          await httpGet(`${OSM}/${e.type}/${e.id}/${e.version - 1}.json`),
        );
        const el = j.elements && j.elements[0];
        result.set(
          key,
          el ? { tags: el.tags || {}, lat: el.lat, lon: el.lon } : null,
        );
      } catch {
        result.set(key, null);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(5, elems.length) }, worker),
  );
  return result;
}

export function buildRows(
  actions: Actions,
  oldInfo: Map<string, OldInfo | null>,
): DiffRow[] {
  const rows: DiffRow[] = [];
  actions.created.forEach((e) =>
    rows.push({ e, action: "created", diff: diffTags({}, e.tags), moved: null }),
  );
  actions.modified.forEach((e) => {
    const info = oldInfo.get(e.type + "/" + e.id);
    const diff =
      info === null || info === undefined ? null : diffTags(info.tags, e.tags);
    let moved: number | null = null;
    if (info && e.type === "node" && info.lat != null && e.lat != null) {
      const d = haversine(info.lat, info.lon!, e.lat, e.lon!);
      if (d >= 0.1) moved = d;
    }
    rows.push({ e, action: "modified", diff, moved });
  });
  actions.deleted.forEach((e) => {
    const info = oldInfo.get(e.type + "/" + e.id);
    const oldT = info ? info.tags : e.tags; // deleted elements carry no tags in OsmChange
    rows.push({ e, action: "deleted", diff: diffTags(oldT || {}, {}), moved: null });
  });
  return rows;
}

// ----- augmented diff: old geometry for deleted/modified WAYS (best-effort) -----
function adiffBboxOk(meta: ChangesetMeta): boolean {
  if (
    meta.min_lat == null ||
    meta.min_lon == null ||
    meta.max_lat == null ||
    meta.max_lon == null
  )
    return false;
  return (
    meta.max_lat - meta.min_lat <= MAX_ADIFF_DEG &&
    meta.max_lon - meta.min_lon <= MAX_ADIFF_DEG
  );
}

export async function tryAdiffWays(
  meta: ChangesetMeta,
  id: number,
): Promise<AdiffWays | null> {
  if (!adiffBboxOk(meta)) return null;
  const start = meta.created_at,
    end = meta.closed_at || meta.created_at;
  if (!start) return null;
  const pad = 0.0006;
  const bbox = `${meta.min_lat! - pad},${meta.min_lon! - pad},${meta.max_lat! + pad},${meta.max_lon! + pad}`;
  const q = `[adiff:"${start}","${end}"][timeout:90];way(${bbox});out geom meta;`;
  try {
    const xml = await overpassText(q);
    const out = parseAdiffWays(xml, id);
    return out.deleted.length || out.oldModified.length ? out : null;
  } catch {
    return null;
  }
}

// Keep only actions attributable to this changeset (the <new> side carries the changeset id).
export function parseAdiffWays(xml: string, id: number): AdiffWays {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: AdiffWays = { deleted: [], oldModified: [] };
  doc.querySelectorAll("action").forEach((act) => {
    const type = act.getAttribute("type");
    const csEl =
      act.querySelector(":scope > new > *") ||
      act.querySelector(":scope > old > *");
    if (!csEl || csEl.getAttribute("changeset") !== String(id)) return;
    const oldWay = act.querySelector(":scope > old > way");
    if (!oldWay) return;
    const coords = [...oldWay.querySelectorAll(":scope > nd")]
      .map(
        (n) =>
          [Number(n.getAttribute("lat")), Number(n.getAttribute("lon"))] as LatLon,
      )
      .filter((c) => isFinite(c[0]) && isFinite(c[1]));
    if (coords.length < 2) return;
    if (type === "delete") out.deleted.push(coords);
    else if (type === "modify")
      out.oldModified.push({ id: Number(oldWay.getAttribute("id")), coords });
  });
  return out;
}

// Build all map features for the inspector.
export async function buildFeatures(
  actions: Actions,
  oldInfo: Map<string, OldInfo | null>,
  adiffWays: AdiffWays | null,
): Promise<Features> {
  const wayIds = [
    ...new Set(
      [...actions.created, ...actions.modified]
        .filter((e) => e.type === "way")
        .map((e) => e.id),
    ),
  ];
  const geom = wayIds.length
    ? await wayGeometry(wayIds)
    : new Map<number, WayGeom>();
  const COL = {
    created: "#1C7A4B",
    modified: "#D9881F",
    deleted: "#C0392B",
    old: "#9aa3a0",
  };
  const lines: Features["lines"] = [],
    markers: Features["markers"] = [],
    moves: Features["moves"] = [];

  // created / modified ways → current (new) geometry
  const addWay = (arr: OscElement[], act: "created" | "modified") => {
    for (const e of arr)
      if (e.type === "way") {
        const g = geom.get(e.id);
        if (g && g.coords.length > 1)
          lines.push({ coords: g.coords, color: COL[act], weight: 5 });
      }
  };
  addWay(actions.created, "created");
  addWay(actions.modified, "modified");

  // nodes → markers and moves
  const addNode = (e: OscElement, act: "created" | "modified" | "deleted") => {
    if (e.type !== "node") return;
    const info = oldInfo.get(e.type + "/" + e.id);
    if (act === "created") {
      if (e.lat != null && Object.keys(e.tags).length)
        markers.push({ lat: e.lat, lon: e.lon!, color: COL.created });
    } else if (act === "deleted") {
      const lat = info && info.lat != null ? info.lat : e.lat,
        lon = info && info.lat != null ? info.lon! : e.lon;
      if (lat != null) markers.push({ lat, lon: lon!, color: COL.deleted });
    } else {
      // modified
      const moved =
        info &&
        info.lat != null &&
        e.lat != null &&
        (Math.abs(info.lat - e.lat) > 1e-9 || Math.abs(info.lon! - e.lon!) > 1e-9);
      if (moved) {
        moves.push({ from: [info!.lat!, info!.lon!], to: [e.lat!, e.lon!] });
        markers.push({
          lat: info!.lat!,
          lon: info!.lon!,
          color: COL.modified,
          hollow: true,
        });
        markers.push({ lat: e.lat!, lon: e.lon!, color: COL.modified });
      } else if (Object.keys(e.tags).length && e.lat != null) {
        markers.push({ lat: e.lat, lon: e.lon!, color: COL.modified });
      }
    }
  };
  actions.created.forEach((e) => addNode(e, "created"));
  actions.modified.forEach((e) => addNode(e, "modified"));
  actions.deleted.forEach((e) => addNode(e, "deleted"));

  // old / deleted way geometry from augmented diff
  if (adiffWays) {
    adiffWays.deleted.forEach((c) =>
      lines.push({ coords: c, color: COL.deleted, weight: 4, dash: "6,5" }),
    );
    // grey "previous shape" only for ways the user explicitly edited (avoids noise from
    // ways merely reshaped by incidental node moves).
    const modSet = new Set(
      actions.modified.filter((e) => e.type === "way").map((e) => e.id),
    );
    adiffWays.oldModified.forEach((o) => {
      if (modSet.has(o.id))
        lines.push({ coords: o.coords, color: COL.old, weight: 3, dash: "4,5" });
    });
  }
  return { lines, markers, moves };
}
