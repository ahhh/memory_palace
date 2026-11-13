/**
 * FROZEN once deployed. Family home: center-hall plan, 1–2 storeys, optional garage.
 */
import type { PalaceDoc, Recipe } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import {
  W, baseDoorCost, openPlanArch, roofs, room, scatter, setSite, stair, stairRun, blob, row,
} from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type RoomSpec, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { partition } from '../../_lib/v1/partition';
import { type Rect, R, grow } from '../../_lib/v1/rect';
import { makeRng } from '../../_lib/v1/rng';

export const PARAMS = {
  floors: ['1', '2'],
  bedrooms: ['2', '3', '4', '5'],
  garage: ['0', '1'],
};

const NAMES_A = ['Maple', 'Cedar', 'Willow', 'Birch', 'Hazel', 'Rowan', 'Linden', 'Aspen'];
const NAMES_B = ['House', 'Cottage', 'Home', 'Place', 'Lodge'];

/** Split `r` front (+z) to back, first weight at the front. */
const stack = (r: Rect, w: number[]) => partition(r, [...w].reverse(), 'z').reverse();

export function generate(recipe: Recipe): PalaceDoc {
  const rng = makeRng('family/1/' + recipe.seed);
  const prog = rng.fork('program');
  const P = recipe.params;
  let bedrooms = P.bedrooms ? Number(P.bedrooms) : prog.int(2, 4);
  let floors = P.floors ? Number(P.floors) : (bedrooms >= 4 || prog.chance(0.6) ? 2 : 1);
  if (floors === 1 && bedrooms > 3) { if (P.floors) bedrooms = 3; else floors = 2; }
  const garage = P.garage ? P.garage === '1' : prog.chance(0.55);

  const b = new DocBuilder({
    name: `${prog.pick(NAMES_A)} ${prog.pick(NAMES_B)}`,
    style: 'family',
    origin: recipe,
  });

  const look = rng.fork('look');
  const ext = look.pick(['brick', 'siding', 'stucco', 'cedar']);
  const roofMat = look.pick(['shingle', 'slate', 'shingle']);
  const mats = { ext, int: 'plaster' };

  const dims = rng.fork('dims');
  const Wd = floors === 2 ? dims.step(1000, 1300, 20) : dims.step(1300, 1640, 20);
  const D = dims.step(840, 1000, 20);
  const x0 = -Math.round(Wd / 20) * 10, z0 = -Math.round(D / 20) * 10;
  const x1 = x0 + Wd, z1 = z0 + D;
  const HW = 240;
  const hx0 = x0 + dims.step(floors === 2 ? 420 : 520, Wd - HW - (floors === 2 ? 420 : 560), 20);
  const hx1 = hx0 + HW;
  const publicLeft = dims.chance(0.5);
  const leftR = R(x0, z0, hx0, z1), rightR = R(hx1, z0, x1, z1), hallR = R(hx0, z0, hx1, z1);
  const pubR = publicLeft ? leftR : rightR, privR = publicLeft ? rightR : leftR;

  const levelH = 290;
  const L0 = b.level(0, 0, levelH, 'Ground floor');
  const L1 = floors === 2 ? b.level(1, levelH + 20, levelH, 'Upper floor') : null;

  // Stair in the hall, along the wall nearest the public side, ascending toward the back.
  const rise = levelH + 20;
  const stairX = publicLeft ? hx0 + 6 + 52 : hx1 - 6 - 52;
  const stairRect = L1 ? stair(b, L0, stairX, z0 + 15 + 130 + stairRun(rise), 270, 100, rise) : null;

  const g0: RoomSpec[] = [room(hallR, 'hall', 'Entry hall', 'oak')];
  const pubRooms = floors === 2
    ? [room(pubR, 'living', 'Living room', 'oak'), room(pubR, 'dining', 'Dining room', 'oak')]
    : [room(pubR, 'living', 'Living room', 'oak'), room(pubR, 'dining', 'Dining room', 'oak'), room(pubR, 'kitchen', 'Kitchen', 'tile')];
  const pubW = floors === 2 ? [58, 42] : [44, 24, 32];
  stack(pubR, pubW).forEach((r, i) => { pubRooms[i].rect = r; });
  g0.push(...pubRooms);

  const privRooms: RoomSpec[] = [];
  if (floors === 2) {
    privRooms.push(room(privR, 'office', 'Study', 'oak'), room(privR, 'bath', 'Powder room', 'tile'), room(privR, 'kitchen', 'Kitchen', 'tile'));
    stack(privR, [32, 22, 46]).forEach((r, i) => { privRooms[i].rect = r; });
  } else {
    const types: RoomSpec[] = [];
    for (let i = 0; i < bedrooms; i++) types.push(room(privR, 'bedroom', i === 0 ? 'Main bedroom' : `Bedroom ${i + 1}`, 'carpet'));
    types.splice(1, 0, room(privR, 'bath', 'Bathroom', 'tile'));
    const w = types.map((t, i) => (t.type === 'bath' ? 16 : i === 0 ? 36 : 26));
    stack(privR, w).forEach((r, i) => { types[i].rect = r; });
    privRooms.push(...types);
  }
  g0.push(...privRooms);

  // Garage beside the private side, flush with the front.
  let garageR: Rect | null = null;
  if (garage) {
    garageR = publicLeft ? R(x1, z1 - 640, x1 + 620, z1) : R(x0 - 620, z1 - 640, x0, z1);
    g0.push(room(garageR, 'garage', 'Garage', 'concrete'));
  }

  const blockers0 = stairRect ? [grow(stairRect, 10)] : [];
  const plan0 = buildLevel(b, L0, levelH, g0, mats);
  const doors = { cost: baseDoorCost, arch: openPlanArch, loops: 0.35, doorWidth: 90, doorHeight: 210 };
  const dr = rng.fork('doors');
  placeExteriorDoor(b, plan0, 0, ['S'], 100, 220, dr, blockers0);
  const kitchenIdx = g0.findIndex((r) => r.type === 'kitchen');
  placeExteriorDoor(b, plan0, kitchenIdx, ['N'], 90, 210, dr, blockers0, false);
  if (garageR) placeExteriorDoor(b, plan0, g0.length - 1, ['S'], 260, 220, dr, []);
  placeDoors(b, plan0, dr, doors, blockers0);

  const winPolicy = (r: RoomSpec) => {
    if (r.type === 'garage') return W(80, 60, 150, 500);
    if (r.type === 'bath') return W(60, 70, 150, 600);
    if (r.type === 'hall') return W(60, 140, 90, 400);
    return W(120, 140, 90, 270);
  };
  placeWindows(b, plan0, winPolicy);
  furnishLevel(b, plan0, rng.fork('furnish0'), blockers0);

  const footprints = [{ level: L0, elevation: 0, height: levelH, rects: garageR ? [R(x0, z0, x1, z1), garageR] : [R(x0, z0, x1, z1)] }];

  if (L1) {
    const g1: RoomSpec[] = [room(hallR, 'hall', 'Landing', 'oak')];
    // The stair side can only be entered at the back landing or past the stairwell,
    // so it gets at most two rooms; everything else goes on the other side.
    const stairSide = publicLeft ? leftR : rightR, otherSide = publicLeft ? rightR : leftR;
    const bed = (i: number, r: Rect) => room(r, 'bedroom', i === 0 ? 'Main bedroom' : `Bedroom ${i + 1}`, 'carpet');
    const left: RoomSpec[] = [bed(0, stairSide), bedrooms >= 3 ? bed(1, stairSide) : room(stairSide, 'bath', 'Ensuite', 'tile')];
    const right: RoomSpec[] = [];
    for (let i = bedrooms >= 3 ? 2 : 1; i < bedrooms; i++) right.push(bed(i, otherSide));
    right.splice(Math.min(1, right.length), 0, room(otherSide, 'bath', 'Bathroom', 'tile'));
    stack(stairSide, [62, 38]).forEach((r, i) => { left[i].rect = r; });
    stack(otherSide, right.map((r) => (r.type === 'bath' ? 18 : 30))).forEach((r, i) => { right[i].rect = r; });
    g1.push(...left, ...right);
    const plan1 = buildLevel(b, L1, levelH, g1, mats);
    const holeBlock = stairRect ? [R(stairRect.x0 - 10, stairRect.z0 - 10, stairRect.x1 + 10, stairRect.z1 + 10)] : [];
    placeDoors(b, plan1, rng.fork('doors1'), doors, holeBlock);
    placeWindows(b, plan1, winPolicy);
    furnishLevel(b, plan1, rng.fork('furnish1'), holeBlock);
    footprints.push({ level: L1, elevation: levelH + 20, height: levelH, rects: [R(x0, z0, x1, z1)] });
  }

  roofs(b, footprints, { kind: 'gable', pitch: 35, overhang: 40, thickness: 20, material: roofMat });

  // Site: lawn, front path, driveway, trees, optional garden pond.
  const site = rng.fork('site');
  const SW = Wd + (garageR ? 620 : 0) + 2400, SD = D + 2600;
  setSite(b, SW, SD, 'grass', site.int(0, 40), site.int(1, 9999));
  const front = z1 + 15;
  b.slab(L0, R(hx0 + 60, front, hx1 - 60, SD / 2), 'path', 6, 3, false, 'gravel');
  if (garageR) b.slab(L0, R(garageR.x0 + 40, front, garageR.x1 - 40, SD / 2), 'path', 6, 3, false, 'concrete');
  const houseBox = grow(R(Math.min(x0, garageR?.x0 ?? x0), z0, Math.max(x1, garageR?.x1 ?? x1), z1), 300);
  const avoid: Rect[] = [houseBox, R(hx0, z1, hx1, SD / 2), ...(garageR ? [R(garageR.x0, z1, garageR.x1, SD / 2)] : [])];
  if (site.chance(0.45)) {
    const px = site.int(x0, x1), pz = z0 - 700;
    b.pond(blob(site, px, pz, 260, 180), -20, 60, false);
    avoid.push(R(px - 400, pz - 300, px + 400, pz + 300));
  }
  row(b, 'shrub', x0 + 50, z1 + 90, hx0 - 60, z1 + 90, Math.max(2, Math.floor((hx0 - x0) / 180)), 70);
  row(b, 'shrub', hx1 + 60, z1 + 90, x1 - 50, z1 + 90, Math.max(2, Math.floor((x1 - hx1) / 180)), 70);
  scatter(b, site, site.int(6, 12), R(-SW / 2 + 200, -SD / 2 + 200, SW / 2 - 200, SD / 2 - 200), avoid, ['tree', 'tree', 'pine', 'shrub']);

  return b.doc;
}
