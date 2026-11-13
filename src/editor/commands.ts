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
