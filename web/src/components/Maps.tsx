import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useLeafletMap } from "../hooks/useLeafletMap";
import { getL } from "../lib/leaflet";
import { esc } from "../lib/util";
import type { ChangesetMeta, Features, Issue, LatLon, Way } from "../types";

// Bulk changeset-count result: the edited ways in green (drawMap).
export function MileageMap({ polys }: { polys: LatLon[][] }) {
  const { containerRef, mapRef, freshLayer } = useLeafletMap();
  useEffect(() => {
    const L = getL();
    const layer = freshLayer();
    const map = mapRef.current;
    if (!layer || !map) return;
    const bounds: LatLon[] = [];
    polys.forEach((coords) => {
      if (!coords || coords.length < 2) return;
      L.polyline(coords, { color: "#1C7A4B", weight: 4, opacity: 0.85 }).addTo(
        layer,
      );
      coords.forEach((c) => bounds.push(c));
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    setTimeout(() => map.invalidateSize(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polys]);
  return <div id="map" ref={containerRef} />;
}

// OSMCha-style highlight for one changeset (drawInspect).
export function InspectMap({
  features,
  meta,
}: {
  features: Features;
  meta: ChangesetMeta;
}) {
  const { containerRef, mapRef, freshLayer } = useLeafletMap();
  useEffect(() => {
    const L = getL();
    const layer = freshLayer();
    const map = mapRef.current;
    if (!layer || !map) return;
    const bounds: LatLon[] = [];
    features.lines.forEach((l) => {
      L.polyline(l.coords, {
        color: l.color,
        weight: l.weight || 4,
        opacity: 0.9,
        dashArray: l.dash || null,
      }).addTo(layer);
      l.coords.forEach((c) => bounds.push(c));
    });
    features.moves.forEach((m) => {
      L.polyline([m.from, m.to], {
        color: "#D9881F",
        weight: 2,
        opacity: 0.85,
        dashArray: "3,4",
      }).addTo(layer);
      bounds.push(m.from, m.to);
    });
    features.markers.forEach((m) => {
      L.circleMarker([m.lat, m.lon], {
        radius: 5,
        color: m.color,
        weight: 2,
        fillColor: m.hollow ? "#fff" : m.color,
        fillOpacity: m.hollow ? 1 : 0.85,
      }).addTo(layer);
      bounds.push([m.lat, m.lon]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [25, 25] });
    else if (meta && meta.min_lat != null)
      map.fitBounds(
        [
          [meta.min_lat, meta.min_lon],
          [meta.max_lat, meta.max_lon],
        ],
        { padding: [25, 25] },
      );
    else map.setView([0, 0], 2);
    setTimeout(() => map.invalidateSize(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, meta]);
  return <div id="map" ref={containerRef} />;
}

// Route QA map: the road in green + issue markers coloured by severity (drawRoute),
// with an imperative zoomToIssue() for issue-row clicks (zoomIssue).
export interface RouteMapHandle {
  zoomToIssue: (idx: number) => void;
}
export const RouteMap = forwardRef<
  RouteMapHandle,
  { ways: Way[]; issues: Issue[] }
>(function RouteMap({ ways, issues }, ref) {
  const { containerRef, mapRef, freshLayer } = useLeafletMap();
  const markersRef = useRef<Map<number, any>>(new Map());

  useEffect(() => {
    const L = getL();
    const layer = freshLayer();
    const map = mapRef.current;
    if (!layer || !map) return;
    markersRef.current = new Map();
    const bounds: LatLon[] = [];
    ways.forEach((w) => {
      if (!w.coords || w.coords.length < 2) return;
      L.polyline(w.coords, {
        color: "#1C7A4B",
        weight: 3,
        opacity: 0.65,
      }).addTo(layer);
      w.coords.forEach((c) => bounds.push(c));
    });
    const COL: Record<string, string> = {
      high: "#C0392B",
      med: "#D9881F",
      low: "#C9A227",
    };
    issues.forEach((is, idx) => {
      if (!is.where) return;
      const col = COL[is.sev] || "#C0392B";
      const mk = L.circleMarker([is.where.lat, is.where.lon], {
        radius: 6,
        color: col,
        weight: 2,
        fillColor: col,
        fillOpacity: 0.9,
      }).addTo(layer);
      mk.bindPopup(`<b>${esc(is.check)}</b><br>${esc(is.detail)}`);
      markersRef.current.set(idx, mk);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    setTimeout(() => map.invalidateSize(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ways, issues]);

  useImperativeHandle(
    ref,
    () => ({
      zoomToIssue(idx: number) {
        const map = mapRef.current;
        const is = issues[idx];
        if (!map || !is || !is.where) return;
        map.setView([is.where.lat, is.where.lon], 16);
        const mk = markersRef.current.get(idx);
        if (mk) mk.openPopup();
        map.invalidateSize();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issues],
  );

  return <div id="rmap" ref={containerRef} />;
});
