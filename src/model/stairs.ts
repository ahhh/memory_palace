import type { Level, PalaceDoc, Stair, V2 } from './schema';

export const dirVec = (deg: number): V2 => {
  switch (((deg % 360) + 360) % 360) {
    case 0: return [1, 0];
    case 90: return [0, 1];
    case 180: return [-1, 0];
    case 270: return [0, -1];
    default: { const r = (deg * Math.PI) / 180; return [Math.cos(r), Math.sin(r)]; }
  }
};

export function stairTop(s: Stair): V2 {
  const d = dirVec(s.dir);
  return [s.start[0] + d[0] * s.run, s.start[1] + d[1] * s.run];
}

/** Footprint corners (plan). */
export function stairFootprint(s: Stair): V2[] {
  const d = dirVec(s.dir);
  const n: V2 = [-d[1], d[0]];
  const h = s.width / 2;
  const a: V2 = [s.start[0] + n[0] * h, s.start[1] + n[1] * h];
  const b: V2 = [s.start[0] - n[0] * h, s.start[1] - n[1] * h];
  const t = stairTop(s);
  const c: V2 = [t[0] - n[0] * h, t[1] - n[1] * h];
  const e: V2 = [t[0] + n[0] * h, t[1] + n[1] * h];
  return [a, b, c, e];
}

/** The level a stair arrives at (by elevation), if any. */
export function stairTargetLevel(doc: PalaceDoc, s: Stair): Level | undefined {
  const from = doc.levels[s.level];
  if (!from) return undefined;
  const y = from.elevation + s.rise;
  return Object.values(doc.levels).find((l) => Math.abs(l.elevation - y) < 0.05);
}
