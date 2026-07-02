// Leaflet is loaded via a CDN <script> in index.html (kept out of the bundle,
// matching the original). Access it lazily so it's resolved after load.
export function getL(): any {
  const L = (window as any).L;
  if (!L) throw new Error("Leaflet (window.L) is not loaded");
  return L;
}
