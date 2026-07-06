// Overpass query builders for road mode. Ported verbatim.

export function escapeRe(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

// Parse a free-form list of numeric ids separated by ; , whitespace or newlines
// (e.g. "701454823; 12345, 987654") into a de-duplicated array of numbers.
export function parseIds(q: string): number[] {
  const seen = new Set<number>();
  for (const tok of q.split(/[;,\s]+/)) {
    const t = tok.trim();
    if (/^\d+$/.test(t)) seen.add(Number(t));
  }
  return [...seen];
}

// Escape a string for use inside an Overpass "quoted" literal.
function escOverpass(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Build an Overpass tag filter from a "key=value" (or bare "key") input.
//   "highway=trunk" exact  -> ["highway"="trunk"]
//   "highway=trunk" almost -> ["highway"~"trunk",i]   (value contains)
//   "maxspeed"             -> ["maxspeed"]             (has the key, any value)
// Returns "" when no key is given.
export function tagFilter(q: string, exact: boolean): string {
  const eq = q.indexOf("=");
  const key = (eq < 0 ? q : q.slice(0, eq)).trim();
  const val = eq < 0 ? "" : q.slice(eq + 1).trim();
  if (!key) return "";
  if (!val) return `["${escOverpass(key)}"]`;
  if (exact) return `["${escOverpass(key)}"="${escOverpass(val)}"]`;
  return `["${escOverpass(key)}"~"${escapeRe(val)}",i]`;
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
  if (by === "wayids") {
    // fetch exactly the listed way ids (no highway filter — you asked for these)
    const ids = parseIds(q);
    return `[out:json][timeout:90];way(id:${ids.join(",")});out tags geom;`;
  }
  if (by === "relid") {
    return `[out:json][timeout:90];relation(${Number(q)});way(r)${hwy};out tags geom;`;
  }
  if (by === "tag") {
    // ways carrying an arbitrary OSM tag, scoped by country (independent of ref/relation)
    let a = "",
      inA = "";
    if (cc) {
      a = `area["ISO3166-1"="${cc}"][admin_level=2]->.a;`;
      inA = "(area.a)";
    }
    return `[out:json][timeout:90];${a}way${inA}${tagFilter(q, match === "exact")}${hwy};out tags geom;`;
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
