/** Pure document mutators. Call them on an immer draft (or a fresh clone). */
import type { Anchor, CollectionKey, Id, OpeningKind, PalaceDoc, RoomType, V2, V3, Wall } from '../model/schema';
import { COLLECTIONS } from '../model/schema';
import { newId } from '../model/ids';
import { q, q2, q3, deg } from '../model/units';
import { OPENING_DEFAULTS, WALL_HEIGHT } from '../model/defaults';
import { byLevel, levelsSorted, openingsOfWall, roomAt, wallLength } from '../model/queries';
import { dist, projectToSegment, rectPoly } from '../model/geometry2d';

const EPS = 0.02;

export function splitWallAt(d: PalaceDoc, wallId: Id, p: V2): Id | null {
  const w = d.walls[wallId];
  if (!w) return null;
  const { t, point } = projectToSegment(p, w.a, w.b);
  const L = wallLength(w);
  const at = t * L;
  if (at < 0.05 || at > L - 0.05) return null;
  const id = newId(d, 'walls');
  const mid = q2(point);
  d.walls[id] = { ...w, id, a: mid, b: w.b };
  w.b = mid;
  for (const o of openingsOfWall(d, wallId)) {
    const draft = d.openings[o.id];
    if (o.offset > at) { draft.wall = id; draft.offset = q(o.offset - at); }
  }
  // Drop openings now straddling the split.
  for (const o of Object.values(d.openings)) {
    const ww = d.walls[o.wall];
    if ((o.wall === wallId || o.wall === id) && (o.offset - o.width / 2 < -EPS || o.offset + o.width / 2 > wallLength(ww) + EPS)) delete d.openings[o.id];
  }
  return id;
}

/** Split any wall on this level whose interior passes through p (T-junctions). */
function splitAt(d: PalaceDoc, level: Id, p: V2) {
  for (const w of byLevel(d.walls, level)) {
    if (dist(w.a, p) < EPS || dist(w.b, p) < EPS) continue;
    const { d: dd } = projectToSegment(p, w.a, w.b);
    if (dd < EPS) { splitWallAt(d, w.id, p); return; }
  }
}

export interface WallProps { thickness?: number; height?: number; material?: string; exterior?: boolean }

export function addWall(d: PalaceDoc, level: Id, a: V2, b: V2, props: WallProps = {}): Id | null {
  a = q2(a); b = q2(b);
  if (dist(a, b) < 0.1) return null;
  splitAt(d, level, a);
  splitAt(d, level, b);
  const lv = d.levels[level];
  const id = newId(d, 'walls');
  d.walls[id] = {
    id, level, a, b,
    thickness: q(props.thickness ?? 0.2), height: q(props.height ?? lv?.height ?? WALL_HEIGHT),
    exterior: props.exterior ?? true, material: props.material ?? 'plaster',
  };
  return id;
}

/** Axis-aligned spans of existing walls on the line, used to avoid duplicate walls. */
function coveredSpans(d: PalaceDoc, level: Id, axis: 'x' | 'z', c: number): [number, number][] {
  const out: [number, number][] = [];
  for (const w of byLevel(d.walls, level)) {
    if (axis === 'x' && Math.abs(w.a[1] - c) < EPS && Math.abs(w.b[1] - c) < EPS) out.push([Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])]);
    if (axis === 'z' && Math.abs(w.a[0] - c) < EPS && Math.abs(w.b[0] - c) < EPS) out.push([Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function uncovered(lo: number, hi: number, spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let s = lo;
  for (const [a, b] of spans) {
    if (b <= s + EPS) continue;
    if (a >= hi - EPS) break;
    if (a > s + EPS) out.push([s, Math.min(a, hi)]);
    s = Math.max(s, b);
  }
  if (hi > s + EPS) out.push([s, hi]);
  return out;
}

/** Sims-style room tool: a rectangle of walls (skipping existing ones) plus a floor. */
export function addRoomRect(d: PalaceDoc, level: Id, p0: V2, p1: V2, props: WallProps & { label?: string; type?: RoomType; floor?: string } = {}): Id | null {
  const x0 = q(Math.min(p0[0], p1[0])), x1 = q(Math.max(p0[0], p1[0]));
  const z0 = q(Math.min(p0[1], p1[1])), z1 = q(Math.max(p0[1], p1[1]));
  if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return null;
  const edges: { axis: 'x' | 'z'; c: number; lo: number; hi: number }[] = [
    { axis: 'x', c: z0, lo: x0, hi: x1 }, { axis: 'x', c: z1, lo: x0, hi: x1 },
    { axis: 'z', c: x0, lo: z0, hi: z1 }, { axis: 'z', c: x1, lo: z0, hi: z1 },
  ];
  for (const e of edges) {
    for (const [a, b] of uncovered(e.lo, e.hi, coveredSpans(d, level, e.axis, e.c))) {
      if (e.axis === 'x') addWall(d, level, [a, e.c], [b, e.c], props);
      else addWall(d, level, [e.c, a], [e.c, b], props);
    }
  }
  const id = newId(d, 'rooms');
  d.rooms[id] = { id, level, polygon: rectPoly(x0, z0, x1, z1), label: props.label ?? 'Room', type: props.type ?? 'other', floor: props.floor ?? 'oak' };
  return id;
}

export function openingFits(d: PalaceDoc, wall: Wall, offset: number, width: number, ignore?: Id): boolean {
  const L = wallLength(wall);
  if (offset - width / 2 < 0.05 || offset + width / 2 > L - 0.05) return false;
  for (const o of openingsOfWall(d, wall.id)) {
    if (o.id === ignore) continue;
    if (offset - width / 2 < o.offset + o.width / 2 + 0.05 && o.offset - o.width / 2 < offset + width / 2 + 0.05) return false;
  }
  return true;
}

export function addOpening(d: PalaceDoc, wallId: Id, kind: OpeningKind, offset: number, size?: Partial<{ width: number; height: number; sill: number }>): Id | null {
  const w = d.walls[wallId];
  if (!w) return null;
  const def = { ...OPENING_DEFAULTS[kind], ...size };
  const height = Math.min(def.height, w.height - def.sill - 0.05);
  if (!openingFits(d, w, offset, def.width)) return null;
  const id = newId(d, 'openings');
  d.openings[id] = { id, wall: wallId, kind, offset: q(offset), width: q(def.width), height: q(height), sill: q(def.sill) };
  return id;
}

export function placeFurniture(d: PalaceDoc, level: Id, cat: string, pos: V2, rot: number): Id {
  const id = newId(d, 'furniture');
  d.furniture[id] = { id, level, cat, pos: q2(pos), rot: deg(rot) };
  return id;
}

export function addAnchor(d: PalaceDoc, level: Id, pos: V3, title: string, note = '', facing = 0): Id {
  const id = newId(d, 'anchors');
  const a: Anchor = { id, level, pos: q3(pos), facing: deg(facing), title, note };
  const room = roomAt(d, level, [pos[0], pos[2]]);
  if (room) a.room = room.id;
  d.anchors[id] = a;
  d.journey.push(id);
  return id;
}

export function moveAnchor(d: PalaceDoc, id: Id, pos: V3) {
  const a = d.anchors[id];
  if (!a) return;
  a.pos = q3(pos);
  const room = roomAt(d, a.level, [pos[0], pos[2]]);
  if (room) a.room = room.id; else delete a.room;
}

export function reorderJourney(d: PalaceDoc, from: number, to: number) {
  const [x] = d.journey.splice(from, 1);
  if (x !== undefined) d.journey.splice(to, 0, x);
}

export function deleteEntity(d: PalaceDoc, kind: CollectionKey, id: Id) {
  const rec = d[kind] as Record<Id, unknown>;
  if (!rec[id]) return;
  delete rec[id];
  if (kind === 'walls') for (const o of Object.values(d.openings)) if (o.wall === id) delete d.openings[o.id];
  if (kind === 'anchors') d.journey = d.journey.filter((a) => a !== id);
  if (kind === 'levels') {
    for (const k of COLLECTIONS) {
      const r = d[k] as Record<Id, { level?: Id; id: Id }>;
      for (const e of Object.values(r)) if (e.level === id) deleteEntity(d, k, e.id);
    }
  }
}

export function addLevelAbove(d: PalaceDoc): Id {
  const top = levelsSorted(d).at(-1);
  const id = newId(d, 'levels');
  const index = top ? top.index + 1 : 0;
  d.levels[id] = {
    id, index,
    elevation: top ? q(top.elevation + top.height + 0.2) : 0,
    height: WALL_HEIGHT,
    name: index === 0 ? 'Ground floor' : `Floor ${index + 1}`,
  };
  return id;
}

/** Copy a level's exterior walls onto another level as a starting outline. */
export function copyOutline(d: PalaceDoc, from: Id, to: Id) {
  const h = d.levels[to]?.height ?? WALL_HEIGHT;
  for (const w of byLevel(d.walls, from)) {
    if (!w.exterior) continue;
    const id = newId(d, 'walls');
    d.walls[id] = { ...w, id, level: to, height: h };
  }
}

/* ───────────────────────── Multi-selection editing ───────────────────────── */

export interface Sel { kind: CollectionKey; id: Id }
const MOVABLE: CollectionKey[] = ['walls', 'rooms', 'furniture', 'anchors', 'masses', 'stairs', 'slabs'];
export const isMovable = (k: CollectionKey) => MOVABLE.includes(k);

/** Move every selected entity by (dx, dz). Openings ride along on their walls. */
export function translateSelection(d: PalaceDoc, sels: Sel[], dx: number, dz: number) {
  const mv = (p: V2): V2 => q2([p[0] + dx, p[1] + dz]);
  for (const { kind, id } of sels) {
    switch (kind) {
      case 'walls': { const w = d.walls[id]; if (w) { w.a = mv(w.a); w.b = mv(w.b); } break; }
      case 'rooms': { const r = d.rooms[id]; if (r) { r.polygon = r.polygon.map(mv); if (r.holes) r.holes = r.holes.map((h) => h.map(mv)); } break; }
      case 'furniture': { const f = d.furniture[id]; if (f) f.pos = mv(f.pos); break; }
      case 'anchors': { const a = d.anchors[id]; if (a) moveAnchor(d, id, [a.pos[0] + dx, a.pos[1], a.pos[2] + dz]); break; }
      case 'masses': { const m = d.masses[id]; if (m) m.center = mv(m.center); break; }
      case 'stairs': { const s = d.stairs[id]; if (s) s.start = mv(s.start); break; }
      case 'slabs': { const s = d.slabs[id]; if (s) s.polygon = s.polygon.map(mv); break; }
    }
  }
}

/** Copy the selection (walls bring their openings), offset by (dx, dz). Returns the copies. */
export function duplicateSelection(d: PalaceDoc, sels: Sel[], dx: number, dz: number): Sel[] {
  const out: Sel[] = [];
  for (const { kind, id } of sels) {
    if (!isMovable(kind)) continue;
    const src = (d[kind] as Record<Id, { id: Id }>)[id];
    if (!src) continue;
    const nid = newId(d, kind);
    (d[kind] as Record<Id, unknown>)[nid] = { ...JSON.parse(JSON.stringify(src)), id: nid };
    if (kind === 'walls') {
      for (const o of openingsOfWall(d, id)) {
        const oid = newId(d, 'openings');
        d.openings[oid] = { ...o, id: oid, wall: nid };
      }
    }
    if (kind === 'anchors') d.journey.push(nid);
    out.push({ kind, id: nid });
  }
  translateSelection(d, out, dx, dz);
  return out;
}

export function rotateFurniture(d: PalaceDoc, sels: Sel[], by: number) {
  for (const s of sels) if (s.kind === 'furniture' && d.furniture[s.id]) d.furniture[s.id].rot = deg(d.furniture[s.id].rot + by);
}

export function deleteSelection(d: PalaceDoc, sels: Sel[]) {
  for (const s of sels) if (s.kind !== 'levels') deleteEntity(d, s.kind, s.id);
}

/**
 * Drag a wall corner: every wall end and room-floor corner on the level that sits on
 * `from` moves to `to`, so joined walls stay joined. Openings that no longer fit are
 * slid back inside their wall, or removed if the wall became too short.
 */
export function moveVertex(d: PalaceDoc, level: Id, from: V2, to: V2) {
  to = q2(to);
  const same = (p: V2) => dist(p, from) < 0.011;
  const touched: Id[] = [];
  for (const w of byLevel(d.walls, level)) {
    const draft = d.walls[w.id];
    if (same(w.a)) { draft.a = to; touched.push(w.id); }
    if (same(w.b)) { draft.b = to; touched.push(w.id); }
  }
  for (const r of byLevel(d.rooms, level)) {
    if (r.polygon.some(same)) d.rooms[r.id].polygon = r.polygon.map((p) => (same(p) ? to : p));
  }
  for (const wid of touched) {
    const w = d.walls[wid];
    const L = wallLength(w);
    if (L < 0.1) { deleteEntity(d, 'walls', wid); continue; }
    for (const o of openingsOfWall(d, wid)) {
      const half = o.width / 2;
      if (o.width > L - 0.1) { delete d.openings[o.id]; continue; }
      d.openings[o.id].offset = q(Math.min(Math.max(o.offset, half + 0.05), L - half - 0.05));
    }
  }
}
