// Pure geometry helpers. Ported verbatim.
import type { LatLon, OverpassGeom, RouteItem, Way } from "../types";

export function haversine(
  la1: number,
  lo1: number,
  la2: number,
  lo2: number,
): number {
  const R = 6371000,
    r = Math.PI / 180;
  const dLa = (la2 - la1) * r,
    dLo = (lo2 - lo1) * r;
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function polylineKm(geom: OverpassGeom[]): number {
  let m = 0;
  for (let i = 0; i < geom.length - 1; i++)
    m += haversine(geom[i].lat, geom[i].lon, geom[i + 1].lat, geom[i + 1].lon);
  return m / 1000;
}

// left/right end coords of a chain item, in chain direction
export function leftCoord(ways: Way[], it: RouteItem): LatLon {
  const w = ways[it.wi];
  return it.forward ? w.coords[0] : w.coords[w.coords.length - 1];
}
export function rightCoord(ways: Way[], it: RouteItem): LatLon {
  const w = ways[it.wi];
  return it.forward ? w.coords[w.coords.length - 1] : w.coords[0];
}

export function midCoord(w: Way | null | undefined): LatLon | null {
  return w && w.coords.length ? w.coords[Math.floor(w.coords.length / 2)] : null;
}
