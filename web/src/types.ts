// Shared domain types for RouteSense.

export type Sev = "high" | "med" | "low";
export type Tags = Record<string, string>;
export type LatLon = [number, number];

// ---------- contributor mode ----------
export interface Changeset {
  id: number;
  created_at: string;
  changes: number;
  comment: string;
}

export interface PerChangeset {
  id: number;
  km: number;
  n: number;
}

export interface MileageResult {
  totalKm: number;
  ways: number;
  missing: number;
  perCs: PerChangeset[];
  highwaysOnly: boolean;
  csCount: number;
  drawn: LatLon[][];
}

// ---------- changeset inspector ----------
export interface OscElement {
  type: string;
  id: number;
  version: number;
  lat: number | null;
  lon: number | null;
  tags: Tags;
}

export interface Actions {
  created: OscElement[];
  modified: OscElement[];
  deleted: OscElement[];
}

export type DiffKind = "added" | "removed" | "changed";
export interface TagDiff {
  k: string;
  o?: string;
  n?: string;
  kind: DiffKind;
}

export interface OldInfo {
  tags: Tags;
  lat?: number;
  lon?: number;
}

export type ActionName = "created" | "modified" | "deleted";
export interface DiffRow {
  e: OscElement;
  action: ActionName;
  diff: TagDiff[] | null;
  moved: number | null;
}

export interface ChangesetMeta {
  id?: number;
  user?: string;
  created_at?: string;
  closed_at?: string;
  tags?: Tags;
  min_lat?: number;
  min_lon?: number;
  max_lat?: number;
  max_lon?: number;
}

export interface MapLine {
  coords: LatLon[];
  color: string;
  weight?: number;
  dash?: string;
}
export interface MapMarker {
  lat: number;
  lon: number;
  color: string;
  hollow?: boolean;
}
export interface MapMove {
  from: LatLon;
  to: LatLon;
}
export interface Features {
  lines: MapLine[];
  markers: MapMarker[];
  moves: MapMove[];
}

export interface AdiffWays {
  deleted: LatLon[][];
  oldModified: { id: number; coords: LatLon[] }[];
}

// ---------- road mode ----------
export interface Way {
  id: number;
  km: number;
  maxspeed: number | string | null;
  maxspeedRaw: string;
  name: string;
  ref: string;
  roadName: string;
  highway: string;
  oneway: string;
  tags: Tags;
  coords: LatLon[];
  nodeKeys: string[];
  endKeys: [string, string];
}

export interface RouteItem {
  wi: number;
  forward: boolean;
}
export type Segment = RouteItem[];

export interface Issue {
  sev: Sev;
  check: string;
  detail: string;
  where: { lat: number; lon: number } | null;
  link: string | null;
  josm: string | null;
  wayId: number | null;
}

export interface RestrictionMemberWay {
  ref: number;
  coords: LatLon[];
}
export interface RestrictionMemberNode {
  ref: number;
  coord: LatLon;
}
export interface Restriction {
  id: number;
  restriction: string;
  from: RestrictionMemberWay[];
  to: RestrictionMemberWay[];
  via: RestrictionMemberNode[];
  viaWays: RestrictionMemberWay[];
}

// geometry as returned by Overpass `out geom`
export interface OverpassGeom {
  lat: number;
  lon: number;
}
export interface WayGeom {
  km: number;
  highway: boolean;
  ref: string;
  maxspeed: number | string | null;
  coords: LatLon[];
}
