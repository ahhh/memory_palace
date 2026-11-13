import type { Id, PalaceDoc, V2 } from '../model/schema';
import { byLevel } from '../model/queries';
import { dist, projectToSegment } from '../model/geometry2d';

export type SnapKind = 'endpoint' | 'wall' | 'angle' | 'grid' | 'free';
export interface Snap { p: V2; kind: SnapKind; wall?: Id }

const roundTo = (v: number, s: number) => Math.round(v / s) * s;

/**
 * Snapping, first match wins: wall endpoints → point on a wall → 0/45/90° from the
 * chain start → grid. `free` disables everything (Alt).
 */
export function snapPoint(doc: PalaceDoc, level: Id, raw: V2, opts: { from?: V2 | null; grid: number; free?: boolean; radius?: number }): Snap {
  if (opts.free) return { p: [Math.round(raw[0] * 100) / 100, Math.round(raw[1] * 100) / 100], kind: 'free' };
  const r = opts.radius ?? 0.25;
  const walls = byLevel(doc.walls, level);
  let best: Snap | null = null, bd = r;
  for (const w of walls) for (const e of [w.a, w.b]) {
    const d = dist(e, raw);
    if (d < bd) { bd = d; best = { p: [e[0], e[1]], kind: 'endpoint', wall: w.id }; }
  }
  if (best) return best;
  if (opts.from) {
    const dx = raw[0] - opts.from[0], dz = raw[1] - opts.from[1];
    const L = Math.hypot(dx, dz);
    if (L > 0.05) {
      const ang = Math.atan2(dz, dx);
      const snapAng = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(ang - snapAng) < 0.12) {
        const Ls = roundTo(L, opts.grid);
        const p: V2 = [opts.from[0] + Math.cos(snapAng) * Ls, opts.from[1] + Math.sin(snapAng) * Ls];
        return { p: [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100], kind: 'angle' };
      }
    }
  }
  for (const w of walls) {
    const { point, d } = projectToSegment(raw, w.a, w.b);
    if (d < r * 0.6) return { p: [Math.round(point[0] * 100) / 100, Math.round(point[1] * 100) / 100], kind: 'wall', wall: w.id };
  }
  return { p: [roundTo(raw[0], opts.grid), roundTo(raw[1], opts.grid)].map((v) => Math.round(v * 100) / 100) as V2, kind: 'grid' };
}
