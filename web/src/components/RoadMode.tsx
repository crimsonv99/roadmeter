import { useState } from "react";
import { RoadReadout } from "./RoadReadout";
import { RoadSidebar } from "./RoadSidebar";
import { overpass } from "../lib/net";
import { parseMaxspeed } from "../lib/osm";
import { polylineKm } from "../lib/geo";
import { roadQuery } from "../lib/query";
import {
  assembleRoute,
  coalesceComponents,
  connectedComponents,
} from "../lib/route";
import {
  GAP_MERGE_M,
  checkRestrictions,
  fetchRestrictions,
  runChecks,
  sortIssues,
} from "../lib/checks";
import type { Issue, LatLon, Segment, Way } from "../types";

type Report =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | {
      kind: "report";
      ways: Way[];
      route: Segment[];
      issues: Issue[];
      extra: { restrictionCount: number; components: number };
    };

const busyRe = /HTTP (5\d\d|429)|busy|timeout/i;

const COUNTRIES: [string, string][] = [
  ["", "(any)"],
  ["VN", "Vietnam"],
  ["TH", "Thailand"],
  ["MY", "Malaysia"],
  ["ID", "Indonesia"],
  ["PH", "Philippines"],
  ["SG", "Singapore"],
  ["KH", "Cambodia"],
  ["LA", "Laos"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["DE", "Germany"],
  ["FR", "France"],
];

export default function RoadMode() {
  const [by, setBy] = useState("relname");
  const [q, setQ] = useState("");
  const [cc, setCc] = useState("VN");
  const [match, setMatch] = useState("exact");
  const [highwaysOnly, setHighwaysOnly] = useState(true);

  const [resultsVisible, setResultsVisible] = useState(false);
  const [status, setStatusState] = useState<{ msg: string; err: boolean }>({
    msg: "",
    err: false,
  });
  const [report, setReport] = useState<Report>({ kind: "empty" });
  const [fetching, setFetching] = useState(false);

  const setStatus = (msg: string, err = false) => setStatusState({ msg, err });

  async function inspectRoad() {
    const query = q.trim();
    if (!query) {
      setStatus("Enter a name, ref, or relation id.", true);
      return;
    }
    if (by === "relid" && !/^\d+$/.test(query)) {
      setStatus("Relation id must be numeric.", true);
      return;
    }
    if (by === "ref" && !cc) {
      setStatus(
        "Pick a country for a ways-by-ref search (it scopes the query).",
        true,
      );
      return;
    }

    setFetching(true);
    setResultsVisible(true);
    setReport({ kind: "text", text: "Querying Overpass…" });
    setStatus("Querying Overpass…");

    try {
      const overpassQuery = roadQuery(by, query, cc, highwaysOnly, match);
      const json = await overpass(overpassQuery);
      const ways: Way[] = [];
      for (const el of json.elements || []) {
        if (el.type !== "way" || !el.geometry || el.geometry.length < 2)
          continue;
        const t = el.tags || {};
        const coords: LatLon[] = el.geometry.map(
          (g: any) => [g.lat, g.lon] as LatLon,
        );
        const last = coords.length - 1;
        // node keys for connectivity: node id when available, else rounded coord
        const useNodes =
          Array.isArray(el.nodes) && el.nodes.length === coords.length;
        const nodeKeys = coords.map((c, i) =>
          useNodes ? "n" + el.nodes[i] : c[0].toFixed(7) + "," + c[1].toFixed(7),
        );
        ways.push({
          id: el.id,
          km: polylineKm(el.geometry),
          maxspeed: parseMaxspeed(t),
          maxspeedRaw:
            t.maxspeed || t["maxspeed:forward"] || t["maxspeed:backward"] || "",
          name: t.ref || t.name || "(unnamed)",
          ref: t.ref || "",
          roadName: t.name || "",
          highway: t.highway || "",
          oneway: (
            t.oneway ||
            (t.junction === "roundabout" ? "yes" : "")
          ).toLowerCase(),
          tags: t,
          coords,
          nodeKeys,
          endKeys: [nodeKeys[0], nodeKeys[last]],
        });
      }
      if (!ways.length) {
        setStatus(
          `No ways found for that ${by === "relid" ? "relation id" : "search"}${
            cc ? ` in ${cc}` : ""
          }. Try a different term or country.`,
          true,
        );
        setReport({ kind: "text", text: "No ways to inspect." });
        return;
      }
      const route = assembleRoute(ways);
      let comps = connectedComponents(ways); // real connectivity (routing islands)
      comps = coalesceComponents(ways, comps, GAP_MERGE_M); // bridge tiny gaps
      let issues = runChecks(ways, route, comps, highwaysOnly);

      // C4 — turn restrictions (needs a second Overpass query; non-fatal)
      let restrictionCount = 0;
      setStatus("Checking turn restrictions…");
      try {
        const restrictions = await fetchRestrictions(ways);
        restrictionCount = restrictions.length;
        if (restrictions.length) {
          issues = issues.concat(checkRestrictions(restrictions));
          sortIssues(issues);
        }
      } catch (e) {
        console.warn("turn-restriction check skipped:", e);
      }

      setReport({
        kind: "report",
        ways,
        route,
        issues,
        extra: { restrictionCount, components: comps.length },
      });
      setStatus(
        `Done — ${ways.length} way(s), ${comps.length} connected component(s), ${restrictionCount} turn restriction(s), ${issues.length} issue(s).`,
      );
    } catch (e: any) {
      console.error(e);
      const m = String(e.message || e);
      setStatus(
        busyRe.test(m)
          ? `Servers are busy (${m}). Wait ~30–60s and try again.`
          : "Error: " + m,
        true,
      );
      setReport({ kind: "text", text: "Couldn’t finish — see the message above." });
    } finally {
      setFetching(false);
    }
  }

  return (
    <div>
      <section className="card">
        <div className="eyebrow">Inspect a road</div>
        <div className="form-row">
          <div className="field">
            <label className="lbl" htmlFor="rsearchby">
              Search by
            </label>
            <select
              id="rsearchby"
              value={by}
              onChange={(e) => setBy(e.target.value)}
            >
              <option value="relname">Relation by name</option>
              <option value="relref">Relation by ref</option>
              <option value="relid">Relation by id</option>
              <option value="ref">Ways by ref (no relation)</option>
            </select>
          </div>
          <div className="field grow">
            <label className="lbl" htmlFor="rquery">
              Name / ref / id
            </label>
            <input
              id="rquery"
              type="text"
              placeholder="e.g. QL1; Quốc lộ 1; QL.1"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inspectRoad()}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="rcountry">
              Country
            </label>
            <select
              id="rcountry"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            >
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="lbl" htmlFor="rmatch">
              Match
            </label>
            <select
              id="rmatch"
              value={match}
              onChange={(e) => setMatch(e.target.value)}
            >
              <option value="exact">Exact keyword</option>
              <option value="almost">Almost (partial)</option>
            </select>
          </div>
          <button className="btn" onClick={inspectRoad} disabled={fetching}>
            Inspect road
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={highwaysOnly}
            onChange={(e) => setHighwaysOnly(e.target.checked)}
          />{" "}
          Highways only (ways tagged <code>highway=*</code>)
        </label>
        <div className="hint" style={{ marginTop: 8 }}>
          <b>One value:</b> type the name or ref — e.g. <code>Quốc lộ 51</code>.
          <br />
          <b>Multiple values:</b> separate variants with <code>;</code> to match
          any — e.g. <code>QL1; Quốc lộ 1; QL.1</code> (useful when OSM tags the
          same road inconsistently).
          <br />
          <b>Match — Exact:</b> the value must equal the keyword (or contain it
          as a <code>;</code>-list item, so <code>QL1</code> matches{" "}
          <code>QL1;AH1</code> but not <code>QL1A</code>). <b>Almost:</b>{" "}
          substring match (<code>QL1</code> also catches <code>QL1A</code>,{" "}
          <code>QL12</code>). Always case-insensitive.
        </div>
        <div className={"status" + (status.err ? " err" : "")}>{status.msg}</div>
      </section>

      {resultsVisible ? (
        <section className="card">
          <div className="eyebrow">Road profile</div>
          <div className="results">
            {report.kind === "report" ? (
              <RoadReadout
                ways={report.ways}
                route={report.route}
                issues={report.issues}
                extra={report.extra}
              />
            ) : (
              <div>
                <div className="empty">
                  {report.kind === "text"
                    ? report.text
                    : "Search a road to see its profile."}
                </div>
              </div>
            )}
            {report.kind === "report" ? (
              <RoadSidebar ways={report.ways} />
            ) : (
              <div></div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
