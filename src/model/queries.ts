import type { Id, Level, Opening, PalaceDoc, Room, V2, Wall } from './schema';
import { sortedIds } from './ids';
import { add, len, pointInPolygon, polygonArea, scale, sub } from './geometry2d';

export function levelsSorted(doc: PalaceDoc): Level[] {
  return Object.values(doc.levels).sort((a, b) => a.index - b.index);
}

export function byLevel<T extends { level: Id }>(rec: Record<Id, T>, level: Id): T[] {
  return sortedIds(rec).map((id) => rec[id]).filter((e) => e.level === level);
}

export function wallLength(w: Wall) {
  return len(sub(w.b, w.a));
}

export function wallDir(w: Wall): V2 {
  const d = sub(w.b, w.a);
  const l = len(d) || 1;
  return [d[0] / l, d[1] / l];
}

/** Left-hand normal in plan coordinates. */
export function wallNormal(w: Wall): V2 {
  const [dx, dz] = wallDir(w);
  return [dz, -dx];
}

export function wallPoint(w: Wall, offset: number): V2 {
  return add(w.a, scale(wallDir(w), offset));
}

export function openingsOfWall(doc: PalaceDoc, wallId: Id): Opening[] {
  return sortedIds(doc.openings).map((id) => doc.openings[id]).filter((o) => o.wall === wallId)
    .sort((a, b) => a.offset - b.offset);
}

export function openingsByWall(doc: PalaceDoc): Map<Id, Opening[]> {
  const m = new Map<Id, Opening[]>();
  for (const id of sortedIds(doc.openings)) {
    const o = doc.openings[id];
    const arr = m.get(o.wall) ?? [];
    arr.push(o);
    m.set(o.wall, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.offset - b.offset);
  return m;
}

export function roomAt(doc: PalaceDoc, level: Id, p: V2): Room | null {
  let best: Room | null = null;
  let bestArea = Infinity;
  for (const r of byLevel(doc.rooms, level)) {
    if (pointInPolygon(p, r.polygon)) {
      const a = Math.abs(polygonArea(r.polygon));
      if (a < bestArea) { best = r; bestArea = a; }
    }
  }
  return best;
}

/** Rooms on either side of a point on a wall. */
export function roomsBesideWall(doc: PalaceDoc, w: Wall, offset: number): [Room | null, Room | null] {
  const p = wallPoint(w, offset);
  const n = wallNormal(w);
  const d = w.thickness / 2 + 0.15;
  return [roomAt(doc, w.level, add(p, scale(n, d))), roomAt(doc, w.level, add(p, scale(n, -d)))];
}

export interface DoorLink { opening: Opening; wall: Wall; a: Room | null; b: Room | null; point: V2 }

/** All passable openings with the rooms they connect (null = outside). */
export function doorLinks(doc: PalaceDoc): DoorLink[] {
  const out: DoorLink[] = [];
  for (const id of sortedIds(doc.openings)) {
    const o = doc.openings[id];
    if (o.kind === 'window') continue;
    const w = doc.walls[o.wall];
    if (!w) continue;
    const [a, b] = roomsBesideWall(doc, w, o.offset);
    out.push({ opening: o, wall: w, a, b, point: wallPoint(w, o.offset) });
  }
  return out;
}

export function levelOfIndex(doc: PalaceDoc, index: number): Level | undefined {
  return Object.values(doc.levels).find((l) => l.index === index);
}
