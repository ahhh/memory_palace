/** FROZEN (v1). Helpers shared by the style generators. */
import type { Id, PlantKind, RoofKind, RoomType } from '../../../model/schema';
import type { DocBuilder } from './builder';
import type { RoomSpec, WindowSpec } from './layout';
import { type Rect, R, contains, overlaps } from './rect';
import type { Rng } from './rng';
import { DIR12 } from './trig';

const PUBLIC: RoomType[] = ['living', 'dining', 'kitchen', 'salon', 'music', 'library', 'ballroom', 'gallery'];

/** Sensible default door costs; styles may wrap this. */
export function baseDoorCost(a: RoomSpec, b: RoomSpec): number | null {
  const t = [a.type, b.type].sort().join('-');
  if (a.type === 'hall' || b.type === 'hall') {
    const other = a.type === 'hall' ? b : a;
    if (other.type === 'hall') return 1;
    return other.type === 'garage' ? 3 : 1;
  }
  switch (t) {
    case 'dining-living': case 'dining-kitchen': return 1;
    case 'kitchen-living': return 2;
    case 'garage-kitchen': case 'kitchen-laundry': case 'garage-laundry': return 2;
    case 'bath-bedroom': case 'bedroom-closet': return 2;
    case 'bedroom-bedroom': case 'bath-bath': return null;
  }
  if (a.type === 'bath' || b.type === 'bath' || a.type === 'garage' || b.type === 'garage') return null;
  if (a.type === 'bedroom' || b.type === 'bedroom') return 6;
  if (PUBLIC.includes(a.type) && PUBLIC.includes(b.type)) return 2;
  return 4;
}

export const openPlanArch = (a: RoomSpec, b: RoomSpec) => {
  const t = [a.type, b.type].sort().join('-');
  return t === 'dining-living' || t === 'dining-kitchen' || t === 'kitchen-living';
};

export const W = (width: number, height: number, sill: number, spacing: number): WindowSpec =>
  ({ width, height, sill, mode: 'spaced', spacing, gap: 0 });
export const RIBBON = (width: number, height: number, sill: number, gap = 10): WindowSpec =>
  ({ width, height, sill, mode: 'ribbon', spacing: 0, gap });

export const STEP_RISE = 18;
export const STEP_RUN = 26;
export const stairRun = (rise: number) => Math.ceil(Math.abs(rise) / STEP_RISE) * STEP_RUN;

/**
 * Add a stair whose footprint is `width` wide, starting at bottom-edge center (sx, sz)
 * and ascending toward `dir`. Returns the footprint rectangle.
 */
export function stair(b: DocBuilder, level: Id, sx: number, sz: number, dir: number, width: number, rise: number): Rect {
  const run = stairRun(rise);
  b.stair(level, sx, sz, dir, width, run, rise);
  const h = width / 2;
  switch (dir) {
    case 0: return R(sx, sz - h, sx + run, sz + h);
    case 180: return R(sx - run, sz - h, sx, sz + h);
    case 90: return R(sx - h, sz, sx + h, sz + run);
    default: return R(sx - h, sz - run, sx + h, sz);
  }
}

export interface LevelFootprint { level: Id; elevation: number; height: number; rects: Rect[] }
export interface RoofStyle { kind: RoofKind; pitch: number; overhang: number; thickness: number; material: string }

/** Roof every footprint rect not fully covered by the level above; partly covered → flat. */
export function roofs(b: DocBuilder, levels: LevelFootprint[], style: RoofStyle, flatStyle?: RoofStyle) {
  levels.forEach((lv, i) => {
    const above = levels[i + 1]?.rects ?? [];
    for (const r of lv.rects) {
      if (above.some((a) => contains(a, r))) continue;
      const partly = above.some((a) => overlaps(a, r));
      const s = partly ? (flatStyle ?? { ...style, kind: 'flat' as const, pitch: 0 }) : style;
      b.roof(lv.level, r, s.kind, s.pitch, s.overhang, lv.elevation + lv.height, s.thickness, s.material);
    }
  });
}

/** Irregular 12-gon blob, integer cm. */
export function blob(rng: Rng, cxv: number, czv: number, rx: number, rz: number, jitter = 25): [number, number][] {
  return DIR12.map(([dx, dz]) => {
    const k = 100 - jitter + rng.int(0, 2 * jitter);
    return [Math.round(cxv + (dx * rx * k) / 100), Math.round(czv + (dz * rz * k) / 100)] as [number, number];
  });
}

/** Rejection-sample plants inside `area`, avoiding rects. */
export function scatter(
  b: DocBuilder, rng: Rng, n: number, area: Rect, avoid: Rect[], kinds: PlantKind[], minScale = 80, maxScale = 130,
) {
  let placed = 0;
  for (let tries = 0; tries < n * 12 && placed < n; tries++) {
    const x = rng.int(area.x0, area.x1), z = rng.int(area.z0, area.z1);
    const spot = R(x - 150, z - 150, x + 150, z + 150);
    if (avoid.some((a) => overlaps(a, spot))) continue;
    avoid.push(R(x - 120, z - 120, x + 120, z + 120));
    b.plant(rng.pick(kinds), x, z, rng.int(minScale, maxScale));
    placed++;
  }
}

/** Row of plants (e.g. a hedge or an allée) between two points. */
export function row(b: DocBuilder, kind: PlantKind, x0: number, z0: number, x1: number, z1: number, n: number, scale = 100) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    b.plant(kind, Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t), scale);
  }
}

export function setSite(b: DocBuilder, w: number, d: number, ground: string, amp: number, seed: number, baseY = 0, scale = 2400) {
  b.doc.site = { size: [w / 100, d / 100], ground, terrain: { baseY: baseY / 100, amp: amp / 100, scale: scale / 100, seed } };
}

export const room = (rect: Rect, type: RoomType, label: string, floor: string, extra: Partial<RoomSpec> = {}): RoomSpec =>
  ({ rect, type, label, floor, ...extra });
