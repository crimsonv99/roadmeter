// CSV builders + download. Ported verbatim. (Clipboard copy is handled in the
// CsvButtons component so it can drive the "Copied!" label via React state.)
import type { Issue, MileageResult, Way } from "../types";

export function csvCell(s: unknown): string {
  const v = String(s);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function userCsv(r: MileageResult): string {
  const lines = ["changeset_id,ways,km"];
  r.perCs.forEach((c) => lines.push(`${c.id},${c.n},${c.km.toFixed(3)}`));
  lines.push(`TOTAL_unique,${r.ways},${r.totalKm.toFixed(3)}`);
  return lines.join("\n");
}

export function roadCsv(ways: Way[]): string {
  const lines = ["way_id,name_or_ref,km,maxspeed,oneway,highway"];
  ways.forEach((w) =>
    lines.push(
      [
        w.id,
        csvCell(w.name),
        w.km.toFixed(3),
        w.maxspeed == null ? "" : csvCell(String(w.maxspeed)),
        csvCell(w.oneway),
        csvCell(w.highway),
      ].join(","),
    ),
  );
  return lines.join("\n");
}

export function issuesCsv(issues: Issue[]): string {
  const lines = ["severity,check,detail,lat,lon,way_id,osm_url"];
  issues.forEach((i) =>
    lines.push(
      [
        i.sev,
        i.check,
        csvCell(i.detail),
        i.where ? i.where.lat : "",
        i.where ? i.where.lon : "",
        i.wayId || "",
        i.link || "",
      ].join(","),
    ),
  );
  return lines.join("\n");
}

export function downloadCsv(text: string, name: string): void {
  const blob = new Blob([text], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
