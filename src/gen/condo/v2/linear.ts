/**
 * FROZEN once deployed. Linear condo (the v1 plan): bedrooms and living room along the
 * facade, bath/hall/kitchen strip behind, entry from the building corridor.
 */
import type { PalaceDoc, Recipe } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import { W, baseDoorCost, openPlanArch, roofs, room, scatter, setSite } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type RoomSpec, type Side, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { R } from '../../_lib/v1/rect';
import type { Rng } from '../../_lib/v1/rng';

const NAMES = ['Loft', 'Flat', 'Studio', 'Suite', 'Apartment'];
const PLACES = ['Harbor', 'Elm Street', 'Midtown', 'Riverside', 'Park View', 'Skyline', 'Canal'];

export function linear(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const P = recipe.params;
  const bedsRoll = P.bedrooms ? Number(P.bedrooms) : prog.int(0, 2);
  const cornerRoll = P.corner ? P.corner === '1' : prog.chance(0.4);
  // Symmetric: living room centered between twin bedrooms (or a studio), no corner windows.
  const sym = P.symmetric === '1';
  const beds = sym ? (bedsRoll === 0 ? 0 : 2) : bedsRoll;
  const corner = cornerRoll && !sym;
  const b = new DocBuilder({ name: `${prog.pick(PLACES)} ${prog.pick(NAMES)}`, style: 'condo', origin: recipe });

  const dims = rng.fork('dims');
  const bedW = dims.step(320, 380, 10);
  const bathW = dims.step(210, 240, 10);
  const kitW = dims.step(260, 340, 10);
  // Studio: bath + hall + kitchen all sit above the living room.
  const livRoll = dims.step(beds === 0 ? 520 : 440, 620, 10);
  const livW = sym ? Math.max(livRoll, beds === 0 ? 2 * bathW + 200 : 300) : Math.max(livRoll, beds === 0 ? bathW + 200 + kitW : kitW + 150);
  // The first bedroom sits under the bathroom and must still reach the hall.
  const bed1W = Math.max(bedW, bathW + 170);
  const Wd = sym ? (beds ? 2 * bed1W : 0) + livW : (beds ? bed1W + (beds - 1) * bedW : 0) + livW;
  const FD = dims.step(250, 320, 10);
  const SDp = dims.step(400, 500, 10);
  const D = FD + SDp;
  const x0 = -Math.round(Wd / 20) * 10, z0 = -Math.round(D / 20) * 10;
  const x1 = x0 + Wd, z1 = z0 + D, zm = z0 + FD;
  const cornerSide: Side = dims.chance(0.5) ? 'E' : 'W';
  const blind: Side[] = ['N', ...(['E', 'W'] as Side[]).filter((s) => !corner || s !== cornerSide)];

  const L0 = b.level(0, 0, 270, 'Apartment');
  const rooms: RoomSpec[] = [];
  // South (facade) strip: bedrooms then living room.
  let bx = x0;
  if (sym) {
    if (beds) rooms.push(room(R(x0, zm, x0 + bed1W, z1), 'bedroom', 'Bedroom', 'oak', { blind }));
    rooms.push(room(R(beds ? x0 + bed1W : x0, zm, beds ? x1 - bed1W : x1, z1), 'living', 'Living room', 'oak', { blind }));
    if (beds) rooms.push(room(R(x1 - bed1W, zm, x1, z1), 'bedroom', 'Bedroom 2', 'oak', { blind }));
    rooms.push(room(R(x0, z0, x0 + bathW, zm), 'bath', 'Bathroom', 'tile', { blind }));
    rooms.push(room(R(x0 + bathW, z0, x1 - bathW, zm), 'hall', 'Entry hall', 'oak', { blind }));
    rooms.push(room(R(x1 - bathW, z0, x1, zm), 'kitchen', 'Kitchen', 'tile', { blind }));
  }
  for (let i = 0; i < (sym ? 0 : beds); i++) {
    const w = i === 0 ? bed1W : bedW;
    rooms.push(room(R(bx, zm, bx + w, z1), 'bedroom', i === 0 ? 'Bedroom' : `Bedroom ${i + 1}`, 'oak', { blind }));
    bx += w;
  }
  const livX = sym ? (beds ? x0 + bed1W : x0) : bx;
  const livX1 = sym && beds ? x1 - bed1W : x1;
  if (!sym) {
    rooms.push(room(R(livX, zm, x1, z1), 'living', 'Living room', 'oak', { blind }));
    // North strip: bath, entry hall (a corridor over the bedrooms), kitchen above the living room.
    const kitX = x1 - kitW;
    rooms.push(room(R(x0, z0, x0 + bathW, zm), 'bath', 'Bathroom', 'tile', { blind }));
    rooms.push(room(R(x0 + bathW, z0, kitX, zm), 'hall', 'Entry hall', 'oak', { blind }));
    rooms.push(room(R(kitX, z0, x1, zm), 'kitchen', 'Kitchen', 'tile', { blind }));
  }
  const hallIdx = rooms.length - 2, livIdx = sym ? (beds ? 1 : 0) : beds;

  const plan = buildLevel(b, L0, 270, rooms, { ext: 'concrete', int: 'plaster' });
  const dr = rng.fork('doors');
  placeExteriorDoor(b, plan, hallIdx, ['N'], 95, 215, dr, [], !!sym);
  placeExteriorDoor(b, plan, livIdx, ['S'], 180, 230, dr, []);
  placeDoors(b, plan, dr, { cost: baseDoorCost, arch: openPlanArch, loops: 0, doorWidth: 85, doorHeight: 210 }, []);
  placeWindows(b, plan, (r) => (r.type === 'bath' || r.type === 'hall' ? null : W(160, 180, 60, 260)));
  furnishLevel(b, plan, rng.fork('furnish'), []);

  // Balcony with railing off the living room.
  b.slab(L0, R(livX + 40, z1 + 15, livX1 - 40, z1 + 15 + 170), 'balcony', 20, 0, true, 'concrete');
  roofs(b, [{ level: L0, elevation: 0, height: 270, rects: [R(x0, z0, x1, z1)] }], { kind: 'flat', pitch: 0, overhang: 15, thickness: 30, material: 'concrete' });

  const site = rng.fork('site');
  setSite(b, Wd + 1600, D + 1600, 'grass', 0, site.int(1, 9999));
  b.slab(L0, R(x0 - 300, z0 - 500, x1 + 300, z0 - 15), 'path', 6, 2, false, 'concrete');
  scatter(b, site, site.int(3, 6), R(x0 - 700, z1 + 300, x1 + 700, z1 + 700), [], ['tree', 'shrub']);
  return b.doc;
}
