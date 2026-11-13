import type { Level, PalaceDoc, V2 } from '../model/schema';
import { byLevel, levelsSorted, openingsByWall, wallDir, wallLength } from '../model/queries';
import { pointInPolygon, rot2 } from '../model/geometry2d';
import { dirVec } from '../model/stairs';
import { ANIMATED_CATS, CATALOG } from '../catalog/furniture';
import type { HeightFn } from '../geom/site';

export interface Seg { a: V2; b: V2; r: number; y0: number; y1: number }

/** Solid wall pieces (door/arch gaps removed) plus furniture/mass outlines. */
export function buildColliders(doc: PalaceDoc): Seg[] {
  const segs: Seg[] = [];
  const ops = openingsByWall(doc);
  for (const w of Object.values(doc.walls)) {
    const lv = doc.levels[w.level];
    if (!lv) continue;
    const L = wallLength(w);
    const [ux, uz] = wallDir(w);
    const at = (u: number): V2 => [w.a[0] + ux * u, w.a[1] + uz * u];
    let u = 0;
    for (const o of ops.get(w.id) ?? []) {
      if (o.kind === 'window' && o.sill > 0.4) continue;
      const a = o.offset - o.width / 2, b = o.offset + o.width / 2;
      if (a > u) segs.push({ a: at(u), b: at(a), r: w.thickness / 2, y0: lv.elevation, y1: lv.elevation + w.height });
      u = b;
    }
    if (L > u) segs.push({ a: at(u), b: at(L), r: w.thickness / 2, y0: lv.elevation, y1: lv.elevation + w.height });
  }
  const boxSegs = (cx: number, cz: number, w: number, d: number, rot: number, y0: number, y1: number) => {
    const c: V2[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map((p) => {
      const r = rot2(p as V2, rot);
      return [r[0] + cx, r[1] + cz] as V2;
    });
    for (let i = 0; i < 4; i++) segs.push({ a: c[i], b: c[(i + 1) % 4], r: 0.02, y0, y1 });
  };
  for (const f of Object.values(doc.furniture)) {
    const lv = doc.levels[f.level];
    const item = CATALOG[f.cat];
    if (!lv || !item || f.cat === 'rug' || f.cat === 'chandelier' || ANIMATED_CATS.has(f.cat)) continue;
    boxSegs(f.pos[0], f.pos[1], item.dims[0] / 100, item.dims[1] / 100, f.rot, lv.elevation + (f.dy ?? 0), lv.elevation + item.dims[2] / 100);
  }
  // Floor voids (galleries, the river channel) are railed: the railing is solid.
  for (const r of Object.values(doc.rooms)) {
    const lv = doc.levels[r.level];
    if (!lv) continue;
    for (const h of r.holes ?? []) {
      for (let i = 0; i < h.length; i++) segs.push({ a: h[i], b: h[(i + 1) % h.length], r: 0.04, y0: lv.elevation, y1: lv.elevation + 1 });
    }
  }
  for (const m of Object.values(doc.masses)) {
    const lv = doc.levels[m.level];
    if (!lv) continue;
    boxSegs(m.center[0], m.center[1], m.size[0], m.size[2], m.rot, lv.elevation + m.dy, lv.elevation + m.dy + m.size[1]);
  }
  return segs;
}

/** Push a circle at p out of every segment overlapping the body's height band. */
export function resolve(p: V2, radius: number, feet: number, segs: Seg[]): V2 {
  let [x, z] = p;
  for (let pass = 0; pass < 3; pass++) {
    for (const s of segs) {
      if (s.y1 <= feet + 0.35 || s.y0 >= feet + 1.7) continue;
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2));
      const cx = s.a[0] + dx * t, cz = s.a[1] + dz * t;
      const ex = x - cx, ez = z - cz;
      const d = Math.hypot(ex, ez);
      const min = radius + s.r;
      if (d < min) {
        if (d < 1e-6) { x += min; continue; }
        x = cx + (ex / d) * min;
        z = cz + (ez / d) * min;
      }
    }
  }
  return [x, z];
}

/** Ground height under p for a body whose feet are at `feet` (steps up to 0.45 m). */
export function groundAt(doc: PalaceDoc, p: V2, feet: number, height: HeightFn): number {
  const cands: number[] = [height(p[0], p[1])];
  const levels = levelsSorted(doc);
  for (const lv of levels) {
    if (byLevel(doc.rooms, lv.id).some((r) => pointInPolygon(p, r.polygon))) cands.push(lv.elevation);
    for (const s of byLevel(doc.slabs, lv.id)) if (pointInPolygon(p, s.polygon)) cands.push(lv.elevation + s.dy);
  }
  for (const s of Object.values(doc.stairs)) {
    const lv = doc.levels[s.level];
    if (!lv) continue;
    const [ux, uz] = dirVec(s.dir);
    const rx = p[0] - s.start[0], rz = p[1] - s.start[1];
    const u = rx * ux + rz * uz, n = Math.abs(-rx * uz + rz * ux);
    if (u < -0.05 || u > s.run + 0.05 || n > s.width / 2) continue;
    const base = lv.elevation + Math.min(0, s.rise);
    cands.push(base + Math.abs(s.rise) * Math.max(0, Math.min(1, u / s.run)));
  }
  let best = -Infinity;
  for (const c of cands) if (c <= feet + 0.45 && c > best) best = c;
  return best === -Infinity ? Math.min(...cands) : best;
}

export function levelAtHeight(doc: PalaceDoc, feet: number): Level | undefined {
  let best: Level | undefined;
  for (const l of levelsSorted(doc)) if (l.elevation <= feet + 0.5) best = l;
  return best;
}
