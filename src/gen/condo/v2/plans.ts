/**
 * FROZEN once deployed. Apartment plans modelled on real city flats:
 *  - railroad: the New York railroad flat (one room wide, rooms in a line front to back,
 *    light only at the two ends, entry at the kitchen, a fire-escape balcony).
 *  - classicsix: the pre-war "Classic Six" (gallery foyer, living and dining on the
 *    street, a bedroom passage, kitchen with a maid's room and bath).
 *  - loft: a converted warehouse loft (one tall open room on cast-iron columns, a
 *    bedroom/bath/kitchen strip at the back, huge factory windows).
 */
import type { PalaceDoc, Recipe } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import { W, baseDoorCost, openPlanArch, room, scatter, setSite } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type DoorPolicy, type RoomSpec, type Side, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { type Rect, R, grow } from '../../_lib/v1/rect';
import type { Rng } from '../../_lib/v1/rng';
import { chainDoorCost } from '../../_lib/v2/variety';

const PLACES = ['Harbor', 'Elm Street', 'Midtown', 'Riverside', 'Park View', 'Skyline', 'Canal', 'Gramercy', 'Morningside', 'Hamilton Heights'];
const half = (v: number) => Math.round(v / 20) * 10;

function bedCount(recipe: Recipe, rng: Rng, lo: number, hi: number, rollHi = hi): number {
  const v = recipe.params.bedrooms;
  return v ? Math.max(lo, Math.min(hi, Number(v))) : rng.int(lo, rollHi);
}

/** Corner units get windows on one end wall; every other side is a party wall or corridor. */
function blindSides(recipe: Recipe, rng: Rng): Side[] {
  const corner = recipe.params.corner ? recipe.params.corner === '1' : rng.chance(0.4);
  const side: Side = rng.chance(0.5) ? 'E' : 'W';
  return ['N', ...(['E', 'W'] as Side[]).filter((s) => !corner || s !== side)];
}

function street(b: DocBuilder, level: string, s: Rng, box: Rect) {
  setSite(b, box.x1 - box.x0 + 1600, box.z1 - box.z0 + 1600, 'grass', 0, s.int(1, 9999));
  b.slab(level, R(box.x0 - 300, box.z0 - 500, box.x1 + 300, box.z0 - 15), 'path', 6, 2, false, 'concrete');
  scatter(b, s, s.int(3, 6), R(box.x0 - 700, box.z1 + 300, box.x1 + 700, box.z1 + 700), [], ['tree', 'shrub']);
}

/* ─────────────────────────────── Railroad flat ─────────────────────────────── */
export function railroad(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const beds = bedCount(recipe, prog, 1, 3, 2);
  const b = new DocBuilder({ name: `${prog.pick(PLACES)} Railroad Flat`, style: 'condo', origin: recipe });
  const d = rng.fork('dims');
  const Wd = d.step(400, 460, 20);
  const seq: [string, RoomSpec['type'], number, string][] = [['Parlor', 'living', d.step(420, 480, 20), 'oak']];
  for (let i = 0; i < beds; i++) seq.push([i === 0 ? 'Bedroom' : `Bedroom ${i + 1}`, 'bedroom', d.step(300, 360, 20), 'oak']);
  if (d.chance(0.5)) seq.push(['Dining room', 'dining', d.step(300, 340, 20), 'oak']);
  seq.push(['Kitchen', 'kitchen', d.step(320, 380, 20), 'tile'], ['Bathroom', 'bath', d.step(200, 240, 20), 'tile']);
  const D = seq.reduce((s, r) => s + r[2], 0);
  const x0 = -half(Wd), x1 = x0 + Wd, z1 = half(D), z0 = z1 - D;
  // Light only at the two short ends (plus the open end of a corner unit).
  const blind = blindSides(recipe, d).filter((s) => s !== 'N');
  const L0 = b.level(0, 0, 280, 'Apartment');
  let z = z1;
  const rooms = seq.map(([label, type, depth, floor]) => {
    const r = room(R(x0, z - depth, x1, z), type, label, floor, { blind });
    z -= depth;
    return r;
  });
  const plan = buildLevel(b, L0, 280, rooms, { ext: 'brick', int: 'plaster' });
  const dr = rng.fork('doors');
  const ki = seq.length - 2;
  placeExteriorDoor(b, plan, ki, ['W', 'E'], 90, 210, dr, [], false);
  placeDoors(b, plan, dr, { cost: chainDoorCost, loops: 0, doorWidth: 80, doorHeight: 210 }, []);
  placeWindows(b, plan, (r) => (r.type === 'bath' ? W(60, 80, 150, 400) : W(90, 170, 60, 200)));
  furnishLevel(b, plan, rng.fork('furnish'), []);
  // Fire-escape balcony across the street end.
  b.slab(L0, R(x0 + 40, z1 + 15, x1 - 40, z1 + 15 + 120), 'balcony', 10, 0, true, 'slate');
  b.roof(L0, R(x0, z0, x1, z1), 'flat', 0, 15, 280, 30, 'concrete');
  street(b, L0, rng.fork('site'), R(x0 - 400, z0, x1, z1));
  b.slab(L0, R(x0 - 400, z0, x0 - 15, z1), 'path', 6, 2, false, 'concrete');
  return b.doc;
}

/* ─────────────────────────────── Classic Six ─────────────────────────────── */
export function classicsix(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const beds = bedCount(recipe, prog, 2, 3);
  const b = new DocBuilder({ name: `${prog.pick(PLACES)} Classic ${beds === 3 ? 'Seven' : 'Six'}`, style: 'condo', origin: recipe });
  const d = rng.fork('dims');
  const wA = d.step(380, 440, 20), wH = 150, wB = d.step(480, 580, 20), wC = d.step(420, 480, 20);
  const fd = d.step(460, 540, 20), bd = d.step(560, 640, 20), kd = d.step(260, 300, 20);
  const Wd = wA + wH + wB + wC, D = fd + bd;
  const x0 = -half(Wd), xA = x0 + wA, xH = xA + wH, xB = xH + wB, x1 = x0 + Wd;
  const z0 = -half(D), z1 = z0 + D, zf = z1 - fd, zb = zf - 240, zk = zf - kd, xM = x1 - 170;
  const blind = blindSides(recipe, d);
  const court = blind.filter((s) => s !== 'N'); // the back rooms see a light court
  const L0 = b.level(0, 0, 300, 'Apartment');
  const rooms: RoomSpec[] = [
    room(R(xH, z0, xB, zf), 'hall', 'Gallery', 'parquet', { blind }),
    room(R(xH, zf, xB, z1), 'living', 'Living room', 'parquet', { blind }),
    room(R(xB, zf, x1, z1), 'dining', 'Dining room', 'parquet', { blind }),
    room(R(xA, z0, xH, z1), 'hall', 'Bedroom passage', 'oak', { blind }),
    room(R(x0, zf, xA, z1), 'bedroom', 'Main bedroom', 'carpet', { blind }),
    room(R(x0, zb, xA, zf), 'bath', 'Bathroom', 'tile', { blind }),
    room(R(x0, z0, x0 + wA, zb), 'bedroom', 'Bedroom 2', 'carpet', { blind: court }),
    room(R(xB, zk, x1, zf), 'kitchen', 'Kitchen', 'tile', { blind }),
    room(R(xB, z0, xM, zk), 'bedroom', beds === 3 ? 'Bedroom 3' : 'Maid’s room', 'oak', { blind: court }),
    room(R(xM, z0, x1, zk), 'bath', beds === 3 ? 'Second bath' : 'Maid’s bath', 'tile', { blind: court }),
  ];
  const plan = buildLevel(b, L0, 300, rooms, { ext: 'brick', int: 'plaster' });
  const dr = rng.fork('doors');
  placeExteriorDoor(b, plan, 0, ['N'], 100, 220, dr, []);
  const cost = (a: RoomSpec, c: RoomSpec) => {
    // The gallery is formal: no doors from it straight into the service rooms.
    const t = [a.label, c.label].sort().join('|');
    if (t === 'Gallery|Maid’s room' || t === 'Bedroom 3|Gallery') return null;
    return baseDoorCost(a, c);
  };
  const policy: DoorPolicy = { cost, arch: (a, c) => openPlanArch(a, c) || (a.label === 'Gallery' && c.type === 'living') || (c.label === 'Gallery' && a.type === 'living'), loops: 0.4, doorWidth: 90, doorHeight: 230 };
  placeDoors(b, plan, dr, policy, []);
  placeWindows(b, plan, (r) => (r.type === 'hall' ? null : r.type === 'bath' ? W(60, 80, 150, 400) : W(110, 200, 60, 230)));
  furnishLevel(b, plan, rng.fork('furnish'), []);
  b.roof(L0, R(x0, z0, x1, z1), 'flat', 0, 15, 300, 30, 'concrete');
  street(b, L0, rng.fork('site'), R(x0, z0, x1, z1));
  return b.doc;
}

/* ─────────────────────────────── Warehouse loft ─────────────────────────────── */
export function loft(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const beds = bedCount(recipe, prog, 0, 1);
  const b = new DocBuilder({ name: `${prog.pick(['Tribeca', 'SoHo', 'Dumbo', 'Pearl District', 'Mill District', 'Wharf', 'Brewery'])} Loft`, style: 'condo', origin: recipe });
  const d = rng.fork('dims');
  const Wd = d.step(960, 1200, 20), D = d.step(1000, 1300, 20), bd = d.step(320, 380, 20), H = 380;
  const x0 = -half(Wd), x1 = x0 + Wd, z0 = -half(D), z1 = z0 + D, zb = z0 + bd;
  const blind = blindSides(recipe, d);
  const strip: [string, RoomSpec['type'], number, string][] = [];
  if (beds) strip.push(['Bedroom', 'bedroom', d.step(360, 420, 20), 'oak']);
  strip.push(['Bathroom', 'bath', d.step(220, 260, 20), 'tile'], ['Entry', 'hall', d.step(200, 240, 20), 'concrete']);
  const used = strip.reduce((s, r) => s + r[2], 0);
  strip.push(['Kitchen', 'kitchen', Wd - used, 'concrete']);
  const L0 = b.level(0, 0, H, 'Loft');
  const rooms: RoomSpec[] = [room(R(x0, zb, x1, z1), 'living', 'Loft', d.pick(['oak', 'concrete']), { blind })];
  let x = x0;
  for (const [label, type, w, floor] of strip) {
    rooms.push(room(R(x, z0, x + w, zb), type, label, floor, { blind }));
    x += w;
  }
  const plan = buildLevel(b, L0, H, rooms, { ext: 'brick', int: 'plaster' });
  const dr = rng.fork('doors');
  placeExteriorDoor(b, plan, rooms.findIndex((r) => r.type === 'hall'), ['N'], 110, 240, dr, []);
  placeDoors(b, plan, dr, { cost: baseDoorCost, arch: openPlanArch, loops: 0.3, doorWidth: 100, doorHeight: 240 }, []);
  placeWindows(b, plan, (r) => (r.type === 'living' ? W(180, 270, 60, 240) : r.type === 'bath' ? W(60, 80, 160, 400) : W(140, 220, 80, 260)));
  // Cast-iron columns down the middle of the loft.
  const cols: Rect[] = [];
  const n = Wd >= 1100 ? 3 : 2, cz = half(zb + z1);
  for (let i = 1; i <= n; i++) {
    const cx = x0 + Math.round((Wd * i) / (n + 1) / 10) * 10;
    b.mass(L0, cx, cz, 30, H, 30, 0, 'slate');
    cols.push(grow(R(cx - 15, cz - 15, cx + 15, cz + 15), 40));
  }
  furnishLevel(b, plan, rng.fork('furnish'), cols);
  b.roof(L0, R(x0, z0, x1, z1), 'flat', 0, 15, H, 40, 'concrete');
  street(b, L0, rng.fork('site'), R(x0, z0, x1, z1));
  return b.doc;
}
