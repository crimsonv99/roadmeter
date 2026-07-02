import type { Way } from "../types";

// maxspeed distribution table (the #rsidebar content of renderRoad).
export function RoadSidebar({ ways }: { ways: Way[] }) {
  const dist = new Map<string, { ways: number; km: number }>();
  let totalKm = 0,
    withSpeed = 0,
    kmWithSpeed = 0;
  for (const w of ways) {
    totalKm += w.km;
    if (w.maxspeed != null) {
      withSpeed++;
      kmWithSpeed += w.km;
      const k = String(w.maxspeed);
      const d = dist.get(k) || { ways: 0, km: 0 };
      d.ways++;
      d.km += w.km;
      dist.set(k, d);
    }
  }
  const distRows = [...dist.entries()].sort((a, b) => b[1].km - a[1].km);
  const noSpeedKm = totalKm - kmWithSpeed,
    noSpeedWays = ways.length - withSpeed;

  return (
    <div>
      <div className="eyebrow">maxspeed distribution</div>
      <div className="scrolltable">
        <table>
          <thead>
            <tr>
              <th>km/h</th>
              <th className="num">ways</th>
              <th className="num">Length (km)</th>
            </tr>
          </thead>
          <tbody>
            {distRows.map(([k, d]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="num">{d.ways}</td>
                <td className="num">{d.km.toFixed(2)}</td>
              </tr>
            ))}
            {noSpeedWays ? (
              <tr>
                <td style={{ color: "var(--muted)" }}>— (none)</td>
                <td className="num">{noSpeedWays}</td>
                <td className="num">{noSpeedKm.toFixed(2)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
