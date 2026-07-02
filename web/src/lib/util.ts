// HTML-escape for raw strings we hand to Leaflet's bindPopup (React escapes
// everything else automatically, so esc() is only needed here).
export function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      (({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }) as Record<string, string>)[c],
  );
}

// "2024-01-02T03:04:05Z" -> "2024-01-02 03:04" (mirrors the original display).
export function fmtWhen(iso: string | undefined): string {
  return (iso || "").replace("T", " ").replace(/:\d\dZ?$/, "");
}
