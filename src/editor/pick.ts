import type { CollectionKey, Id, PalaceDoc, V2 } from '../model/schema';
import { byLevel, wallLength } from '../model/queries';
import { dist, pointInPolygon, projectToSegment, rot2 } from '../model/geometry2d';
import { stairFootprint } from '../model/stairs';
import { CATALOG } from '../catalog/furniture';

export interface Pick { kind: CollectionKey; id: Id }

export function furnitureContains(cat: string, pos: V2, rot: number, p: V2, pad = 0): boolean {
  const item = CATALOG[cat];
  const [w, d] = item ? [item.dims[0] / 100, item.dims[1] / 100] : [0.5, 0.5];
  const local = rot2([p[0] - pos[0], p[1] - pos[1]], -rot);
  return Math.abs(local[0]) <= w / 2 + pad && Math.abs(local[1]) <= d / 2 + pad;
}

/** What's under plan point p on a level, most specific first. */
export function pickAt(doc: PalaceDoc, level: Id, p: V2): Pick | null {
  for (const a of byLevel(doc.anchors, level)) if (dist([a.pos[0], a.pos[2]], p) < 0.4) return { kind: 'anchors', id: a.id };
  const furn = byLevel(doc.furniture, level).reverse();
  for (const f of furn) if (f.cat !== 'rug' && furnitureContains(f.cat, f.pos, f.rot, p)) return { kind: 'furniture', id: f.id };
  for (const o of Object.values(doc.openings)) {
    const w = doc.walls[o.wall];
    if (!w || w.level !== level) continue;
    const { t, d } = projectToSegment(p, w.a, w.b);
    const at = t * wallLength(w);
    if (d < w.thickness / 2 + 0.15 && Math.abs(at - o.offset) < o.width / 2) return { kind: 'openings', id: o.id };
  }
  for (const w of byLevel(doc.walls, level)) {
    if (projectToSegment(p, w.a, w.b).d < w.thickness / 2 + 0.08) return { kind: 'walls', id: w.id };
  }
  for (const s of byLevel(doc.stairs, level)) if (pointInPolygon(p, stairFootprint(s))) return { kind: 'stairs', id: s.id };
  for (const m of byLevel(doc.masses, level)) {
    const local = rot2([p[0] - m.center[0], p[1] - m.center[1]], -m.rot);
    if (Math.abs(local[0]) <= m.size[0] / 2 && Math.abs(local[1]) <= m.size[2] / 2) return { kind: 'masses', id: m.id };
  }
  for (const f of furn) if (f.cat === 'rug' && furnitureContains(f.cat, f.pos, f.rot, p)) return { kind: 'furniture', id: f.id };
  const rooms = byLevel(doc.rooms, level).filter((r) => pointInPolygon(p, r.polygon));
  if (rooms.length) return { kind: 'rooms', id: rooms[rooms.length - 1].id };
  for (const s of byLevel(doc.slabs, level)) if (pointInPolygon(p, s.polygon)) return { kind: 'slabs', id: s.id };
  return null;
}

/** Nearest wall to p within maxDist, with the offset along it. */
export function nearestWall(doc: PalaceDoc, level: Id, p: V2, maxDist = 0.6) {
  let best: { id: Id; offset: number; d: number } | null = null;
  for (const w of byLevel(doc.walls, level)) {
    const { t, d } = projectToSegment(p, w.a, w.b);
    if (d < maxDist && (!best || d < best.d)) best = { id: w.id, offset: t * wallLength(w), d };
  }
  return best;
}

/** Everything on a level whose reference point(s) fall inside the plan rectangle. */
export function pickInRect(doc: PalaceDoc, level: Id, a: V2, b: V2): Pick[] {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
  const inside = (p: V2) => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1;
  const out: Pick[] = [];
  for (const w of byLevel(doc.walls, level)) if (inside(w.a) && inside(w.b)) out.push({ kind: 'walls', id: w.id });
  for (const r of byLevel(doc.rooms, level)) if (r.polygon.every(inside)) out.push({ kind: 'rooms', id: r.id });
  for (const f of byLevel(doc.furniture, level)) if (inside(f.pos)) out.push({ kind: 'furniture', id: f.id });
  for (const an of byLevel(doc.anchors, level)) if (inside([an.pos[0], an.pos[2]])) out.push({ kind: 'anchors', id: an.id });
  for (const m of byLevel(doc.masses, level)) if (inside(m.center)) out.push({ kind: 'masses', id: m.id });
  for (const s of byLevel(doc.stairs, level)) if (inside(s.start)) out.push({ kind: 'stairs', id: s.id });
  for (const s of byLevel(doc.slabs, level)) if (s.polygon.every(inside)) out.push({ kind: 'slabs', id: s.id });
  return out;
}

/** A wall endpoint of one of `wallIds` within `r` of p. */
export function endpointNear(doc: PalaceDoc, wallIds: Id[], p: V2, r = 0.3): V2 | null {
  let best: V2 | null = null, bd = r;
  for (const id of wallIds) {
    const w = doc.walls[id];
    if (!w) continue;
    for (const e of [w.a, w.b]) {
      const d = dist(e, p);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}
