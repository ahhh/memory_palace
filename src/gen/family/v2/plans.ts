/**
 * FROZEN once deployed. Family-home plans modelled on real American house types:
 *  - foursquare: the 1895–1930 American Foursquare (a two-storey cube, four rooms a floor,
 *    corner stair hall, hip roof, full-width porch).
 *  - bungalow: the Craftsman bungalow (porch into the living room, dining and kitchen
 *    behind, bedrooms off a short hall).
 *  - ranch: the mid-century ranch (long and low, attached garage, bedroom wing off a
 *    corridor, back patio and pool).
 *  - shotgun: the New Orleans shotgun (one room wide, rooms in a row front to back), with
 *    an optional "camelback" second storey at the rear.
 *  - capecod: the Cape Cod / hall-and-parlor house (central chimney, keeping room and
 *    parlor, kitchen across the back, chambers under a steep roof).
 *  - dogtrot: the Southern dogtrot (two log pens under one roof around an open breezeway).
 */
import type { Id, PalaceDoc, Recipe } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import { W, baseDoorCost, openPlanArch, room, row, scatter, setSite, stair, stairRun, blob } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type DoorPolicy, type RoomSpec, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { type Rect, R, grow, snap10 } from '../../_lib/v1/rect';
import type { Rng } from '../../_lib/v1/rng';
import { chainDoorCost, colonnade, detachedGarage } from '../../_lib/v2/variety';

const doors: DoorPolicy = { cost: baseDoorCost, arch: openPlanArch, loops: 0.35, doorWidth: 90, doorHeight: 210 };
const chain: DoorPolicy = { cost: chainDoorCost, loops: 0, doorWidth: 85, doorHeight: 220 };

const STREETS = ['Elm', 'Oak', 'Chestnut', 'Walnut', 'Sycamore', 'Locust', 'Poplar', 'Magnolia', 'Hickory', 'Juniper'];

/** Bedroom count: the explicit param clamped to [lo, hi], else a roll in [lo, hi]. */
function bedCount(recipe: Recipe, rng: Rng, lo: number, hi: number): number {
  const v = recipe.params.bedrooms;
  return v ? Math.max(lo, Math.min(hi, Number(v))) : rng.int(lo, hi);
}

const half = (v: number) => Math.round(v / 20) * 10;
const bedName = (i: number) => (i === 0 ? 'Main bedroom' : `Bedroom ${i + 1}`);

function standardWindows(r: RoomSpec) {
  if (r.type === 'garage') return W(80, 60, 150, 500);
  if (r.type === 'bath' || r.type === 'laundry') return W(60, 70, 150, 600);
  if (r.type === 'hall') return W(60, 140, 90, 400);
  return W(110, 140, 90, 260);
}

/** Lawn, a front path to the street, foundation shrubs and trees around `house`. */
function yard(b: DocBuilder, level: Id, s: Rng, house: Rect, doorX: number, keepOut: Rect[], pond = 0.4) {
  const ext = keepOut.reduce((m, r) => Math.max(m, -r.x0, r.x1), Math.max(-house.x0, house.x1));
  const SW = 2 * ext + 2400, SD = 2 * Math.max(-house.z0, house.z1) + 2800;
  setSite(b, SW, SD, 'grass', s.int(0, 40), s.int(1, 9999));
  const path = R(doorX - 60, house.z1 + 15, doorX + 60, SD / 2);
  b.slab(level, path, 'path', 6, 3, false, s.pick(['gravel', 'concrete', 'flagstone']));
  const avoid: Rect[] = [grow(house, 300), path, ...keepOut.map((r) => grow(r, 200))];
  if (s.chance(pond)) {
    const px = s.int(house.x0, house.x1), pz = house.z0 - 750;
    b.pond(blob(s, px, pz, 240, 170), -20, 60, false);
    avoid.push(R(px - 400, pz - 300, px + 400, pz + 300));
  }
  const n = Math.max(2, Math.floor((doorX - 90 - house.x0) / 170));
  row(b, 'shrub', house.x0 + 50, house.z1 + 90, doorX - 120, house.z1 + 90, n, 70);
  const m = Math.max(2, Math.floor((house.x1 - doorX - 90) / 170));
  row(b, 'shrub', doorX + 120, house.z1 + 90, house.x1 - 50, house.z1 + 90, m, 70);
  scatter(b, s, s.int(6, 12), R(-SW / 2 + 200, -SD / 2 + 200, SW / 2 - 200, SD / 2 - 200), avoid, ['tree', 'tree', 'pine', 'shrub']);
}

/** Where a detached garage sits: beside the back corner of the house, on the +x side. */
const garageSpot = (house: Rect) => R(house.x1 + 200, house.z0 - 200, house.x1 + 820, house.z0 + 440);

/* ─────────────────────────────── American Foursquare ─────────────────────────────── */
export function foursquare(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const beds = bedCount(recipe, prog, 2, 3);
  const garage = recipe.params.garage ? recipe.params.garage === '1' : prog.chance(0.5);
  const b = new DocBuilder({ name: `${prog.pick(STREETS)} Street Foursquare`, style: 'family', origin: recipe });
  const look = rng.fork('look');
  const ext = look.pick(['brick', 'siding', 'stucco', 'cedar']);
  const roofMat = look.pick(['shingle', 'slate', 'shingle']);
  const mats = { ext, int: 'plaster' };

  const d = rng.fork('dims');
  const Wd = d.step(860, 1000, 20), D = d.step(900, 1020, 20);
  const x0 = -half(Wd), z0 = -half(D), x1 = x0 + Wd, z1 = z0 + D;
  const H = 280, rise = H + 20, run = stairRun(rise);
  const sw = d.step(300, 360, 20); // side strip: stair hall in front, kitchen behind
  const zh = z1 - Math.ceil((run + 170) / 10) * 10;
  const zm = z0 + snap10(Math.round((D * 46) / 100));
  const xs = x0 + sw;

  const L0 = b.level(0, 0, H, 'Ground floor');
  const L1 = b.level(1, rise, H, 'Upper floor');
  const st = stair(b, L0, x0 + 15 + 50, z1 - 15 - 120, 270, 100, rise);
  const block = [grow(st, 10)];

  const g0 = [
    room(R(x0, zh, xs, z1), 'hall', 'Stair hall', 'oak'),
    room(R(x0, z0, xs, zh), 'kitchen', 'Kitchen', 'tile'),
    room(R(xs, zm, x1, z1), 'living', 'Living room', 'oak'),
    room(R(xs, z0, x1, zm), 'dining', 'Dining room', 'oak'),
  ];
  const p0 = buildLevel(b, L0, H, g0, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 0, ['S'], 100, 220, dr, block);
  placeExteriorDoor(b, p0, 1, ['N', 'W'], 90, 210, dr, block, false);
  placeDoors(b, p0, dr, doors, block);
  placeWindows(b, p0, standardWindows);
  furnishLevel(b, p0, rng.fork('furnish0'), block);

  // Upper: landing over the stair hall, a bath and two bedrooms on the far side.
  const zA = z1 - snap10(Math.round((D * 40) / 100));
  const zB = Math.abs(zA - 240 - zh) < 60 ? zh : zA - 240; // never leave a sliver wall
  const g1 = [
    room(R(x0, zh, xs, z1), 'hall', 'Landing', 'oak'),
    beds >= 3 ? room(R(x0, z0, xs, zh), 'bedroom', 'Bedroom 3', 'carpet') : room(R(x0, z0, xs, zh), 'office', 'Sewing room', 'oak'),
    room(R(xs, zA, x1, z1), 'bedroom', 'Bedroom 2', 'carpet'),
    room(R(xs, zB, x1, zA), 'bath', 'Bathroom', 'tile'),
    room(R(xs, z0, x1, zB), 'bedroom', 'Main bedroom', 'carpet'),
  ];
  const p1 = buildLevel(b, L1, H, g1, mats);
  placeDoors(b, p1, rng.fork('doors1'), doors, block);
  placeWindows(b, p1, standardWindows);
  furnishLevel(b, p1, rng.fork('furnish1'), block);

  b.roof(L1, R(x0, z0, x1, z1), 'hip', 30, 50, rise + H, 20, roofMat);
  // Hipped dormer on the front slope, full-width porch with square columns.
  b.mass(L1, half(x0 + x1), z1 - 140, 220, 120, 160, H + 90, ext);
  b.roof(L1, R(half(x0 + x1) - 130, z1 - 230, half(x0 + x1) + 130, z1 - 50), 'hip', 25, 20, rise + H + 210, 12, roofMat);
  const porch = R(x0 - 30, z1 + 15, x1 + 30, z1 + 15 + 250);
  b.slab(L0, porch, 'terrace', 40, 0, false, 'wood');
  colonnade(b, L0, porch.x0 + 30, porch.z1 - 30, porch.x1 - 30, porch.z1 - 30, 4, 36, H - 20, 'white');
  b.roof(L0, porch, 'hip', 15, 30, H - 20, 15, roofMat);
  b.mass(L0, x0 - 40, zm - 160, 60, 2 * H + 160, 150, 0, 'brick');

  const house = R(x0, z0, x1, porch.z1);
  const gr = garage ? garageSpot(house) : null;
  const s = rng.fork('site');
  if (gr) detachedGarage(b, L0, gr, ext, roofMat, rng.fork('garage'), house.z1 + 1300);
  yard(b, L0, s, house, x0 + half(sw), gr ? [gr, R(gr.x0, gr.z1, gr.x1, gr.z1 + 3000)] : []);
  return b.doc;
}

/* ─────────────────────────────── Craftsman bungalow ─────────────────────────────── */
export function bungalow(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const beds = bedCount(recipe, prog, 2, 3);
  const garage = recipe.params.garage ? recipe.params.garage === '1' : prog.chance(0.4);
  const b = new DocBuilder({ name: `${prog.pick(STREETS)} Bungalow`, style: 'family', origin: recipe });
  const look = rng.fork('look');
  const ext = look.pick(['cedar', 'siding', 'stucco', 'brick']);
  const roofMat = look.pick(['shingle', 'shingle', 'slate']);
  const pier = look.pick(['fieldstone', 'brick', 'stone']);
  const mats = { ext, int: 'plaster' };

  const d = rng.fork('dims');
  const pubW = d.step(520, 600, 20), privW = beds === 3 ? d.step(760, 840, 20) : d.step(460, 540, 20);
  const D = d.step(1300, 1500, 20), Wd = pubW + privW;
  const x0 = -half(Wd), z0 = -half(D), x1 = x0 + Wd, z1 = z0 + D, xp = x0 + pubW;
  const zL = z1 - snap10(Math.round((D * 40) / 100)), zD = zL - snap10(Math.round((D * 28) / 100));
  const zh0 = zD + 40, zh1 = zh0 + 160; // the short bedroom hall opens off the dining room
  const H = 270;
  const L0 = b.level(0, 0, H, 'Main floor');

  const rooms = [
    room(R(x0, zL, xp, z1), 'living', 'Living room', 'oak'),
    room(R(x0, zD, xp, zL), 'dining', 'Dining room', 'oak'),
    room(R(x0, z0, xp, zD), 'kitchen', 'Kitchen', 'tile'),
    room(R(xp, zh0, x1, zh1), 'hall', 'Hall', 'oak'),
    room(R(xp, zh1, x1, z1), 'bedroom', 'Main bedroom', 'oak'),
  ];
  const bathW = d.step(200, 240, 20);
  if (beds === 3) {
    const bw = half(privW - bathW);
    rooms.push(
      room(R(xp, z0, xp + bw, zh0), 'bedroom', 'Bedroom 2', 'oak'),
      room(R(xp + bw, z0, xp + bw + bathW, zh0), 'bath', 'Bathroom', 'tile'),
      room(R(xp + bw + bathW, z0, x1, zh0), 'bedroom', 'Bedroom 3', 'oak'),
    );
  } else {
    rooms.push(room(R(xp, z0, xp + bathW, zh0), 'bath', 'Bathroom', 'tile'), room(R(xp + bathW, z0, x1, zh0), 'bedroom', 'Bedroom 2', 'oak'));
  }
  const p = buildLevel(b, L0, H, rooms, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p, 0, ['S'], 100, 220, dr, []);
  placeExteriorDoor(b, p, 2, ['N', 'W'], 90, 210, dr, [], false);
  placeDoors(b, p, dr, doors, []);
  placeWindows(b, p, (r) => (r.type === 'living' || r.type === 'dining' ? W(90, 150, 80, 160) : standardWindows(r)));
  // Brick or stone chimney on the outside of the living-room wall.
  b.mass(L0, x0 - 45, half(zL + z1), 70, H + 180, 160, 0, pier);
  furnishLevel(b, p, rng.fork('furnish'), []);

  b.roof(L0, R(x0, z0, x1, z1), 'gable', 25, 70, H, 20, roofMat);
  // Deep front porch on battered piers, under its own low gable.
  const porch = R(x0 - 40, z1 + 15, Math.min(x1, xp + d.step(100, 260, 20)), z1 + 15 + d.step(240, 300, 20));
  b.slab(L0, porch, 'terrace', 50, 0, false, 'concrete');
  for (const x of [porch.x0 + 40, porch.x1 - 40]) {
    b.mass(L0, x, porch.z1 - 40, 60, 110, 60, 0, pier);
    b.mass(L0, x, porch.z1 - 40, 30, H - 120, 30, 110, 'white');
  }
  b.roof(L0, porch, 'gable', 25, 50, H - 10, 18, roofMat);

  const house = R(x0, z0, x1, porch.z1);
  const gr = garage ? garageSpot(house) : null;
  if (gr) detachedGarage(b, L0, gr, ext, roofMat, rng.fork('garage'), house.z1 + 1300);
  yard(b, L0, rng.fork('site'), house, x0 + half(pubW), gr ? [gr, R(gr.x0, gr.z1, gr.x1, gr.z1 + 3000)] : []);
  return b.doc;
}

/* ─────────────────────────────── Mid-century ranch ─────────────────────────────── */
export function ranch(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const beds = bedCount(recipe, prog, 2, 4);
  const garage = recipe.params.garage ? recipe.params.garage === '1' : prog.chance(0.75);
  const b = new DocBuilder({ name: `${prog.pick(['Sunset', 'Vista', 'Mesa', 'Palm', 'Canyon', 'Ridge', 'Desert'])} Ranch`, style: 'family', origin: recipe });
  const look = rng.fork('look');
  const ext = look.pick(['roman', 'stucco', 'cedar', 'brick']);
  const roofMat = look.pick(['shingle', 'copper', 'shingle']);
  const mats = { ext, int: 'plaster' };

  const d = rng.fork('dims');
  const D = d.step(780, 900, 20), H = 260;
  const uw = 240, kw = d.step(420, 500, 20), lw = d.step(520, 640, 20), bw = d.step(330, 380, 10);
  const frontN = Math.max(1, beds - 1);
  const ww = Math.max(frontN * bw, 640);
  const jog = d.pick([0, 0, 120, -120, 180]);
  const total = (garage ? 640 : 0) + uw + kw + lw + ww;
  const xg = -half(total), xu = xg + (garage ? 640 : 0), xk = xu + uw, xl = xk + kw, xw = xl + lw, x1 = xw + ww;
  const z0 = -half(D), z1 = z0 + D, zk = z0 + half(D);
  const wz0 = z0 + jog, wz1 = z1 + jog;
  const backD = snap10(Math.round(((D - 150) * 45) / 100));
  const zc = wz0 + backD, zc1 = zc + 150;

  const L0 = b.level(0, 0, H, 'Main floor');
  const rooms: RoomSpec[] = [
    room(R(xl, z0, xw, z1), 'living', 'Living room', 'oak'),
    room(R(xk, zk, xl, z1), 'dining', 'Dining room', 'oak'),
    room(R(xk, z0, xk + kw, zk), 'kitchen', 'Kitchen', 'tile'),
    room(R(xu, z0, xk, z1), 'laundry', 'Mudroom & laundry', 'tile'),
    room(R(xw, zc, x1, zc1), 'hall', 'Bedroom corridor', 'oak'),
  ];
  // Front row: the children's rooms (and a den when there are few).
  const front: [string, RoomSpec['type']][] = [];
  for (let i = 1; i < beds; i++) front.push([bedName(i), 'bedroom']);
  if (front.length === 1) front.push(['Den', 'office']);
  const fw = snap10(Math.round(ww / front.length));
  front.forEach(([label, type], i) => {
    const a = xw + i * fw, z = i === front.length - 1 ? x1 : xw + (i + 1) * fw;
    rooms.push(room(R(a, zc1, z, wz1), type, label, type === 'office' ? 'oak' : 'carpet'));
  });
  // Back row: hall bath, the main suite, and an ensuite when there is room.
  rooms.push(room(R(xw, wz0, xw + 240, zc), 'bath', 'Hall bath', 'tile'));
  if (ww >= 900) {
    rooms.push(room(R(xw + 240, wz0, x1 - 220, zc), 'bedroom', 'Main bedroom', 'carpet'), room(R(x1 - 220, wz0, x1, zc), 'bath', 'Ensuite', 'tile'));
  } else rooms.push(room(R(xw + 240, wz0, x1, zc), 'bedroom', 'Main bedroom', 'carpet'));
  const gIdx = rooms.length;
  if (garage) rooms.push(room(R(xg, z1 - 660, xu, z1), 'garage', 'Garage', 'concrete'));

  const p = buildLevel(b, L0, H, rooms, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p, 0, ['S'], 100, 220, dr, []);
  placeExteriorDoor(b, p, 2, ['N'], 160, 220, dr, [], false);
  if (garage) placeExteriorDoor(b, p, gIdx, ['S'], 260, 220, dr, []);
  else placeExteriorDoor(b, p, 3, ['W', 'N'], 90, 210, dr, [], false);
  placeDoors(b, p, dr, doors, []);
  placeWindows(b, p, (r, _p, side) => (r.type === 'living' && side !== 'E' ? W(240, 180, 40, 300) : r.type === 'bedroom' ? W(160, 90, 130, 300) : standardWindows(r)));
  furnishLevel(b, p, rng.fork('furnish'), []);

  const ov = d.step(80, 120, 20);
  if (jog === 0) b.roof(L0, R(xu, z0, x1, z1), 'hip', 18, ov, H, 20, roofMat);
  else {
    b.roof(L0, R(xu, z0, xw, z1), 'hip', 18, ov, H, 20, roofMat);
    b.roof(L0, R(xw, wz0, x1, wz1), 'hip', 18, ov, H, 20, roofMat);
  }
  if (garage) b.roof(L0, R(xg, z1 - 660, xu, z1), 'gable', 18, ov, H, 20, roofMat);
  b.mass(L0, xl + 60, z0 - 30, 160, H + 120, 60, 0, d.pick(['fieldstone', 'roman', 'brick']));
  // Back patio and (often) a pool.
  const patio = R(xl - 200, z0 - 15 - 420, xw + 200, z0 - 15);
  b.slab(L0, patio, 'terrace', 20, 0, false, 'concrete');
  const s = rng.fork('site');
  const keep: Rect[] = [patio];
  if (s.chance(0.6)) {
    const pool = R(xl, patio.z0 - 120 - s.step(400, 500, 20), xl + s.step(800, 1000, 20), patio.z0 - 120);
    b.pond([[pool.x0, pool.z0], [pool.x1, pool.z0], [pool.x1, pool.z1], [pool.x0, pool.z1]], -10, 150, false);
    keep.push(pool);
  }
  if (garage) b.slab(L0, R(xg + 40, z1 + 15, xu - 40, z1 + 1600), 'path', 6, 2, false, 'concrete');
  yard(b, L0, s, R(garage ? xg : xu, Math.min(z0, wz0), x1, Math.max(z1, wz1)), half(xl + xw), garage ? [...keep, R(xg, z1, xu, z1 + 3000)] : keep, 0);
  return b.doc;
}

/* ─────────────────────────────── Shotgun / camelback ─────────────────────────────── */
export function shotgun(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const P = recipe.params;
  const camel = P.floors ? P.floors === '2' : prog.chance(0.4);
  const beds = bedCount(recipe, prog, 2, camel ? 4 : 3);
  const up = camel ? (beds >= 3 ? 2 : 1) : 0;
  const ground = Math.max(1, beds - up);
  const b = new DocBuilder({ name: `${prog.pick(['Marigny', 'Bywater', 'Tremé', 'Faubourg', 'Irish Channel', 'Algiers'])} ${camel ? 'Camelback' : 'Shotgun'}`, style: 'family', origin: recipe });
  const look = rng.fork('look');
  const ext = look.pick(['siding', 'stucco', 'cedar', 'white']);
  const roofMat = look.pick(['shingle', 'slate', 'copper']);
  const mats = { ext, int: 'plaster' };

  const d = rng.fork('dims');
  const Wd = d.step(380, 440, 20), H = 300, rise = H + 20, run = stairRun(rise);
  const seq: [string, RoomSpec['type'], number, string][] = [['Front room', 'living', d.step(380, 440, 20), 'oak']];
  for (let i = 0; i < ground; i++) seq.push([bedName(i), 'bedroom', d.step(340, 400, 20), 'oak']);
  if (d.chance(0.5) || up >= ground) seq.push(['Dining room', 'dining', d.step(340, 380, 20), 'oak']);
  const kd = camel ? 100 + run + 60 : d.step(360, 420, 20);
  seq.push(['Kitchen', 'kitchen', kd, 'tile'], ['Bathroom', 'bath', d.step(220, 260, 20), 'tile']);
  const D = seq.reduce((s, r) => s + r[2], 0);
  const x0 = -half(Wd), x1 = x0 + Wd, z1 = half(D), z0 = z1 - D;
  const rects: Rect[] = [];
  let z = z1;
  for (const r of seq) { rects.push(R(x0, z - r[2], x1, z)); z -= r[2]; }

  const L0 = b.level(0, 0, H, 'Main floor');
  const rooms = seq.map(([label, type, , floor], i) => room(rects[i], type, label, floor));
  const ki = seq.length - 2, kr = rects[ki];
  const L1 = camel ? b.level(1, rise, H - 30, 'Camelback') : null;
  const st = L1 ? stair(b, L0, x0 + 15 + 50, kr.z0 + 100, 90, 100, rise) : null;
  const block = st ? [grow(st, 10)] : [];
  const p = buildLevel(b, L0, H, rooms, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p, 0, ['S'], 95, 240, dr, []);
  placeExteriorDoor(b, p, ki, ['E'], 90, 220, dr, block, false);
  placeDoors(b, p, dr, chain, block);
  // Tall shuttered windows down both long sides.
  placeWindows(b, p, (r) => (r.type === 'bath' ? W(60, 80, 150, 500) : W(80, 190, 50, 280)));
  furnishLevel(b, p, rng.fork('furnish0'), block);

  // Front porch (a "stoop" gallery) under a hipped overhang on turned posts.
  const porch = R(x0, z1 + 15, x1, z1 + 15 + 200);
  b.slab(L0, porch, 'terrace', 60, 0, false, 'wood');
  colonnade(b, L0, x0 + 20, porch.z1 - 20, x1 - 20, porch.z1 - 20, d.pick([2, 3, 4]), 18, H - 40, 'white');

  if (L1) {
    // The camelback rises over the kitchen, the bath and the rooms just in front.
    const ur: RoomSpec[] = [room(kr, 'hall', 'Landing', 'oak'), room(rects[ki + 1], 'bath', 'Upper bath', 'tile')];
    for (let i = 0; i < up; i++) ur.push(room(rects[ki - 1 - i], 'bedroom', bedName(ground + i), 'oak'));
    const p1 = buildLevel(b, L1, H - 30, ur, mats);
    placeDoors(b, p1, rng.fork('doors1'), chain, block);
    placeWindows(b, p1, () => W(80, 150, 60, 280));
    furnishLevel(b, p1, rng.fork('furnish1'), block);
    const zr = rects[ki - up].z1;
    b.roof(L0, R(x0, zr, x1, z1), 'gable', 35, 40, H, 18, roofMat);
    b.roof(L1, R(x0, z0, x1, zr), 'gable', 35, 40, rise + H - 30, 18, roofMat);
  } else {
    b.roof(L0, R(x0, z0, x1, z1), 'gable', 35, 40, H, 18, roofMat);
  }
  b.roof(L0, porch, 'hip', 20, 30, H - 40, 15, roofMat);

  // Narrow city lot: side alley, a fig tree out back, a fence of shrubs.
  const s = rng.fork('site');
  const SW = Wd + 1000, SD = D + 2400;
  setSite(b, SW, SD, 'grass', s.int(0, 15), s.int(1, 9999));
  b.slab(L0, R(x0 + 60, porch.z1, x1 - 60, SD / 2), 'path', 6, 2, false, 'concrete');
  b.slab(L0, R(x1 + 40, z0, x1 + 160, z1), 'path', 6, 2, false, 'flagstone');
  row(b, 'shrub', -SW / 2 + 80, z0 - 200, -SW / 2 + 80, porch.z1, Math.max(2, Math.floor(D / 260)), 80);
  scatter(b, s, s.int(1, 3), R(-SW / 2 + 150, -SD / 2 + 150, SW / 2 - 150, z0 - 250), [], ['tree', 'shrub']);
  return b.doc;
}

/* ─────────────────────────────── Cape Cod (hall & parlor) ─────────────────────────────── */
export function capecod(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const P = recipe.params;
  const sym = P.symmetric === '1';
  const beds = bedCount(recipe, prog, 2, 3);
  const garage = !sym && (P.garage ? P.garage === '1' : prog.chance(0.3));
  const b = new DocBuilder({ name: `${prog.pick(['Nantucket', 'Truro', 'Wellfleet', 'Chatham', 'Barnstable', 'Sandwich', 'Orleans'])} Cape`, style: 'family', origin: recipe });
  const look = rng.fork('look');
  const ext = look.pick(['cedar', 'siding', 'white', 'cedar']);
  const roofMat = look.pick(['shingle', 'slate']);
  const mats = { ext, int: 'plaster' };

  const d = rng.fork('dims');
  const side = d.step(380, 460, 20);
  const sideE = sym ? side : d.step(360, 480, 20);
  const kw = d.step(640, 700, 20), ew = d.step(240, 300, 20);
  const D = d.step(720, 820, 20), Wd = side + kw + sideE;
  const x0 = -half(Wd), x1 = x0 + Wd, z0 = -half(D), z1 = z0 + D;
  const kx0 = x0 + side, kx1 = kx0 + kw, ex0 = kx0 + half(kw - ew), ex1 = ex0 + ew;
  const zf = z1 - snap10(Math.round((D * 55) / 100));
  const H0 = 250, H1 = 210, rise = H0 + 20;

  const L0 = b.level(0, 0, H0, 'Ground floor');
  const L1 = b.level(1, rise, H1, 'Chamber floor');
  const st = stair(b, L0, kx0 + 120, z0 + 15 + 50, 0, 100, rise);
  const chim = R(ex1 + 20, zf - 150, ex1 + 180, zf - 10);
  b.mass(L0, half(chim.x0 + chim.x1), half(chim.z0 + chim.z1), 160, rise + H1 + 260, 140, 0, 'brick');
  const block = [grow(st, 10), grow(chim, 10)];

  const g0 = [
    room(R(ex0, zf, ex1, z1), 'hall', 'Entry', 'oak'),
    room(R(x0, zf, ex0, z1), 'salon', 'Parlor', 'oak'),
    room(R(ex1, zf, x1, z1), 'living', 'Keeping room', 'oak'),
    beds >= 3 ? room(R(x0, z0, kx0, zf), 'bedroom', 'Borning room', 'oak') : room(R(x0, z0, kx0, zf), 'office', 'Borning room', 'oak'),
    room(R(kx0, z0, kx1, zf), 'kitchen', 'Kitchen', 'flagstone'),
    room(R(kx1, z0, x1, zf), 'laundry', 'Buttery', 'flagstone'),
  ];
  const p0 = buildLevel(b, L0, H0, g0, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 0, ['S'], 100, 210, dr, block);
  placeExteriorDoor(b, p0, 5, ['N'], 90, 200, dr, block, false);
  placeDoors(b, p0, dr, doors, block);
  placeWindows(b, p0, (r) => (r.type === 'hall' ? null : r.type === 'laundry' ? W(60, 70, 140, 500) : W(80, 130, 80, 220)));
  furnishLevel(b, p0, rng.fork('furnish0'), block);

  // Chambers under the roof, lit only from the gable ends.
  const ld = 240;
  const g1 = [
    room(R(kx0, z0, kx1, z0 + ld), 'hall', 'Landing', 'oak'),
    room(R(x0, z0, kx0, z1), 'bedroom', 'West chamber', 'oak'),
    room(R(kx1, z0, x1, z1), 'bedroom', 'East chamber', 'oak'),
    room(R(kx0, z0 + ld, kx1, z1), 'bath', 'Bathroom', 'tile'),
  ];
  const p1 = buildLevel(b, L1, H1, g1, mats);
  placeDoors(b, p1, rng.fork('doors1'), doors, block);
  placeWindows(b, p1, (_r, _p, s) => (s === 'E' || s === 'W' ? W(80, 110, 70, 260) : null));
  furnishLevel(b, p1, rng.fork('furnish1'), block);
  b.roof(L1, R(x0, z0, x1, z1), 'gable', 45, 30, rise + H1, 18, roofMat);
  b.slab(L0, R(ex0 - 60, z1 + 15, ex1 + 60, z1 + 15 + 120), 'platform', 30, 0, false, 'stone');

  const house = R(x0, z0, x1, z1 + 135);
  const gr = garage ? garageSpot(house) : null;
  if (gr) detachedGarage(b, L0, gr, ext, roofMat, rng.fork('garage'), house.z1 + 1300);
  const s = rng.fork('site');
  yard(b, L0, s, house, half(ex0 + ex1), gr ? [gr, R(gr.x0, gr.z1, gr.x1, gr.z1 + 3000)] : []);
  return b.doc;
}

/* ─────────────────────────────── Dogtrot ─────────────────────────────── */
export function dogtrot(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const b = new DocBuilder({ name: `${prog.pick(['Pine Hollow', 'Cypress Creek', 'Red Clay', 'Possum Trot', 'Big Thicket', 'Sweetgum'])} Dogtrot`, style: 'family', origin: recipe });
  const look = rng.fork('look');
  const ext = look.pick(['wood', 'cedar', 'siding']);
  const roofMat = look.pick(['copper', 'shingle']);
  const mats = { ext, int: ext === 'siding' ? 'plaster' : 'wood' };

  const d = rng.fork('dims');
  const pen = d.step(480, 580, 20), penD = d.step(520, 620, 20), bw = d.step(300, 380, 20), sd = d.step(260, 320, 20);
  const Wd = 2 * pen + bw, H = 270;
  const x0 = -half(Wd), x1 = x0 + Wd, z0 = -half(penD), z1 = z0 + penD;
  const xa = x0 + pen, xb = x1 - pen, zm = z0 + snap10(Math.round((penD * 45) / 100));
  const L0 = b.level(0, 0, H, 'Main floor');
  const rooms = [
    room(R(x0, zm, xa, z1), 'living', 'Hall', 'wood'),
    room(R(x0, z0, xa, zm), 'kitchen', 'Kitchen', 'wood'),
    room(R(xb, zm, x1, z1), 'bedroom', 'Main bedroom', 'wood'),
    room(R(xb, z0, x1, zm), 'bedroom', 'Bedroom 2', 'wood'),
    room(R(x0, z0 - sd, xa, z0), 'laundry', 'Pantry', 'wood'),
    room(R(xa, z0 - sd, xb, z0), 'hall', 'Back porch room', 'wood'),
    room(R(xb, z0 - sd, x1, z0), 'bath', 'Bathroom', 'tile'),
  ];
  const p = buildLevel(b, L0, H, rooms, mats);
  const dr = rng.fork('doors');
  // Every pen room opens onto the breezeway: the "dog trot" is the house's hallway.
  placeExteriorDoor(b, p, 0, ['E'], 95, 210, dr, []);
  placeExteriorDoor(b, p, 1, ['E'], 90, 210, dr, []);
  placeExteriorDoor(b, p, 2, ['W'], 95, 210, dr, []);
  placeExteriorDoor(b, p, 3, ['W'], 90, 210, dr, []);
  placeExteriorDoor(b, p, 5, ['S'], 95, 210, dr, []);
  placeDoors(b, p, dr, doors, []);
  placeWindows(b, p, (r) => (r.type === 'bath' || r.type === 'laundry' ? W(60, 70, 140, 500) : W(80, 120, 80, 260)));
  furnishLevel(b, p, rng.fork('furnish'), []);

  b.slab(L0, R(xa + 15, z0, xb - 15, z1), 'terrace', 30, 0, false, 'wood');
  const porch = R(x0 - 20, z1 + 15, x1 + 20, z1 + 15 + d.step(200, 260, 20));
  b.slab(L0, porch, 'terrace', 40, 0, false, 'wood');
  colonnade(b, L0, porch.x0 + 25, porch.z1 - 25, porch.x1 - 25, porch.z1 - 25, d.pick([4, 5, 6]), 20, H - 30, 'wood');
  b.roof(L0, R(x0, z0, x1, z1), 'gable', 35, 50, H, 18, roofMat);
  b.roof(L0, porch, 'flat', 0, 20, H - 30, 12, roofMat);
  b.roof(L0, R(x0, z0 - sd, x1, z0), 'flat', 0, 40, H - 30, 12, roofMat);
  for (const x of [x0 - 45, x1 + 45]) b.mass(L0, x, half(z0 + z1), 70, H + 220, 170, 0, 'fieldstone');

  const s = rng.fork('site');
  yard(b, L0, s, R(x0, z0 - sd, x1, porch.z1), half(xa + xb), [], 0.6);
  return b.doc;
}
