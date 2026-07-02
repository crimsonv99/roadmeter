import { useEffect, useRef } from "react";
import { getL } from "../lib/leaflet";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Creates one Leaflet map bound to a container div, and hands out a fresh
// layer group per redraw (replacing the original ensureMap/layers globals).
export function useLeafletMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = getL();
    const map = L.map(containerRef.current);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Remove the previous layer group and return a fresh one on the map.
  const freshLayer = (): any => {
    const L = getL();
    if (!mapRef.current) return null;
    if (layerRef.current) layerRef.current.remove();
    layerRef.current = L.layerGroup().addTo(mapRef.current);
    return layerRef.current;
  };

  return { containerRef, mapRef, freshLayer };
}
