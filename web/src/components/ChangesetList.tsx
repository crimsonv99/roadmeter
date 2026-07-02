import { fmtWhen } from "../lib/util";
import type { Changeset } from "../types";

// The changeset list + select-all + Load older / Count km actions (renderList).
export function ChangesetList({
  changesets,
  selected,
  activeId,
  counting,
  onToggle,
  onSelectAll,
  onInspect,
  onLoadOlder,
  onCount,
}: {
  changesets: Changeset[];
  selected: Set<number>;
  activeId: number | null;
  counting: boolean;
  onToggle: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onInspect: (id: number) => void;
  onLoadOlder: () => void;
  onCount: () => void;
}) {
  const allChecked =
    changesets.length > 0 && selected.size === changesets.length;

  return (
    <div>
      <div className="list-head">
        <div className="eyebrow">Changesets — newest first</div>
        <label className="selall">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => onSelectAll(e.target.checked)}
          />{" "}
          select all · <span>{selected.size} selected</span>
        </label>
      </div>
      <div className="list">
        {changesets.map((c) => (
          <div
            key={c.id}
            className={"cs" + (activeId === c.id ? " active" : "")}
          >
            <input
              type="checkbox"
              className="csbox"
              checked={selected.has(c.id)}
              onChange={(e) => onToggle(c.id, e.target.checked)}
            />
            <span
              className="csbody"
              style={{ flex: 1, cursor: "pointer" }}
              onClick={() => onInspect(c.id)}
            >
              <span className="id">#{c.id}</span>{" "}
              <span className="when">{fmtWhen(c.created_at)}</span>
              <br />
              <span className="cmt">{c.comment}</span>{" "}
              <span className="meta">· {c.changes} chg</span>
            </span>
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button className="btn ghost" onClick={onLoadOlder}>
          Load older
        </button>
        <button className="btn" onClick={onCount} disabled={counting}>
          Count km for selected
        </button>
      </div>
    </div>
  );
}
