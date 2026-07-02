import { useRef, useState } from "react";
import { ChangesetList } from "./ChangesetList";
import { ChangesetInspector } from "./ChangesetInspector";
import { MileageReadout } from "./MileageReadout";
import { EPOCH, OSM, httpGet } from "../lib/net";
import {
  buildFeatures,
  buildRows,
  editedWayIds,
  fetchOldInfo,
  getChangesetMeta,
  getOsc,
  parseOsc,
  tryAdiffWays,
  wayGeometry,
  MAX_DIFF,
} from "../lib/osm";
import type {
  Changeset,
  ChangesetMeta,
  DiffRow,
  Features,
  LatLon,
  MileageResult,
} from "../types";

type Readout =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "mileage"; data: MileageResult }
  | {
      kind: "inspect";
      meta: ChangesetMeta;
      counts: { created: number; modified: number; deleted: number };
      rows: DiffRow[];
      undetailed: number;
      hasAdiff: boolean;
      features: Features;
    };

const busyRe = /HTTP (5\d\d|429)|busy|timeout/i;

export default function ContributorMode() {
  // form
  const [user, setUser] = useState("");
  const [fromD, setFromD] = useState("");
  const [toD, setToD] = useState("");
  const [hwy, setHwy] = useState(true);

  // data
  const [changesets, setChangesets] = useState<Changeset[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resultsVisible, setResultsVisible] = useState(false);
  const [status, setStatusState] = useState<{ msg: string; err: boolean }>({
    msg: "",
    err: false,
  });
  const [readout, setReadout] = useState<Readout>({ kind: "empty" });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const oscCache = useRef<Map<number, string>>(new Map());

  const setStatus = (msg: string, err = false) => setStatusState({ msg, err });

  async function loadChangesets(older: boolean) {
    const u = user.trim();
    if (!u) {
      setStatus("Enter an OSM username first.", true);
      return;
    }
    const fromISO = fromD ? `${fromD}T00:00:00Z` : EPOCH;
    let toISO: string | null = toD ? `${toD}T23:59:59Z` : null;

    let base = changesets;
    if (older && changesets.length) {
      toISO = changesets[changesets.length - 1].created_at; // page backwards
    } else if (!older) {
      base = [];
      setSelected(new Set());
    }

    let url = `${OSM}/changesets.json?display_name=${encodeURIComponent(u)}`;
    if (toISO)
      url += `&time=${encodeURIComponent(fromISO)},${encodeURIComponent(toISO)}`;
    else if (fromD) url += `&time=${encodeURIComponent(fromISO)}`;

    setStatus(older ? "Loading older changesets…" : "Finding changesets…");
    try {
      const json = JSON.parse(await httpGet(url));
      const incoming: Changeset[] = (json.changesets || []).map((c: any) => ({
        id: c.id,
        created_at: c.created_at,
        changes: c.changes_count != null ? c.changes_count : c.changes || 0,
        comment: (c.tags && c.tags.comment) || "(no comment)",
      }));
      const merged = base.slice();
      const seen = new Set(merged.map((c) => c.id));
      for (const c of incoming) if (!seen.has(c.id)) merged.push(c);
      merged.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      if (!merged.length) {
        setStatus(
          `No changesets for "${u}" in that range, or the user is unknown.`,
          true,
        );
        setChangesets([]);
        setResultsVisible(false);
        return;
      }
      setStatus(
        `Loaded ${merged.length} changeset(s)${
          incoming.length === 100
            ? " — full page, use “Load older” for more."
            : "."
        }`,
      );
      setChangesets(merged);
      setResultsVisible(true);
    } catch (e: any) {
      console.error(e);
      setStatus(
        /HTTP 404/.test(String(e))
          ? `User "${u}" not found.`
          : "Couldn’t reach the OSM API: " + (e.message || e),
        true,
      );
    }
  }

  function toggle(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    setSelected(checked ? new Set(changesets.map((c) => c.id)) : new Set());
  }

  async function countSelected() {
    if (!selected.size) {
      setStatus("Select at least one changeset.", true);
      return;
    }
    const highwaysOnly = hwy;
    setCounting(true);
    setActiveId(null);
    setReadout({ kind: "text", text: "Working…" });
    try {
      const sel = changesets.filter((c) => selected.has(c.id));
      const csWays = new Map<number, Set<number>>(); // csId -> Set(wayId)
      const allWays = new Set<number>();
      let i = 0;
      for (const cs of sel) {
        setStatus(`Downloading changeset ${++i}/${sel.length} (#${cs.id})…`);
        const xml = await getOsc(cs.id, oscCache.current);
        const ids = editedWayIds(xml);
        csWays.set(cs.id, ids);
        ids.forEach((id) => allWays.add(id));
      }
      if (!allWays.size) {
        setStatus(
          "Those changesets created/modified no ways (nodes or relations only).",
        );
        setReadout({ kind: "text", text: "No ways to measure." });
        return;
      }
      setStatus(`Fetching geometry for ${allWays.size} way(s)…`);
      const geom = await wayGeometry([...allWays]);

      let totalKm = 0,
        ways = 0,
        missing = 0;
      const drawn: LatLon[][] = [];
      for (const id of allWays) {
        const g = geom.get(id);
        if (!g) {
          missing++;
          continue;
        }
        if (highwaysOnly && !g.highway) continue;
        totalKm += g.km;
        ways++;
        drawn.push(g.coords);
      }
      const perCs = sel.map((cs) => {
        let km = 0,
          n = 0;
        for (const id of csWays.get(cs.id)!) {
          const g = geom.get(id);
          if (!g || (highwaysOnly && !g.highway)) continue;
          km += g.km;
          n++;
        }
        return { id: cs.id, km, n };
      });

      setReadout({
        kind: "mileage",
        data: {
          totalKm,
          ways,
          missing,
          perCs,
          highwaysOnly,
          csCount: sel.length,
          drawn,
        },
      });
      setStatus("Done.");
    } catch (e: any) {
      console.error(e);
      const m = String(e.message || e);
      setStatus(
        busyRe.test(m)
          ? `Servers are busy (${m}). Wait ~30–60s and try again.`
          : "Error: " + m,
        true,
      );
      setReadout({ kind: "text", text: "Couldn’t finish — see the message above." });
    } finally {
      setCounting(false);
    }
  }

  async function inspectChangeset(id: number) {
    setActiveId(id);
    setReadout({ kind: "text", text: `Loading changeset #${id}…` });
    setStatus(`Loading changeset #${id}…`);
    try {
      const meta = await getChangesetMeta(id);
      const actions = parseOsc(await getOsc(id, oscCache.current));
      const counts = {
        created: actions.created.length,
        modified: actions.modified.length,
        deleted: actions.deleted.length,
      };

      const needOld = [...actions.modified, ...actions.deleted].slice(0, MAX_DIFF);
      if (needOld.length)
        setStatus(`Comparing ${needOld.length} element(s) to their previous version…`);
      const oldInfo = await fetchOldInfo(needOld);

      setStatus("Fetching edit geometry…");
      const adiffWays = await tryAdiffWays(meta, id); // old/deleted way shapes (best-effort)
      const features = await buildFeatures(actions, oldInfo, adiffWays);

      const undetailed =
        actions.modified.length + actions.deleted.length - needOld.length;
      setReadout({
        kind: "inspect",
        meta,
        counts,
        rows: buildRows(actions, oldInfo),
        undetailed,
        hasAdiff: !!adiffWays,
        features,
      });
      setStatus(
        `Changeset #${id}: ${counts.created} created · ${counts.modified} modified · ${counts.deleted} deleted${
          adiffWays ? " · old geometry shown" : ""
        }.`,
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
      setReadout({
        kind: "text",
        text: "Couldn’t load that changeset — see the message above.",
      });
    }
  }

  return (
    <div>
      <section className="card">
        <div className="eyebrow">Find a contributor</div>
        <div className="form-row">
          <div className="field grow">
            <label className="lbl" htmlFor="user">
              OSM username
            </label>
            <input
              id="user"
              type="text"
              placeholder="e.g. Atem"
              autoComplete="off"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadChangesets(false)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="from">
              From
            </label>
            <input
              id="from"
              type="date"
              value={fromD}
              onChange={(e) => setFromD(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="date"
              value={toD}
              onChange={(e) => setToD(e.target.value)}
            />
          </div>
          <button className="btn" onClick={() => loadChangesets(false)}>
            Find changesets
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={hwy}
            onChange={(e) => setHwy(e.target.checked)}
          />{" "}
          Count highways only (ways tagged <code>highway=*</code>)
        </label>
        <div className={"status" + (status.err ? " err" : "")}>{status.msg}</div>
      </section>

      {resultsVisible ? (
        <section className="card">
          <div className="results">
            <ChangesetList
              changesets={changesets}
              selected={selected}
              activeId={activeId}
              counting={counting}
              onToggle={toggle}
              onSelectAll={selectAll}
              onInspect={inspectChangeset}
              onLoadOlder={() => loadChangesets(true)}
              onCount={countSelected}
            />
            <div>
              {readout.kind === "empty" ? (
                <div className="empty">
                  Click a changeset to inspect its edits, or tick several and
                  count their km.
                </div>
              ) : readout.kind === "text" ? (
                <div className="empty">{readout.text}</div>
              ) : readout.kind === "mileage" ? (
                <MileageReadout data={readout.data} />
              ) : (
                <ChangesetInspector
                  meta={readout.meta}
                  counts={readout.counts}
                  rows={readout.rows}
                  undetailed={readout.undetailed}
                  hasAdiff={readout.hasAdiff}
                  features={readout.features}
                />
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
