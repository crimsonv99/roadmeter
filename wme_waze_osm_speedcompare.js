// ==UserScript==
// @name         WME Waze vs OSM Speed Compare
// @namespace    https://github.com/yourname/wme-waze-osm-speedcompare
// @version      1.3.0
// @description  Compare Waze segment speed limits against OSM maxspeed (via Overpass) for the loaded area. Flags mismatches and missing values in a Scripts sidebar table. Tuned for roads like QL51 in Vietnam.
// @match        https://www.waze.com/*editor*
// @match        https://beta.waze.com/*editor*
// @exclude      https://www.waze.com/*user/editor*
// @grant        GM_xmlhttpRequest
// @connect      overpass-api.de
// @connect      overpass.kumi.systems
// @connect      private.coffee
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/* global W, getWmeSdk, GM_xmlhttpRequest */
(function () {
  'use strict';

  const SCRIPT_ID = 'wme-waze-osm-speedcompare';
  const LOG = '[WzOSM]';

  const DEFAULTS = {
    roadFilter: '51',   // matches Waze street name AND OSM ref/name (case-insensitive substring)
    matchMeters: 30,    // max distance to consider a Waze segment matched to an OSM way
  };

  // Tried in order; if one is busy/rate-limited the next is used automatically.
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];

  // Drivable road types (covers SDK RoadTypeId and legacy roadType numbers).
  const DRIVABLE_ROAD_TYPES = new Set([1, 2, 3, 4, 6, 7, 17, 20]);

  let sdk = null; // optional; used for cleaner data access when available

  // ---------- bootstrap (handles "already ready" case) ----------
  function boot() {
    if (window.W && W.userscripts && W.userscripts.state && W.userscripts.state.isReady) {
      console.log(`${LOG} WME already ready — initializing now.`);
      init();
    } else {
      console.log(`${LOG} waiting for wme-ready…`);
      document.addEventListener('wme-ready', init, { once: true });
    }
  }
  boot();

  async function init() {
    console.log(`${LOG} init`);
    // Try to grab the SDK for nicer data access (optional).
    try {
      if (typeof getWmeSdk === 'function') {
        sdk = getWmeSdk({ scriptId: SCRIPT_ID, scriptName: 'Waze vs OSM Speeds' });
        console.log(`${LOG} SDK acquired`);
      }
    } catch (e) {
      console.warn(`${LOG} SDK not available, using W.model fallback`, e);
    }

    // Register the sidebar tab using the documented native API.
    let tabLabel, tabPane;
    try {
      const res = W.userscripts.registerSidebarTab(SCRIPT_ID);
      tabLabel = res.tabLabel;
      tabPane = res.tabPane;
    } catch (e) {
      console.error(`${LOG} registerSidebarTab failed`, e);
      return;
    }

    tabLabel.innerText = 'WzOSM';
    tabLabel.title = 'Waze vs OSM Speeds';
    tabPane.innerHTML = buildPanelHtml();

    // Wait until the pane is actually in the DOM, then wire up handlers.
    try {
      await W.userscripts.waitForElementConnected(tabPane);
    } catch (e) { /* proceed anyway */ }

    tabPane.querySelector('#woz-scan').addEventListener('click', () => scan(tabPane));
    console.log(`${LOG} tab registered — look for "WzOSM" under the Scripts panel.`);
  }

  function buildPanelHtml() {
    return `
      <div style="font:13px/1.4 sans-serif;padding:4px 2px;">
        <h3 style="margin:0 0 8px;">Waze ↔ OSM Speeds</h3>
        <p style="margin:0 0 8px;color:#555;">
          Pan/zoom so the road is loaded, then Scan. Compares Waze
          <b>fwd/rev</b> speed vs OSM <b>maxspeed</b> (km/h).
        </p>

        <label style="display:block;margin-bottom:4px;">
          Road filter (name / ref contains)
          <input id="woz-filter" type="text" value="${DEFAULTS.roadFilter}"
            style="width:100%;box-sizing:border-box;margin-top:2px;" />
        </label>
        <small style="color:#777;">Blank = all loaded drivable roads.</small>

        <label style="display:block;margin:8px 0 6px;">
          Match distance (m)
          <input id="woz-dist" type="number" min="5" max="200" value="${DEFAULTS.matchMeters}"
            style="width:80px;margin-left:6px;" />
        </label>

        <button id="woz-scan"
          style="width:100%;padding:7px;margin:6px 0;cursor:pointer;">
          Scan loaded area
        </button>

        <div id="woz-status" style="min-height:18px;color:#444;margin-bottom:6px;"></div>
        <div id="woz-summary" style="margin-bottom:6px;font-weight:bold;"></div>
        <button id="woz-csv" style="display:none;margin-bottom:8px;cursor:pointer;">Copy CSV</button>
        <div id="woz-results"></div>
      </div>`;
  }

  function setStatus(pane, msg) {
    const el = pane.querySelector('#woz-status');
    if (el) el.textContent = msg;
  }

  // ---------- main scan ----------
  async function scan(pane) {
    const btn = pane.querySelector('#woz-scan');
    btn.disabled = true;
    pane.querySelector('#woz-results').innerHTML = '';
    pane.querySelector('#woz-summary').textContent = '';
    pane.querySelector('#woz-csv').style.display = 'none';

    try {
      const filter = pane.querySelector('#woz-filter').value.trim().toLowerCase();
      const matchMeters = Math.max(5, Number(pane.querySelector('#woz-dist').value) || DEFAULTS.matchMeters);

      setStatus(pane, 'Reading Waze segments…');
      const wazeRoad = collectWazeRoad(filter);
      console.log(`${LOG} matched Waze segments:`, wazeRoad.length);

      if (!wazeRoad.length) {
        setStatus(pane, filter
          ? `No matching Waze roads for "${filter}". Try a different filter or pan the map.`
          : 'No drivable segments loaded. Pan/zoom and retry.');
        return;
      }

      const bbox = padBbox(bboxOf(wazeRoad), 0.002); // ~200 m pad
      setStatus(pane, `Matched ${wazeRoad.length} Waze segments. Querying OSM…`);

      const osmWays = await fetchOsmWays(bbox, filter);
      console.log(`${LOG} OSM ways:`, osmWays.length);
      setStatus(pane, `OSM returned ${osmWays.length} ways. Matching…`);

      const rows = wazeRoad.map(w => {
        const best = nearestOsmWay(w.coords, osmWays, matchMeters);
        const osmVal = best ? best.maxspeed : (osmWays.length ? null : undefined);
        return buildRow(w, osmVal, best);
      });

      renderResults(pane, rows);
    } catch (e) {
      console.error(`${LOG}`, e);
      const m = String(e.message || e);
      if (/HTTP (5\d\d|429)|busy|timeout/i.test(m)) {
        setStatus(pane, `OSM servers are busy right now (${m}). Wait ~30–60s and Scan again.`);
      } else {
        setStatus(pane, 'Error: ' + m);
      }
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Waze data: normalized {id,name,fwd,rev,coords} ----------
  function collectWazeRoad(filter) {
    const out = [];
    const rawSegs = getRawSegments();
    for (const seg of rawSegs) {
      const rt = seg.roadType;
      if (rt != null && !DRIVABLE_ROAD_TYPES.has(rt)) continue;
      const coords = seg.coords;
      if (!coords || coords.length < 2) continue;
      const name = seg.name || '';
      if (filter && !name.toLowerCase().includes(filter)) continue;
      out.push({
        id: seg.id,
        name: name || '(unnamed)',
        fwd: normSpeed(seg.fwd),
        rev: normSpeed(seg.rev),
        coords,
      });
    }
    return out;
  }

  // Returns array of {id, roadType, fwd, rev, name, coords:[[lon,lat],...]}
  function getRawSegments() {
    // Path A: SDK
    if (sdk) {
      try {
        const segs = sdk.DataModel.Segments.getAll();
        if (Array.isArray(segs) && segs.length) {
          return segs.map(s => {
            let name = null;
            try {
              const a = sdk.DataModel.Segments.getAddress({ segmentId: s.id });
              name = a && a.street ? a.street.name : null;
            } catch (e) { /* ignore */ }
            return {
              id: s.id,
              roadType: s.roadType,
              fwd: s.fwdSpeedLimit,
              rev: s.revSpeedLimit,
              name,
              coords: geoCoords(s.geometry),
            };
          });
        }
      } catch (e) {
        console.warn(`${LOG} SDK getAll failed, falling back to W.model`, e);
      }
    }
    // Path B: legacy W.model
    try {
      return W.model.segments.getObjectArray().map(o => {
        const at = o.attributes || {};
        let name = null;
        try {
          const st = W.model.streets.getObjectById(at.primaryStreetID);
          name = st ? (st.attributes ? st.attributes.name : st.name) : null;
        } catch (e) { /* ignore */ }
        return {
          id: at.id,
          roadType: at.roadType,
          fwd: at.fwdMaxSpeed,
          rev: at.revMaxSpeed,
          name,
          coords: geoCoords(o.geometry),
        };
      });
    } catch (e) {
      console.error(`${LOG} could not read segments from W.model`, e);
      return [];
    }
  }

  // Normalize any geometry to [[lon,lat],...]
  function geoCoords(geometry) {
    if (!geometry) return null;
    let g = geometry;
    // Use the WME helper to convert OL → GeoJSON when needed.
    try {
      if (W.userscripts && typeof W.userscripts.toGeoJSONGeometry === 'function') {
        g = W.userscripts.toGeoJSONGeometry(geometry);
      }
    } catch (e) { /* g stays as-is */ }
    if (g && g.type === 'LineString' && Array.isArray(g.coordinates)) return g.coordinates;
    // last-resort: OL components
    if (geometry.components && geometry.components.length) {
      return geometry.components.map(p => to4326(p.x, p.y));
    }
    return null;
  }

  function to4326(x, y) {
    const lon = (x / 20037508.34) * 180;
    let lat = (y / 20037508.34) * 180;
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
    return [lon, lat];
  }

  function normSpeed(v) {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return (isFinite(n) && n > 0) ? n : null;
  }

  // ---------- geometry / bbox ----------
  function bboxOf(roads) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const r of roads) for (const [lon, lat] of r.coords) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    return { minLon, minLat, maxLon, maxLat };
  }

  function padBbox(b, pad) {
    return { minLon: b.minLon - pad, minLat: b.minLat - pad, maxLon: b.maxLon + pad, maxLat: b.maxLat + pad };
  }

  function pointToLine(p, line) {
    let min = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const d = pointToSeg(p, line[i], line[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }

  function pointToSeg(p, a, b) {
    const lat0 = (p[1] * Math.PI) / 180;
    const mLat = 111320, mLon = 111320 * Math.cos(lat0);
    const px = (p[0] - a[0]) * mLon, py = (p[1] - a[1]) * mLat;
    const bx = (b[0] - a[0]) * mLon, by = (b[1] - a[1]) * mLat;
    const len2 = bx * bx + by * by;
    let t = len2 ? (px * bx + py * by) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = px - t * bx, dy = py - t * by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function nearestOsmWay(coords, osmWays, threshold) {
    const samples = sampleLine(coords, 5);
    let best = null, bestDist = Infinity;
    for (const w of osmWays) {
      let d = Infinity;
      for (const s of samples) {
        const dd = pointToLine(s, w.coords);
        if (dd < d) d = dd;
        if (d === 0) break;
      }
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return bestDist <= threshold ? best : null;
  }

  function sampleLine(coords, n) {
    if (coords.length <= n) return coords;
    const out = [], step = (coords.length - 1) / (n - 1);
    for (let i = 0; i < n; i++) out.push(coords[Math.round(i * step)]);
    return out;
  }

  // ---------- OSM / Overpass ----------
  function fetchOsmWays(bbox, filter) {
    const box = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
    // Lightweight: fetch all highways in the (small) bbox, no server-side regex.
    // Regex queries are heavier and get throttled/timed-out more often.
    const q = `[out:json][timeout:60];
way["highway"](${box});
out tags geom;`;
    const f = (filter || '').toLowerCase();
    return overpass(q).then(json => {
      const ways = [];
      for (const el of (json.elements || [])) {
        if (el.type !== 'way' || !el.geometry) continue;
        const tags = el.tags || {};
        const refName = `${tags.ref || ''} ${tags.name || ''}`.toLowerCase();
        if (f && !refName.includes(f)) continue; // client-side filter
        ways.push({
          id: el.id,
          tags,
          maxspeed: parseMaxspeed(tags),
          ref: tags.ref || tags.name || '',
          coords: el.geometry.map(g => [g.lon, g.lat]),
        });
      }
      return ways;
    });
  }

  function parseMaxspeed(tags) {
    const raw = tags.maxspeed || tags['maxspeed:forward'] || tags['maxspeed:backward'];
    if (!raw) return null;
    const m = String(raw).match(/\d+/);
    return m ? Number(m[0]) : String(raw);
  }

  async function overpass(query) {
    let lastErr;
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        const text = await overpassRequest(url, query);
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          return JSON.parse(trimmed);
        }
        // Not JSON: usually an HTML rate-limit / error page.
        console.warn(`${LOG} ${hostOf(url)} returned non-JSON (first 300 chars):`, trimmed.slice(0, 300));
        lastErr = new Error('Overpass busy at ' + hostOf(url));
      } catch (e) {
        console.warn(`${LOG} request to ${hostOf(url)} failed:`, e);
        lastErr = e;
      }
    }
    throw lastErr || new Error('All Overpass endpoints failed');
  }

  function overpassRequest(url, query) {
    const body = 'data=' + encodeURIComponent(query);
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST', url, data: body, timeout: 90000,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          onload: r => {
            if (r.status >= 200 && r.status < 300) resolve(r.responseText || '');
            else reject(new Error('HTTP ' + r.status + ' from ' + hostOf(url)));
          },
          onerror: () => reject(new Error('network error to ' + hostOf(url))),
          ontimeout: () => reject(new Error('timeout from ' + hostOf(url))),
        });
      });
    }
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
  }

  function hostOf(u) { try { return new URL(u).host; } catch (e) { return u; } }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---------- compare + render ----------
  function buildRow(w, osmVal, osmWay) {
    const wazeVals = [...new Set([w.fwd, w.rev].filter(v => v != null))];
    const wazeStr = `${w.fwd ?? '—'}/${w.rev ?? '—'}`;
    const osmStr = (osmVal == null) ? '—' : String(osmVal);

    let status;
    if (osmVal === undefined) status = 'NO OSM';
    else if (!wazeVals.length && osmVal == null) status = 'MISSING BOTH';
    else if (!wazeVals.length) status = 'MISSING WAZE';
    else if (osmVal == null) status = 'MISSING OSM';
    else if (wazeVals.every(v => String(v) === String(osmVal))) status = 'MATCH';
    else status = 'MISMATCH';

    return {
      id: w.id, name: w.name, waze: wazeStr, osm: osmStr, status,
      osmWayId: osmWay ? osmWay.id : null,
      mid: w.coords[Math.floor(w.coords.length / 2)],
    };
  }

  const STATUS_ORDER = { 'MISMATCH': 0, 'MISSING OSM': 1, 'MISSING WAZE': 2, 'MISSING BOTH': 3, 'NO OSM': 4, 'MATCH': 5 };
  const STATUS_COLOR = {
    'MATCH': '#1a7f37', 'MISMATCH': '#cf222e', 'MISSING OSM': '#bf8700',
    'MISSING WAZE': '#bf8700', 'MISSING BOTH': '#bf8700', 'NO OSM': '#888',
  };

  function renderResults(pane, rows) {
    rows.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.name.localeCompare(b.name));

    const counts = rows.reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {});
    const summary = Object.keys(STATUS_ORDER).filter(k => counts[k]).map(k => `${k}: ${counts[k]}`).join('  •  ');
    pane.querySelector('#woz-summary').textContent = `${rows.length} segments — ${summary}`;
    setStatus(pane, 'Done. Click a row to jump to the segment.');

    let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="text-align:left;border-bottom:1px solid #ccc;">
        <th>Road</th><th>Waze</th><th>OSM</th><th>Status</th>
      </tr></thead><tbody>`;
    for (const r of rows) {
      html += `<tr class="woz-row" data-id="${r.id}" data-lon="${r.mid[0]}" data-lat="${r.mid[1]}"
        style="cursor:pointer;border-bottom:1px solid #eee;">
        <td title="seg ${r.id}${r.osmWayId ? ' / osm ' + r.osmWayId : ''}">${escapeHtml(r.name)}</td>
        <td>${r.waze}</td><td>${r.osm}</td>
        <td style="color:${STATUS_COLOR[r.status] || '#000'};font-weight:bold;">${r.status}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    const container = pane.querySelector('#woz-results');
    container.innerHTML = html;

    container.querySelectorAll('.woz-row').forEach(tr => {
      tr.addEventListener('click', () => jumpTo(Number(tr.dataset.id), Number(tr.dataset.lon), Number(tr.dataset.lat)));
    });

    const csvBtn = pane.querySelector('#woz-csv');
    csvBtn.style.display = '';
    csvBtn.onclick = () => copyCsv(rows, csvBtn);
  }

  function jumpTo(segmentId, lon, lat) {
    if (sdk) {
      try { sdk.Map.setMapCenter({ lonLat: { lon, lat } }); } catch (e) { /* ignore */ }
      try { sdk.Editing.setSelection({ selection: { ids: [segmentId], objectType: 'segment' } }); } catch (e) { /* ignore */ }
    }
  }

  function copyCsv(rows, btn) {
    const lines = ['segment_id,road,waze_fwd_rev,osm_maxspeed,status,osm_way_id'];
    for (const r of rows) lines.push([r.id, csvCell(r.name), r.waze, r.osm, r.status, r.osmWayId || ''].join(','));
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const old = btn.textContent; btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = old), 1500);
    }).catch(() => { console.log(text); btn.textContent = 'See console'; });
  }

  function csvCell(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();