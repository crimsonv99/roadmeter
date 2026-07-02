import { InspectMap } from "./Maps";
import { MAX_DIFF, MAX_ROWS } from "../lib/osm";
import { fmtWhen } from "../lib/util";
import type { ChangesetMeta, DiffRow, Features } from "../types";

interface Counts {
  created: number;
  modified: number;
  deleted: number;
}

// The tag-diff cell for one element row.
function AttrCell({ r }: { r: DiffRow }) {
  const move =
    r.moved != null ? (
      <div className="diff-chg">moved ~{r.moved.toFixed(1)} m</div>
    ) : null;

  if (r.diff === null)
    return (
      <>
        {move ?? (
          <span style={{ color: "var(--muted)" }}>
            previous version unavailable
          </span>
        )}
      </>
    );
  if (!r.diff.length)
    return (
      <>
        {move ?? (
          <span style={{ color: "var(--muted)" }}>
            {r.action === "modified" ? "(no tag change)" : "(no tags)"}
          </span>
        )}
      </>
    );
  return (
    <>
      {move}
      {r.diff.map((d, i) => {
        if (d.kind === "added")
          return (
            <div key={i} className="diff-add">
              + {d.k}={d.n}
            </div>
          );
        if (d.kind === "removed")
          return (
            <div key={i} className="diff-del">
              − {d.k}={d.o}
            </div>
          );
        return (
          <div key={i} className="diff-chg">
            ~ {d.k}: {d.o} → {d.n}
          </div>
        );
      })}
    </>
  );
}

// OSMCha-style changeset detail (renderChangesetDetail).
export function ChangesetInspector({
  meta,
  counts,
  rows,
  undetailed,
  hasAdiff,
  features,
}: {
  meta: ChangesetMeta;
  counts: Counts;
  rows: DiffRow[];
  undetailed: number;
  hasAdiff: boolean;
  features: Features;
}) {
  const cmt = (meta.tags && meta.tags.comment) || "(no comment)";
  const when = fmtWhen(meta.created_at);
  const extra = rows.length > MAX_ROWS ? rows.length - MAX_ROWS : 0;
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <>
      <div className="cshead">
        <div className="eyebrow">Changeset #{meta.id}</div>
        <div style={{ fontWeight: 600, marginTop: 3 }}>{cmt}</div>
        <div className="when" style={{ marginTop: 2 }}>
          {meta.user ? `by ${meta.user} · ` : ""}
          {when}
        </div>
        <div className="legend">
          <span>
            <i style={{ background: "#1C7A4B" }}></i>created {counts.created}
          </span>
          <span>
            <i style={{ background: "#D9881F" }}></i>modified {counts.modified}
          </span>
          <span>
            <i style={{ background: "#C0392B" }}></i>deleted {counts.deleted}
          </span>
          {hasAdiff ? (
            <span>
              <i style={{ background: "#9aa3a0" }}></i>previous shape
            </span>
          ) : null}
        </div>
        <div className="row-actions" style={{ marginTop: 0 }}>
          <a
            className="btn ghost"
            href={`https://www.openstreetmap.org/changeset/${meta.id}`}
            target="_blank"
            rel="noopener"
          >
            OSM ↗
          </a>
          <a
            className="btn ghost"
            href={`https://osmcha.org/changesets/${meta.id}`}
            target="_blank"
            rel="noopener"
          >
            OSMCha ↗
          </a>
        </div>
      </div>

      <InspectMap features={features} meta={meta} />

      <div className="scrolltable" style={{ maxHeight: 340 }}>
        <table>
          <thead>
            <tr>
              <th>Element</th>
              <th>Change</th>
              <th>Attributes</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td>
                  <a
                    href={`https://www.openstreetmap.org/${r.e.type}/${r.e.id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    {r.e.type[0]}
                    {r.e.id}
                  </a>
                </td>
                <td>
                  <span className={"badge " + r.action}>{r.action}</span>
                </td>
                <td className="tagdiff">
                  <AttrCell r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {extra ? (
        <p className="hint">
          Showing first {MAX_ROWS} of {rows.length} elements.
        </p>
      ) : null}
      {undetailed > 0 ? (
        <p className="hint">
          {undetailed} element(s) beyond the first {MAX_DIFF} not diffed (large
          changeset).
        </p>
      ) : null}
      <p className="hint">
        Tags vs previous version: <span className="diff-add">+ added</span>,{" "}
        <span className="diff-del">− removed</span>,{" "}
        <span className="diff-chg">~ changed</span>. On the map, solid = new
        geometry, dashed red = deleted ways, dashed grey = previous shape;
        hollow→filled dots show moved nodes.
        {hasAdiff
          ? ""
          : " (Old/deleted way shapes need a recent changeset with a small bbox.)"}
      </p>
    </>
  );
}
