/**
 * FROZEN (v1). Rule-based furniture placement. Dimensions here are frozen — the render
 * catalog may restyle an item but never change its footprint for existing ids.
 */
import type { Id, RoomType } from '../../../model/schema';
import type { DocBuilder } from './builder';
import type { LevelPlan, Piece } from './layout';
import { type Rect, R, cx, cz, inset, overlaps, rd, rw } from './rect';
import type { Rng } from './rng';

/** w (x), d (z, depth), h — cm. Front faces +z at rot 0. */
export const FURN_DIMS_V1: Record<string, [number, number, number]> = {
  bed_double: [160, 210, 60], bed_single: [100, 200, 60], nightstand: [50, 40, 55],
  wardrobe: [120, 60, 200], desk: [120, 60, 75], chair: [50, 50, 90], sofa: [220, 90, 85],
  armchair: [90, 90, 85], coffee_table: [110, 60, 45], tv_stand: [160, 45, 110],
  dining_table: [180, 90, 75], dining_chair: [45, 45, 95], counter: [240, 60, 90],
  fridge: [70, 70, 190], island: [180, 90, 90], toilet: [40, 70, 80], bathtub: [170, 75, 60],
  sink: [60, 45, 85], shower: [90, 90, 210], bookshelf: [100, 35, 200], piano: [150, 150, 100],
  plant: [50, 50, 120], rug: [240, 170, 1], car: [180, 450, 140], washer: [60, 60, 90],
  statue: [80, 80, 220], bench: [160, 45, 45], console: [120, 40, 80], long_table: [400, 110, 76],
  sideboard: [180, 50, 90], fireplace: [180, 60, 120], harp: [80, 100, 180], chandelier: [120, 120, 90],
  lounger: [70, 190, 40],
};

interface Placed { r: Rect; tall: boolean }

interface Ctx {
  b: DocBuilder; level: Id; room: Rect; rng: Rng;
  placed: Placed[]; doorZones: Rect[]; winZones: Rect[]; blockers: Rect[];
}

function footprint(cat: string, x: number, z: number, rot: number): Rect {
  const [w, d] = FURN_DIMS_V1[cat];
  const [fw, fd] = rot === 90 || rot === 270 ? [d, w] : [w, d];
  return R(x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2);
}

function ok(c: Ctx, cat: string, x: number, z: number, rot: number): boolean {
  const f = footprint(cat, x, z, rot);
  const room = inset(c.room, 14);
  if (f.x0 < room.x0 || f.z0 < room.z0 || f.x1 > room.x1 || f.z1 > room.z1) return false;
  if (cat === 'rug') return true;
  const tall = FURN_DIMS_V1[cat][2] > 95;
  for (const p of c.placed) if (overlaps(p.r, f)) return false;
  for (const z2 of c.doorZones) if (overlaps(z2, f)) return false;
  for (const bl of c.blockers) if (overlaps(bl, f)) return false;
  if (tall) for (const w of c.winZones) if (overlaps(w, f)) return false;
  return true;
}

function put(c: Ctx, cat: string, x: number, z: number, rot: number, dy?: number) {
  x = Math.round(x); z = Math.round(z);
  if (cat !== 'rug' && cat !== 'chandelier') c.placed.push({ r: footprint(cat, x, z, rot), tall: FURN_DIMS_V1[cat][2] > 95 });
  c.b.furniture(c.level, cat, x, z, rot, dy);
  return { cat, x, z, rot };
}
type P = ReturnType<typeof put>;

type WallSide = 'N' | 'S' | 'E' | 'W';
const ROT: Record<WallSide, number> = { N: 0, S: 180, E: 90, W: 270 };

/** Positions along a wall for an item with its back against that wall. */
function wallSpots(c: Ctx, cat: string, side: WallSide, corner: boolean): [number, number, number][] {
  const [w, d] = FURN_DIMS_V1[cat];
  const r = inset(c.room, 15);
  const rot = ROT[side];
  const alongX = side === 'N' || side === 'S';
  const lo = alongX ? r.x0 : r.z0, hi = alongX ? r.x1 : r.z1;
  const mid = Math.round((lo + hi) / 20) * 10;
  const along: number[] = corner ? [lo + w / 2, hi - w / 2] : [mid];
  for (let s = 30; s < (hi - lo) / 2; s += 30) along.push(mid - s, mid + s);
  if (!corner) along.push(lo + w / 2, hi - w / 2);
  const perp = side === 'N' ? r.z0 + d / 2 : side === 'S' ? r.z1 - d / 2 : side === 'W' ? r.x0 + d / 2 : r.x1 - d / 2;
  return along.map((a) => (alongX ? [a, perp, rot] : [perp, a, rot]));
}

function sidesByLength(c: Ctx): WallSide[] {
  const horiz: WallSide[] = c.rng.chance(0.5) ? ['N', 'S'] : ['S', 'N'];
  const vert: WallSide[] = c.rng.chance(0.5) ? ['W', 'E'] : ['E', 'W'];
  return rw(c.room) >= rd(c.room) ? [...horiz, ...vert] : [...vert, ...horiz];
}

function onWall(c: Ctx, cat: string, opts: { corner?: boolean; sides?: WallSide[] } = {}): P | null {
  for (const side of opts.sides ?? sidesByLength(c)) {
    for (const [x, z, rot] of wallSpots(c, cat, side, !!opts.corner)) {
      if (ok(c, cat, x, z, rot)) return put(c, cat, x, z, rot);
    }
  }
  return null;
}

/** Offset in the parent's local frame (lx along its width, lz toward its front). */
function local(parent: P, lx: number, lz: number): [number, number] {
  switch (parent.rot) {
    case 90: return [parent.x - lz, parent.z + lx];
    case 180: return [parent.x - lx, parent.z - lz];
    case 270: return [parent.x + lz, parent.z - lx];
    default: return [parent.x + lx, parent.z + lz];
  }
}

function near(c: Ctx, parent: P | null, cat: string, lx: number, lz: number, relRot: number): P | null {
  if (!parent) return null;
  const [x, z] = local(parent, lx, lz);
  const rot = (parent.rot + relRot) % 360;
  return ok(c, cat, x, z, rot) ? put(c, cat, x, z, rot) : null;
}

function center(c: Ctx, cat: string, dx = 0, dz = 0): P | null {
  const rot = rw(c.room) >= rd(c.room) ? 0 : 90;
  const x = cx(c.room) + dx, z = cz(c.room) + dz;
  if (ok(c, cat, x, z, rot)) return put(c, cat, x, z, rot);
  const rot2 = rot === 0 ? 90 : 0;
  return ok(c, cat, x, z, rot2) ? put(c, cat, x, z, rot2) : null;
}

const opposite: Record<number, WallSide> = { 0: 'S', 180: 'N', 90: 'W', 270: 'E' };

function chairsAround(c: Ctx, table: P | null, chair: string) {
  if (!table) return;
  const [w, d] = FURN_DIMS_V1[table.cat];
  const n = Math.max(1, Math.floor(w / 70));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (w * (2 * i + 1)) / (2 * n);
    near(c, table, chair, lx, d / 2 + 30, 180);
    near(c, table, chair, lx, -d / 2 - 30, 0);
  }
  near(c, table, chair, w / 2 + 30, 0, 90);
  near(c, table, chair, -w / 2 - 30, 0, 270);
}

const RULES: Partial<Record<RoomType, (c: Ctx, area: number) => void>> = {
  bedroom(c, area) {
    const big = area >= 1100_00;
    const bed = onWall(c, big ? 'bed_double' : (c.rng.chance(0.5) ? 'bed_double' : 'bed_single'));
    if (bed) {
      const [bw, bd] = FURN_DIMS_V1[bed.cat];
      const ns = FURN_DIMS_V1.nightstand;
      near(c, bed, 'nightstand', bw / 2 + ns[0] / 2 + 5, -bd / 2 + ns[1] / 2, 0);
      near(c, bed, 'nightstand', -bw / 2 - ns[0] / 2 - 5, -bd / 2 + ns[1] / 2, 0);
      if (big) near(c, bed, 'rug', 0, 30, 0);
    }
    onWall(c, 'wardrobe');
    if (area > 1300_00) { const d = onWall(c, 'desk'); near(c, d, 'chair', 0, 50, 180); }
    if (area > 1600_00) onWall(c, 'armchair', { corner: true });
    onWall(c, 'plant', { corner: true });
  },
  living(c, area) {
    const sofa = onWall(c, 'sofa');
    if (sofa) {
      const [, sd] = FURN_DIMS_V1.sofa;
      near(c, sofa, 'rug', 0, sd / 2 + 80, 0);
      near(c, sofa, 'coffee_table', 0, sd / 2 + 70, 0);
      if (!near(c, sofa, 'armchair', 170, sd / 2 + 120, 270)) near(c, sofa, 'armchair', -170, sd / 2 + 120, 90);
      onWall(c, 'tv_stand', { sides: [opposite[sofa.rot]] });
    }
    onWall(c, 'bookshelf');
    if (area > 3000_00) onWall(c, 'piano', { corner: true });
    onWall(c, 'plant', { corner: true });
    onWall(c, 'plant', { corner: true });
  },
  kitchen(c, area) {
    onWall(c, 'counter');
    onWall(c, 'counter');
    onWall(c, 'fridge', { corner: true });
    if (area > 1400_00) center(c, 'island');
  },
  dining(c, area) {
    const t = center(c, area > 2400_00 ? 'long_table' : 'dining_table');
    chairsAround(c, t, 'dining_chair');
    onWall(c, 'sideboard');
    onWall(c, 'plant', { corner: true });
  },
  bath(c, area) {
    onWall(c, 'toilet');
    onWall(c, 'sink');
    if (area > 500_00) onWall(c, 'bathtub'); else onWall(c, 'shower', { corner: true });
  },
  office(c) {
    const d = onWall(c, 'desk');
    near(c, d, 'chair', 0, 50, 180);
    onWall(c, 'bookshelf');
    onWall(c, 'bookshelf');
    onWall(c, 'plant', { corner: true });
  },
  library(c, area) {
    const n = Math.min(8, Math.floor(area / 400_00));
    for (let i = 0; i < n; i++) onWall(c, 'bookshelf');
    const t = center(c, 'dining_table');
    chairsAround(c, t, 'chair');
    onWall(c, 'armchair', { corner: true });
    onWall(c, 'armchair', { corner: true });
  },
  hall(c, area) {
    if (area > 600_00) onWall(c, 'console');
    if (area > 900_00) onWall(c, 'bench');
    onWall(c, 'plant', { corner: true });
  },
  garage(c) {
    center(c, 'car');
  },
  laundry(c) {
    onWall(c, 'washer');
    onWall(c, 'washer');
    onWall(c, 'sink');
  },
  salon(c, area) {
    onWall(c, 'fireplace');
    const s = center(c, 'sofa', 0, -60);
    if (s) near(c, s, 'coffee_table', 0, 110, 0);
    onWall(c, 'armchair', { corner: true });
    onWall(c, 'armchair', { corner: true });
    if (area > 3000_00) onWall(c, 'harp', { corner: true });
    onWall(c, 'plant', { corner: true });
  },
  music(c) {
    center(c, 'piano');
    onWall(c, 'harp', { corner: true });
    onWall(c, 'chair');
    onWall(c, 'chair');
    onWall(c, 'bookshelf');
  },
  ballroom(c) {
    put(c, 'chandelier', cx(c.room), cz(c.room), 0, 0);
    for (let i = 0; i < 4; i++) onWall(c, 'statue', { corner: true });
    onWall(c, 'piano', { corner: true });
    for (let i = 0; i < 4; i++) onWall(c, 'bench');
  },
  gallery(c, area) {
    const n = Math.min(10, Math.floor(area / 500_00));
    for (let i = 0; i < n; i++) onWall(c, 'statue');
    for (let i = 0; i < 2; i++) onWall(c, 'bench');
    if (area > 4000_00) put(c, 'chandelier', cx(c.room), cz(c.room), 0, 0);
  },
};

/** Door swing / passage zones and window zones for a room, from the level's pieces. */
function zonesFor(plan: LevelPlan, ri: number) {
  const doorZones: Rect[] = [], winZones: Rect[] = [];
  const add = (p: Piece, a: number, b: number, depth: number, out: Rect[]) => {
    const s = p.lo + a, e = p.lo + b;
    out.push(p.axis === 'x' ? R(s, p.coord - depth, e, p.coord + depth) : R(p.coord - depth, s, p.coord + depth, e));
  };
  for (const p of plan.pieces) {
    if (p.neg !== ri && p.pos !== ri) continue;
    for (const [a, b, door] of p.used) {
      if (door) add(p, a - 15, b + 15, 110, doorZones);
      else add(p, a, b, 50, winZones);
    }
  }
  return { doorZones, winZones };
}

export function furnishLevel(b: DocBuilder, plan: LevelPlan, rng: Rng, blockers: Rect[]) {
  plan.rooms.forEach((room, ri) => {
    const rule = RULES[room.type];
    if (!rule) return;
    const { doorZones, winZones } = zonesFor(plan, ri);
    const roomBlockers = [...blockers, ...(room.holes ?? []).map((h) => R(h.x0 - 30, h.z0 - 30, h.x1 + 30, h.z1 + 30))];
    const c: Ctx = { b, level: plan.level, room: room.rect, rng: rng.fork('room' + ri), placed: [], doorZones, winZones, blockers: roomBlockers };
    rule(c, rw(room.rect) * rd(room.rect));
  });
}
