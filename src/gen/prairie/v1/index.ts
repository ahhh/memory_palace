/**
 * FROZEN once deployed. Prairie / organic houses in the spirit of Frank Lloyd Wright:
 * long low horizontals, a central hearth, ribbon windows, deep overhangs, terraces,
 * and water — including a house cantilevered over a waterfall.
 */
import type { Id, PalaceDoc, Recipe } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import { RIBBON, baseDoorCost, blob, openPlanArch, room, row, scatter, setSite, stair, stairRun } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import {
  type DoorPolicy, type LevelPlan, type RoomSpec, buildLevel, placeDoors, placeExteriorDoor, placeWindows,
} from '../../_lib/v1/layout';
import { partition, splitSpan } from '../../_lib/v1/partition';
import { R, cx, cz, grow } from '../../_lib/v1/rect';
import { type Rng, makeRng } from '../../_lib/v1/rng';

export const PARAMS = {
  variant: ['robie', 'fallingwater', 'usonian'],
};

const NAMES: Record<string, string[]> = {
  robie: ['Prairie House', 'Meadow House', 'Horizon House', 'Larkin House', 'Oak Park House'],
  fallingwater: ['Falling Water', 'Bear Run', 'Cascade House', 'Ledge House', 'Stream House'],
  usonian: ['Usonian House', 'Garden House', 'Hollyhock Court', 'Cedar Usonia', 'Pond House'],
};

const doorPolicy: DoorPolicy = { cost: baseDoorCost, arch: openPlanArch, loops: 0.5, doorWidth: 90, doorHeight: 210 };
const H = 260; // low Prairie ceilings
const LV = H + 20;

function hearthChimney(b: DocBuilder, level: Id, x: number, z: number, height: number, mat: string) {
  b.mass(level, x, z, 220, height, 140, 0, mat);
  b.mass(level, x, z, 160, 40, 100, height, mat);
}

export function generate(recipe: Recipe): PalaceDoc {
  const rng = makeRng('prairie/1/' + recipe.seed);
  const prog = rng.fork('program');
  const variant = recipe.params.variant ?? prog.pick(PARAMS.variant);
  const b = new DocBuilder({ name: prog.pick(NAMES[variant] ?? NAMES.robie), style: 'prairie', origin: recipe });
  if (variant === 'fallingwater') fallingwater(b, rng);
  else if (variant === 'usonian') usonian(b, rng);
  else robie(b, rng);
  return b.doc;
}

/* ───────────────────────────── Robie: long offset bars ───────────────────────────── */
function robie(b: DocBuilder, rng: Rng) {
  const d = rng.fork('dims');
  const LA = d.step(2200, 2800, 20), DA = d.step(740, 800, 20);
  const xA0 = -Math.round(LA / 20) * 10, xA1 = xA0 + LA, zA0 = -Math.round(DA / 20) * 10, zA1 = zA0 + DA;
  const coreW = 420;
  const [, cut] = splitSpan(xA0, xA1 - coreW, [52, 48]);
  const c0 = cut, c1 = cut + coreW;
  const ext = d.pick(['roman', 'roman', 'stucco']);
  const mats = { ext, int: 'plaster' };

  const L0 = b.level(0, 0, H, 'Main floor');
  const L1 = b.level(1, LV, H, 'Bedroom floor');

  // Stair in the core, entered from the hidden entry at the back.
  const sx = c0 + 6 + 52;
  const st = stair(b, L0, sx, zA0 + 15 + 150, 90, 100, LV);
  const blockers = [grow(st, 10)];
  const hearth = R(c0 - 15 - 90, -110, c0 - 15, 110);
  hearthChimney(b, L0, cx(hearth), cz(hearth), 150, ext === 'stucco' ? 'fieldstone' : 'roman');

  // Service wing behind the dining room.
  const bw = d.step(900, 1200, 20), bd = d.step(560, 640, 20);
  const B = R(c1, zA0 - bd, Math.min(xA1, c1 + bw), zA0);
  const svc = partition(B, [45, 20, 35], 'x');

  const r0: RoomSpec[] = [
    room(R(xA0, zA0, c0, zA1), 'living', 'Living room', 'oak'),
    room(R(c0, zA0, c1, zA1), 'hall', 'Stair hall', 'oak'),
    room(R(c1, zA0, xA1, zA1), 'dining', 'Dining room', 'oak'),
    room(svc[0], 'kitchen', 'Kitchen', 'tile'),
    room(svc[1], 'laundry', 'Pantry', 'tile'),
    room(svc[2], 'office', "Guest room", 'oak'),
  ];
  const p0 = buildLevel(b, L0, H, r0, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 1, ['N'], 100, 220, dr, blockers);
  placeExteriorDoor(b, p0, 0, ['S'], 160, 220, dr, blockers);
  placeExteriorDoor(b, p0, 2, ['S'], 160, 220, dr, blockers);
  placeDoors(b, p0, dr, doorPolicy, [...blockers, grow(hearth, 30)]);
  placeWindows(b, p0, (r) => (r.type === 'hall' ? RIBBON(60, 100, 120, 10) : r.type === 'laundry' ? null : RIBBON(90, 130, 90, 10)));
  furnishLevel(b, p0, rng.fork('furnish0'), [...blockers, grow(hearth, 20)]);

  // Upper bar centered on the core.
  const C = R(Math.max(xA0 + 200, c0 - d.step(600, 800, 20)), zA0, Math.min(xA1 - 200, c1 + d.step(700, 900, 20)), zA1);
  // Split front/back so every room touches the core (the stair hugs its west wall).
  const left = partition(R(C.x0, C.z0, c0, C.z1), [38, 62], 'z');
  const right = partition(R(c1, C.z0, C.x1, C.z1), [50, 50], 'z');
  const r1: RoomSpec[] = [
    room(left[0], 'bath', 'Bathroom', 'tile'),
    room(left[1], 'bedroom', 'Main bedroom', 'oak'),
    room(R(c0, C.z0, c1, C.z1), 'hall', 'Landing', 'oak'),
    room(right[0], 'bedroom', 'Bedroom 2', 'oak'),
    room(right[1], 'bedroom', 'Bedroom 3', 'oak'),
  ];
  const p1 = buildLevel(b, L1, H, r1, mats);
  placeDoors(b, p1, rng.fork('doors1'), doorPolicy, blockers);
  placeWindows(b, p1, (r) => (r.type === 'hall' ? null : RIBBON(80, 110, 100, 10)));
  furnishLevel(b, p1, rng.fork('furnish1'), blockers);
  b.mass(L1, cx(R(c0, C.z0, c1, C.z1)), -40, 200, 160, 120, H + 60, 'roman');

  // Roofs: wide flat lower roof cantilevered past the living room; low hips above.
  const ov = d.step(200, 300, 20);
  b.roof(L0, R(xA0 - 500, zA0, xA1, zA1), 'flat', 0, ov, H, 18, 'copper');
  b.roof(L0, B, 'hip', 15, 140, H, 18, 'copper');
  b.roof(L1, C, 'hip', 15, ov, LV + H, 18, 'copper');
  // Porch beyond the living room under the cantilever, terrace along the south.
  b.slab(L0, R(xA0 - 500, zA0 + 120, xA0 - 15, zA1 - 120), 'terrace', 30, 0, true, 'stucco');
  b.slab(L0, R(xA0 - 200, zA1 + 15, c1 + 200, zA1 + 15 + 360), 'terrace', 30, 0, true, 'stucco');
  for (const [x, z] of [[xA0 - 200, zA1 + 330], [c1 + 170, zA1 + 330]]) b.mass(L0, x, z, 90, 70, 90, 0, 'stucco');

  // Site: long lot, reflecting pond along the facade, hedges.
  const s = rng.fork('site');
  const SW = LA + 2800, SD = DA + bd + 3000;
  setSite(b, SW, SD, 'grass', s.int(0, 30), s.int(1, 9999));
  const pz = zA1 + 15 + 360 + 400;
  b.pond([[xA0, pz - 150], [c1 + 200, pz - 150], [c1 + 200, pz + 150], [xA0, pz + 150]], -15, 50, false);
  row(b, 'hedge', xA0 - 500, pz + 350, xA1, pz + 350, Math.floor((xA1 - xA0 + 500) / 120), 90);
  b.slab(L0, R(c0 + 100, zA0 - SD / 2 + 600, c1 - 100, zA0 - 15), 'path', 6, 2, false, 'gravel');
  scatter(b, s, s.int(10, 16), R(-SW / 2 + 200, -SD / 2 + 200, SW / 2 - 200, SD / 2 - 200),
    [grow(R(xA0 - 500, B.z0, xA1, pz + 400), 200)], ['tree', 'tree', 'shrub']);
}

/* ─────────────────── Fallingwater: cantilevered terraces over a stream ─────────────────── */
function fallingwater(b: DocBuilder, rng: Rng) {
  const d = rng.fork('dims');
  const s = rng.fork('site');
  const SW = 6400, SD = 5600;
  const ext = 'fieldstone', deck = 'stucco';
  const mats = { ext, int: 'fieldstone' };

  // Stream crossing the site west→east, meandering, with a falls just past the house.
  const zr = d.step(560, 680, 20);
  const fx = d.step(400, 700, 20);
  const pts: [number, number, number][] = [];
  for (let x = -SW / 2 - 400; x <= SW / 2 + 400; x += 400) {
    const z = zr + (x === -SW / 2 - 400 ? 0 : s.int(-120, 120));
    if (x < fx && x + 400 >= fx) {
      pts.push([x, -260, z], [fx - 10, -260, z], [fx + 10, -560, z]);
      continue;
    }
    pts.push([x, x < fx ? -260 : -560, z]);
  }
  b.river(pts, 900, 80);
  setSite(b, SW, SD, 'grass', s.int(140, 220), s.int(1, 9999), 0, 1800);

  const x0 = -650, x1 = 550, zN = -850, zM = -450, zS = 50;
  const kx = d.step(-300, -220, 10);
  const L0 = b.level(0, 0, H, 'Living level');
  const L1 = b.level(1, LV, H, 'Bedroom level');
  const L2 = b.level(2, 2 * LV, H, 'Study level');

  // Main stair along the north wall of the hall, ascending east.
  const st = stair(b, L0, kx + 120, zN + 15 + 52, 0, 100, LV);
  const st2 = stair(b, L1, kx + 120 + stairRun(LV) + 20, zN + 15 + 52 + 110, 180, 100, LV);
  const blockers0 = [grow(st, 10)];
  const blockers1 = [grow(st, 10), grow(st2, 10)];

  const r0: RoomSpec[] = [
    room(R(x0, zM, x1, zS), 'living', 'Great room', 'flagstone'),
    room(R(x0, zN, kx, zM), 'kitchen', 'Kitchen', 'flagstone'),
    room(R(kx, zN, x1, zM), 'hall', 'Entry hall', 'flagstone'),
  ];
  const p0 = buildLevel(b, L0, H, r0, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 2, ['N'], 100, 220, dr, blockers0, false);
  placeExteriorDoor(b, p0, 0, ['S'], 180, 230, dr, blockers0);
  placeExteriorDoor(b, p0, 0, ['E'], 160, 230, dr, blockers0);
  placeDoors(b, p0, dr, doorPolicy, blockers0);
  const glass = (r: RoomSpec) => (r.type === 'living' || r.type === 'bedroom' || r.type === 'office' ? RIBBON(110, 200, 30, 8) : RIBBON(80, 110, 100, 8));
  placeWindows(b, p0, glass);
  furnishLevel(b, p0, rng.fork('furnish0'), [...blockers0, R(x0 + 60, zM + 80, x0 + 260, zM + 240)]);

  // The great hearth rises from a boulder at the west wall.
  hearthChimney(b, L0, x0 - 80, zM + 60, 3 * LV + 60, 'fieldstone');
  b.mass(L0, x0 + 160, zM + 160, 160, 30, 120, 0, 'fieldstone'); // the boulder hearthstone

  // Level 0 terrace cantilevers SOUTH over the stream, with a hatch stair down to the water.
  const t0 = R(x0 - 150, zS + 15, x1 + 150, zr + 80);
  b.slab(L0, t0, 'terrace', 40, 0, true, deck);
  const hx = d.step(x0 + 200, x1 - 300, 10);
  b.stair(L0, hx, t0.z1 + stairRun(-230), 270, 110, stairRun(-230), -230);

  // Level 1: bedrooms over the back, terrace cantilevers EAST over the great room.
  const u1x1 = 350;
  const r1: RoomSpec[] = [
    room(R(x0, zN, kx, zM), 'bath', 'Bathroom', 'tile'),
    room(R(kx, zN, u1x1, zM), 'hall', 'Landing', 'flagstone'),
    room(R(x0, zM, kx + 200, -150), 'bedroom', 'Main bedroom', 'oak'),
    room(R(kx + 200, zM, u1x1, -150), 'bedroom', 'Guest room', 'oak'),
  ];
  const p1 = buildLevel(b, L1, H, r1, mats);
  placeDoors(b, p1, rng.fork('doors1'), doorPolicy, blockers1);
  placeExteriorDoor(b, p1, 2, ['S'], 160, 220, rng.fork('ext1'), blockers1);
  placeExteriorDoor(b, p1, 3, ['S'], 160, 220, rng.fork('ext1b'), blockers1);
  placeWindows(b, p1, glass);
  furnishLevel(b, p1, rng.fork('furnish1'), blockers1);
  b.slab(L1, R(x0 - 60, -150 + 15, x1 + 450, zS + 40), 'terrace', 40, 0, true, deck);
  b.slab(L1, R(u1x1 + 15, zM, x1 + 450, -150 + 15), 'terrace', 40, 0, true, deck);
  b.roof(L0, R(u1x1, zN, x1, zM), 'flat', 0, 30, H, 30, deck);

  // Level 2: a study whose terrace cantilevers WEST.
  const r2: RoomSpec[] = [
    room(R(kx, zN, u1x1, zM), 'hall', 'Upper landing', 'flagstone'),
    room(R(x0, zN, kx, -150), 'office', 'Study', 'oak'),
  ];
  const p2 = buildLevel(b, L2, H, r2, mats);
  placeDoors(b, p2, rng.fork('doors2'), doorPolicy, [grow(st2, 10)]);
  placeExteriorDoor(b, p2, 1, ['W', 'S'], 160, 220, rng.fork('ext2'), []);
  placeWindows(b, p2, glass);
  furnishLevel(b, p2, rng.fork('furnish2'), [grow(st2, 10)]);
  b.slab(L2, R(x0 - 450, zM + 40, x0 - 15, 0), 'terrace', 40, 0, true, deck);
  b.roof(L1, R(kx, zM, u1x1, -150), 'flat', 0, 60, LV + H, 30, deck);
  b.roof(L2, R(x0, zN, u1x1, -150), 'flat', 0, 120, 2 * LV + H, 30, deck);

  // Woods on the banks, a drive from the north.
  b.slab(L0, R(kx + 200, -SD / 2, kx + 520, zN - 15), 'path', 6, 2, false, 'gravel');
  const river = R(-SW / 2, zr - 700, SW / 2, zr + 700);
  scatter(b, s, s.int(26, 36), R(-SW / 2 + 200, -SD / 2 + 200, SW / 2 - 200, SD / 2 - 200),
    [river, grow(R(x0 - 450, zN, x1 + 450, zr), 300), R(kx + 150, -SD / 2, kx + 570, zN)], ['tree', 'pine', 'tree', 'shrub'], 90, 150);
}

/* ─────────────────── Usonian: an L on a slab around a garden pond ─────────────────── */
function usonian(b: DocBuilder, rng: Rng) {
  const d = rng.fork('dims');
  const PL = d.step(1200, 1500, 20), PD = d.step(600, 680, 20);
  const wingL = d.step(1000, 1300, 20);
  const corW = 160, bedW = d.step(380, 440, 20);
  const ox = -Math.round(PL / 20) * 10, oz = -Math.round((PD - wingL) / 20) * 10;
  const x0 = ox, x1 = ox + PL, z0 = oz, z1 = oz + PD;
  const kx = x1 - corW - bedW; // the workspace sits where the bedroom wing joins
  const wx0 = kx, wx1 = kx + corW + bedW;
  const ext = d.pick(['cedar', 'roman']);
  const mats = { ext, int: ext === 'cedar' ? 'cedar' : 'plaster' };
  const L0 = b.level(0, 0, 250, 'Main floor');

  const nb = d.int(2, 3);
  const beds: RoomSpec[] = [];
  for (let i = 0; i < nb; i++) beds.push(room(R(0, 0, 1, 1), 'bedroom', i === 0 ? 'Main bedroom' : `Bedroom ${i + 1}`, 'oak'));
  beds.splice(1, 0, room(R(0, 0, 1, 1), 'bath', 'Bathroom', 'tile'));
  partition(R(wx0 + corW, z0 - wingL, wx1, z0), beds.map((r) => (r.type === 'bath' ? 18 : 30)), 'z').forEach((r, i) => { beds[i].rect = r; });

  const rooms: RoomSpec[] = [
    room(R(x0, z0, kx, z1), 'living', 'Living room', 'concrete'),
    room(R(kx, z0, Math.max(x1, wx1), z1), 'kitchen', 'Workspace', 'concrete'),
    room(R(wx0, z0 - wingL, wx0 + corW, z0), 'hall', 'Gallery', 'concrete'),
    ...beds,
  ];
  const plan: LevelPlan = buildLevel(b, L0, 250, rooms, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, plan, 2, ['N'], 100, 210, dr, [], true);
  placeExteriorDoor(b, plan, 0, ['S'], 180, 220, dr, []);
  placeDoors(b, plan, dr, doorPolicy, []);
  placeWindows(b, plan, (r, _p, side) => {
    if (r.type === 'living' && side === 'S') return RIBBON(100, 220, 0, 8);
    if (r.type === 'hall') return side === 'W' ? RIBBON(70, 50, 180, 10) : null;
    if (r.type === 'bedroom' && side === 'E') return RIBBON(90, 130, 80, 8);
    return RIBBON(70, 50, 180, 10);
  });
  const hearth = R(kx - 15 - 160, z0 + 40, kx - 15, z0 + 200);
  hearthChimney(b, L0, cx(hearth), cz(hearth), 320, 'roman');
  furnishLevel(b, plan, rng.fork('furnish'), [grow(hearth, 20)]);

  // Flat cantilevered roofs, a carport at the end of the wing.
  const ov = d.step(160, 240, 20);
  b.roof(L0, R(x0, z0, Math.max(x1, wx1), z1), 'flat', 0, ov, 250, 30, ext === 'cedar' ? 'cedar' : 'copper');
  b.roof(L0, R(wx0, z0 - wingL, wx1, z0), 'flat', 0, 120, 250, 30, ext === 'cedar' ? 'cedar' : 'copper');
  const carport = R(wx0 - 200, z0 - wingL - 650, wx1, z0 - wingL - 15);
  b.roof(L0, carport, 'flat', 0, 60, 230, 25, ext === 'cedar' ? 'cedar' : 'copper');
  b.mass(L0, carport.x0 + 40, carport.z0 + 40, 40, 230, 40, 0, ext);
  b.mass(L0, carport.x0 + 40, carport.z1 - 40, 40, 230, 40, 0, ext);
  b.slab(L0, carport, 'path', 6, 2, false, 'concrete');
  b.slab(L0, R(x0, z1 + 15, kx, z1 + 15 + 420), 'terrace', 20, 0, false, 'flagstone');

  // Pond in the crook of the L.
  const s = rng.fork('site');
  const SW = PL + 3000, SD = PD + wingL + 3200;
  setSite(b, SW, SD, 'grass', s.int(0, 60), s.int(1, 9999));
  b.pond(blob(s, kx - 450, z0 - 450, 320, 260, 20), -25, 70, s.chance(0.3));
  scatter(b, s, s.int(12, 18), R(-SW / 2 + 200, -SD / 2 + 200, SW / 2 - 200, SD / 2 - 200),
    [grow(R(x0, z0 - wingL - 650, Math.max(x1, wx1), z1 + 435), 250), R(kx - 850, z0 - 800, kx - 50, z0 - 100)], ['tree', 'pine', 'shrub']);
}
