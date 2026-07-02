// Network layer: OSM API + Overpass with 3-endpoint fallback. Ported verbatim.

export const OSM = "https://api.openstreetmap.org/api/0.6";
export const EPOCH = "2004-01-01T00:00:00Z";
export const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export function host(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

export function httpGet(url: string): Promise<string> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

// POST a query to each Overpass endpoint until one returns JSON.
export async function overpass(query: string): Promise<any> {
  let last: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        last = new Error("HTTP " + res.status + " from " + host(url));
        continue;
      }
      const t = (await res.text()).trim();
      if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
      last = new Error("Overpass busy at " + host(url));
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("All Overpass endpoints failed");
}

// Like overpass() but returns raw text (for augmented-diff XML).
export async function overpassText(query: string): Promise<string> {
  let last: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        last = new Error("HTTP " + res.status + " from " + host(url));
        continue;
      }
      const t = await res.text();
      if (t.indexOf("<osm") >= 0) return t;
      last = new Error("Overpass busy at " + host(url));
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("All Overpass endpoints failed");
}
