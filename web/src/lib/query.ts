// Overpass query builders for road mode. Ported verbatim.

export function escapeRe(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

// Build a case-insensitive regex alternation from a ";"-separated list of
// variants, so one search catches the inconsistent ways OSM tags a road
// (e.g. "QL1; Quốc lộ 1; QL.1"). Each variant is regex-escaped, then OR-joined.
//   exact = match the whole tag value, or the keyword as a token inside an
//           OSM ";"-separated list (e.g. "QL1" within "QL1;AH1").
//   almost = substring match (the keyword anywhere in the value).
export function altRegex(q: string, exact: boolean): string {
  const terms = q
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const esc = (terms.length ? terms : [q]).map(escapeRe);
  if (exact) return esc.map((t) => `(^|;) *${t} *($|;)`).join("|");
  return esc.join("|");
}

export function roadQuery(
  by: string,
  q: string,
  cc: string,
  highwaysOnly: boolean,
  match: string,
): string {
  const hwy = highwaysOnly ? '["highway"]' : "";
  if (by === "relid") {
    return `[out:json][timeout:90];relation(${Number(q)});way(r)${hwy};out tags geom;`;
  }
  const re = altRegex(q, match === "exact");
  let area = "",
    inArea = "";
  if (cc) {
    area = `area["ISO3166-1"="${cc}"][admin_level=2]->.a;`;
    inArea = "(area.a)";
  }
  if (by === "ref") {
    // ways sharing a ref, no relation needed
    return `[out:json][timeout:90];${area}way${inArea}["ref"~"${re}",i]${hwy};out tags geom;`;
  }
  const key = by === "relref" ? "ref" : "name";
  return `[out:json][timeout:90];${area}relation${inArea}["${key}"~"${re}",i];way(r)${hwy};out tags geom;`;
}
