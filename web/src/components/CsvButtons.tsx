import { useState } from "react";
import { downloadCsv } from "../lib/csv";

// Copy/Download pair. Clipboard feedback ("Copied!") is driven by local state,
// replacing the original's direct button.textContent mutation.
export function CsvButtons({
  getCsv,
  filename,
  copyLabel = "Copy CSV",
  downloadLabel = "Download CSV",
}: {
  getCsv: () => string;
  filename: string;
  copyLabel?: string;
  downloadLabel?: string;
}) {
  const [label, setLabel] = useState(copyLabel);
  const copy = () => {
    const text = getCsv();
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setLabel("Copied!");
        setTimeout(() => setLabel(copyLabel), 1500);
      })
      .catch(() => {
        console.log(text);
        setLabel("See console");
      });
  };
  return (
    <div className="row-actions">
      <button className="btn ghost" onClick={copy}>
        {label}
      </button>
      <button
        className="btn ghost"
        onClick={() => downloadCsv(getCsv(), filename)}
      >
        {downloadLabel}
      </button>
    </div>
  );
}
