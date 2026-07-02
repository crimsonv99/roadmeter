import { useRef, useState } from "react";
import { CsvButtons } from "./CsvButtons";
import { RouteMap, type RouteMapHandle } from "./Maps";
import { roadCsv, issuesCsv } from "../lib/csv";
import { SPEED_JUMP, SPEED_MAX } from "../lib/checks";
import type { Issue, Segment, Way } from "../types";

type Filter = "all" | "med" | "high";
const sevIcon = (s: string) => (s === "high" ? "🔴" : s === "med" ? "🟠" : "🟡");
const visible = (filter: Filter, sev: string) =>
  filter === "all" ||
  (filter === "med" && sev !== "low") ||
  (filter === "high" && sev === "high");

// The route QA report card — left column (#rreadout) of renderRoad.
export function RoadReadout({
  ways,
  route,
  issues,
  extra,
}: {
  ways: Way[];
  route: Segment[];
  issues: Issue[];
  extra: { restrictionCount: number; components: number };
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const mapRef = useRef<RouteMapHandle>(null);

  let totalKm = 0,
    withSpeed = 0,
    kmWithSpeed = 0;
  for (const w of ways) {
    totalKm += w.km;
    if (w.maxspeed != null) {
      withSpeed++;
      kmWithSpeed += w.km;
    }
  }
  const pct = totalKm ? Math.round((100 * kmWithSpeed) / totalKm) : 0;
  const nHigh = issues.filter((i) => i.sev === "high").length;
  const nMed = issues.filter((i) => i.sev === "med").length;
  const nLow = issues.filter((i) => i.sev === "low").length;
  const components = extra.components != null ? extra.components : route.length;
  const sorted = [...ways].sort((a, b) => b.km - a.km);

  return (
    <div>
      <div className="post">
        <div className="cap"></div>
        <div className="face">
          <div className="kmnum">{totalKm.toFixed(1)}</div>
          <div className="kmunit">km of road</div>
          <div className="sub">
            {ways.length} ways · {withSpeed} with maxspeed
          </div>
        </div>
        <div className="stem"></div>
      </div>

      <div className="scorecard">
        <div className="score">
          <div className="v">{pct}%</div>
          <div className="k">maxspeed coverage</div>
        </div>
        <div className="score">
          <div className="v">{components}</div>
          <div className="k">connected component{components === 1 ? "" : "s"}</div>
        </div>
        <div className="score">
          <div className="v">{extra.restrictionCount || 0}</div>
          <div className="k">turn restrictions</div>
        </div>
        <div className="score">
          <div className="v">
            <span className="sev high"></span>
            {nHigh}
          </div>
          <div className="k">blocking</div>
        </div>
        <div className="score">
          <div className="v">
            <span className="sev med"></span>
            {nMed}
          </div>
          <div className="k">guidance</div>
        </div>
        <div className="score">
          <div className="v">
            <span className="sev low"></span>
            {nLow}
          </div>
          <div className="k">completeness</div>
        </div>
      </div>

      <div className="cover">
        <div className="lbl2">
          <span>maxspeed coverage (by length)</span>
          <span>{pct}%</span>
        </div>
        <div className="bar">
          <span style={{ width: `${pct}%` }}></span>
        </div>
      </div>

      {issues.length ? (
        <>
          <div className="list-head" style={{ marginTop: 18 }}>
            <div className="eyebrow">Issues — most severe first</div>
            <label className="selall">
              show
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
              >
                <option value="all">all</option>
                <option value="med">🔴 + 🟠 only</option>
                <option value="high">🔴 only</option>
              </select>
            </label>
          </div>
          <div className="scrolltable" style={{ maxHeight: 280 }}>
            <table>
              <thead>
                <tr>
                  <th>Sev</th>
                  <th>Check</th>
                  <th>Detail</th>
                  <th>Fix</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((is, idx) => (
                  <tr
                    key={idx}
                    className="issrow"
                    style={{ display: visible(filter, is.sev) ? undefined : "none" }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a")) return;
                      mapRef.current?.zoomToIssue(idx);
                    }}
                  >
                    <td>
                      <span className={"badge " + is.sev}>{sevIcon(is.sev)}</span>
                    </td>
                    <td>{is.check}</td>
                    <td>{is.detail}</td>
                    <td>
                      {is.josm ? (
                        <a
                          href={is.josm}
                          target="_blank"
                          rel="noopener"
                          title="open in iD editor"
                        >
                          iD ↗
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CsvButtons
            getCsv={() => issuesCsv(issues)}
            filename="roadmeter-issues.csv"
            copyLabel="Copy issues CSV"
            downloadLabel="Download issues CSV"
          />
        </>
      ) : (
        <div className="allclear">
          ✓ No connectivity, oneway, or maxspeed issues detected on this route.
        </div>
      )}

      <RouteMap ref={mapRef} ways={ways} issues={issues} />

      <div className="eyebrow" style={{ marginTop: 18 }}>
        All ways
      </div>
      <div className="scrolltable">
        <table>
          <thead>
            <tr>
              <th>Way (ref/name)</th>
              <th className="num">Length (km)</th>
              <th className="num">maxspeed</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => (
              <tr key={w.id}>
                <td>
                  <a
                    href={`https://www.openstreetmap.org/way/${w.id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    {w.name}
                  </a>
                </td>
                <td className="num">{w.km.toFixed(2)}</td>
                <td className="num">
                  {w.maxspeed == null ? "—" : String(w.maxspeed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CsvButtons
        getCsv={() => roadCsv(sorted)}
        filename="roadmeter-road.csv"
        copyLabel="Copy ways CSV"
        downloadLabel="Download ways CSV"
      />

      <p className="hint">
        A route should be one connected component. Checks:{" "}
        <b>connectivity</b> — "routing islands" not joined to the main route by
        any shared node (🔴 breaks routing), <b>oneway</b> direction consistency
        (🟠), <b>maxspeed</b> sanity — missing (🟡), implausible (&gt;
        {SPEED_MAX}), or jumps ≥{SPEED_JUMP} km/h (🟠), <b>turn restrictions</b>{" "}
        — structurally broken <code>type=restriction</code> relations (🟠),{" "}
        <b>ref continuity</b> — ref changes or missing refs (🟡), <b>lanes</b> —
        odd <code>lanes</code> values or <code>turn:lanes</code> count
        mismatches (🟡), and <b>access</b> — <code>access/vehicle=no/private</code>{" "}
        mid-route (🟡). Use the filter to focus on 🔴/🟠. Click an issue row to
        zoom the map. Flags only — fix in iD/JOSM.
      </p>
    </div>
  );
}
