import { useState } from "react";
import ContributorMode from "./components/ContributorMode";
import RoadMode from "./components/RoadMode";

type Mode = "user" | "road";

export default function App() {
  // Both modes stay mounted (toggled via display) so each keeps its state
  // across tab switches — matching the original setMode() behaviour.
  const [mode, setMode] = useState<Mode>("user");

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <svg className="post-ico" viewBox="0 0 30 38" aria-hidden="true">
            <rect x="3" y="2" width="24" height="9" rx="4.5" fill="#C0392B" />
            <rect
              x="3"
              y="11"
              width="24"
              height="16"
              rx="2"
              fill="#fff"
              stroke="#D9DEDC"
            />
            <text
              x="15"
              y="23"
              fontFamily="JetBrains Mono, monospace"
              fontSize="8"
              fontWeight="700"
              textAnchor="middle"
              fill="#161A18"
            >
              KM
            </text>
            <rect
              x="12.5"
              y="27"
              width="5"
              height="9"
              fill="#eceeed"
              stroke="#D9DEDC"
            />
          </svg>
          <div>
            <h1>RouteSense</h1>
            <div className="tag">
              Route navigation-data QA for OpenStreetMap — connectivity, oneway,
              speed &amp; turn restrictions, plus edit mileage by contributor.
            </div>
          </div>
        </div>
        <div className="howto">OSM API + Overpass · runs in your browser</div>
      </header>

      <div className="tabs">
        <button
          className={"tab" + (mode === "user" ? " active" : "")}
          onClick={() => setMode("user")}
        >
          By contributor
        </button>
        <button
          className={"tab" + (mode === "road" ? " active" : "")}
          onClick={() => setMode("road")}
        >
          By road
        </button>
      </div>

      <div style={{ display: mode === "user" ? undefined : "none" }}>
        <ContributorMode />
      </div>
      <div style={{ display: mode === "road" ? undefined : "none" }}>
        <RoadMode />
      </div>
    </div>
  );
}
