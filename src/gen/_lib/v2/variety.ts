/**
 * FROZEN (v2). Helpers that widen the variety of v2 generators: picking a plan (a named
 * historical house type) that suits the explicit params, mirroring a finished palace, and
 * small reusable outbuildings. Integer-cm math only, like _lib/v1.
 */
import type { PalaceDoc, V2 } from '../../../model/schema';
import type { DocBuilder } from '../v1/builder';
import { W } from '../v1/common';
import { furnishLevel } from '../v1/furnish';
import { buildLevel, placeExteriorDoor, placeWindows } from '../v1/layout';
import { type Rect, R } from '../v1/rect';
import type { Rng } from '../v1/rng';

export interface PlanInfo {
  id: string;
  /** Relative chance of being picked when the seed chooses the plan. */
  weight: number;
  /** Can this plan honor the explicitly chosen params? (Unset params never exclude a plan.) */
  fits(params: Record<string, string>): boolean;
}

/**
 * The plan for a recipe: the explicit `plan` param if it names a known plan, otherwise a
 * weighted pick among the plans that fit the other explicit params (falling back to the
 * first plan, which must accept everything).
 */
export function choosePlan(plans: PlanInfo[], params: Record<string, string>, rng: Rng): string {
  if (params.plan && plans.some((p) => p.id === params.plan)) return params.plan;
  const ok = plans.filter((p) => p.fits(params));
  const pool = ok.length ? ok : [plans[0]];
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let roll = rng.int(0, total - 1);
  for (const p of pool) {
    if (roll < p.weight) return p.id;
    roll -= p.weight;
  }
  return pool[0].id;
}

/** True when an explicit numeric param lies outside [lo, hi]. */
export const outside = (params: Record<string, string>, key: string, lo: number, hi: number) =>
  params[key] !== undefined && (Number(params[key]) < lo || Number(params[key]) > hi);

const nx = (x: number) => 0 - x; // 0 - 0 is +0, unlike -0
const mp = (p: V2): V2 => [nx(p[0]), p[1]];
const dirMirror = (d: number) => (540 - d) % 360; // 0 (+x) ↔ 180 (−x)
const rotMirror = (r: number) => (360 - r) % 360; // facing E ↔ facing W

/**
 * Mirror a finished palace across x = 0 in place. Opening offsets stay valid because both
 * wall ends move; polygons are reversed to keep their winding.
 */
export function mirrorDocX(doc: PalaceDoc): PalaceDoc {
  for (const w of Object.values(doc.walls)) { w.a = mp(w.a); w.b = mp(w.b); }
  for (const r of Object.values(doc.rooms)) {
    r.polygon = r.polygon.map(mp).reverse();
    if (r.holes) r.holes = r.holes.map((h) => h.map(mp).reverse());
  }
  for (const s of Object.values(doc.slabs)) s.polygon = s.polygon.map(mp).reverse();
  for (const r of Object.values(doc.roofs)) r.center = mp(r.center);
  for (const s of Object.values(doc.stairs)) { s.start = mp(s.start); s.dir = dirMirror(s.dir); }
  for (const m of Object.values(doc.masses)) { m.center = mp(m.center); m.rot = rotMirror(m.rot); }
  for (const f of Object.values(doc.furniture)) { f.pos = mp(f.pos); f.rot = rotMirror(f.rot); }
  for (const v of Object.values(doc.rivers)) v.pts = v.pts.map(([x, y, z]) => [nx(x), y, z]);
  for (const p of Object.values(doc.ponds)) p.polygon = p.polygon.map(mp).reverse();
  for (const p of Object.values(doc.plants)) p.pos = mp(p.pos);
  return doc;
}

/** A detached one-room garage with its door facing +z, and a drive out to `streetZ`. */
export function detachedGarage(b: DocBuilder, level: string, r: Rect, ext: string, roofMat: string, rng: Rng, streetZ: number) {
  const plan = buildLevel(b, level, 260, [{ rect: r, type: 'garage', label: 'Garage', floor: 'concrete' }], { ext, int: ext });
  placeExteriorDoor(b, plan, 0, ['S'], 250, 220, rng, []);
  placeExteriorDoor(b, plan, 0, ['N', 'E', 'W'], 90, 210, rng, [], false);
  placeWindows(b, plan, () => W(80, 60, 150, 500));
  furnishLevel(b, plan, rng.fork('furnish'), []);
  b.roof(level, r, 'gable', 30, 30, 260, 18, roofMat);
  b.slab(level, R(r.x0 + 30, r.z1 + 15, r.x1 - 30, Math.max(r.z1 + 600, streetZ)), 'path', 6, 2, false, 'concrete');
}

/** Columns (square masses) evenly along a line, e.g. a porch or portico front. */
export function colonnade(b: DocBuilder, level: string, x0: number, z0: number, x1: number, z1: number, n: number, size: number, height: number, mat: string) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : Math.round(x0 + ((x1 - x0) * i) / (n - 1));
    const z = n === 1 ? z0 : Math.round(z0 + ((z1 - z0) * i) / (n - 1));
    b.mass(level, x, z, size, height, size, 0, mat);
  }
}

/** Any two rooms that share a wall may connect (shotgun / railroad plans pass room to room). */
export const chainDoorCost = () => 1;
