import { CsvButtons } from "./CsvButtons";
import { MileageMap } from "./Maps";
import { userCsv } from "../lib/csv";
import type { MileageResult } from "../types";

// Bulk changeset-count result (renderReadout).
export function MileageReadout({ data }: { data: MileageResult }) {
  const kind = data.highwaysOnly ? "highway" : "way";
  return (
    <>
      <div className="post">
        <div className="cap"></div>
        <div className="face">
          <div className="kmnum">{data.totalKm.toFixed(1)}</div>
          <div className="kmunit">km edited</div>
          <div className="sub">
            {data.ways} {kind}s · {data.csCount} changeset(s)
            {data.missing ? ` · ${data.missing} gone` : ""}
          </div>
        </div>
        <div className="stem"></div>
      </div>

      <div className="scrolltable">
        <table>
          <thead>
            <tr>
              <th>Changeset</th>
              <th className="num">{kind}s</th>
              <th className="num">km</th>
            </tr>
          </thead>
          <tbody>
            {data.perCs.map((c) => (
              <tr key={c.id}>
                <td>
                  <a
                    href={`https://www.openstreetmap.org/changeset/${c.id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    #{c.id}
                  </a>
                </td>
                <td className="num">{c.n}</td>
                <td className="num">{c.km.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CsvButtons getCsv={() => userCsv(data)} filename="roadmeter-user.csv" />

      <MileageMap polys={data.drawn} />

      <p className="hint">
        The big number counts each {kind} once. Per-changeset rows can overlap,
        so they may sum higher. Lengths use current OSM geometry; ways deleted
        since are marked “gone”.
      </p>
    </>
  );
}
