/**
 * "Otter Run": a hand-authored Prairie house (4 bed / 2 bath) in the spirit of Frank Lloyd
 * Wright. A river runs through the play room under two archways, past a big cedar deck and
 * into a lake; otters swim the whole course. Not a generator: it is shared as a full
 * `d1.` document, so it may use the v1 layout helpers freely (no determinism contract).
 */
import type { PalaceDoc } from '../model/schema';
import { DocBuilder } from '../gen/_lib/v1/builder';
import { RIBBON, baseDoorCost, blob, openPlanArch, room, row, setSite, stair } from '../gen/_lib/v1/common';
import { furnishLevel } from '../gen/_lib/v1/furnish';
import {
  type DoorPolicy, type LevelPlan, addOpening, buildLevel, placeDoors, placeExteriorDoor, placeWindows,
} from '../gen/_lib/v1/layout';
import { R, grow } from '../gen/_lib/v1/rect';
import { makeRng } from '../gen/_lib/v1/rng';

const H = 260;
const LV = H + 20;
const RIVER_X = -1300; // where the river crosses the house
const CH = 140; // half-width of the indoor channel

const doorPolicy: DoorPolicy = {
  cost: (a, b) => (a.type === 'other' || b.type === 'other' ? 1 : baseDoorCost(a, b)),
  arch: (a, b) => openPlanArch(a, b) || ([a.type, b.type].includes('other') && [a.type, b.type].includes('living')),
  loops: 0.3, doorWidth: 90, doorHeight: 210,
};

/** Put an opening on the exterior piece of `roomIdx` that crosses x = `x` on the z = `z` line. */
function archAt(b: DocBuilder, plan: LevelPlan, roomIdx: number, z: number, x: number, w: number, h: number) {
  const p = plan.pieces.find((q) => q.exterior && q.axis === 'x' && q.coord === z && q.lo < x && q.hi > x
    && (q.neg === roomIdx || q.pos === roomIdx));
  if (!p) throw new Error(`no wall at z=${z} x=${x}`);
  const id = addOpening(b, p, 'arch', w, h, 0, makeRng('arch'), [], x - p.lo);
  if (!id) throw new Error('river arch did not fit');
}

export function buildOtterRun(): PalaceDoc {
  const rng = makeRng('otter-run');
  const b = new DocBuilder({ name: 'Otter Run', style: 'custom' });
  const ext = 'roman', mats = { ext, int: 'plaster' };

  /* ── Site: gentle meadow, a river from the north woods through the house into a lake ── */
  setSite(b, 7000, 9600, 'grass', 25, 1908, 0, 2600);
  const WY = -50; // water surface, half a meter below the floors
  b.river([
    [-1700, WY, -4900], [-1500, WY, -3600], [-1150, WY, -2600], [-1380, WY, -1500],
    [RIVER_X, WY, -700], [RIVER_X, WY, 700], [-1220, WY, 1500], [-950, WY, 2200],
    [-600, WY, 2800], [-250, WY, 3300],
  ], 2 * CH + 60, 110);
  b.pond(blob(rng.fork('lake'), 300, 3700, 1500, 850, 12), WY, 220, false);

  /* ── Ground floor: play room · great room · stair hall · kitchen/dining · guest wing ── */
  const L0 = b.level(0, 0, H, 'Main floor');
  const L1 = b.level(1, LV, H, 'Bedroom floor');
  const zN = -550, zS = 550;
  const channel = [R(RIVER_X - CH, zN + 5, RIVER_X + CH, -70), R(RIVER_X - CH, 70, RIVER_X + CH, zS - 5)];
  const r0 = [
    room(R(-2000, zN, -800, zS), 'other', 'River play room', 'oak', { holes: channel }),
    room(R(-800, zN, 300, zS), 'living', 'Great room', 'oak'),
    room(R(300, zN, 700, zS), 'hall', 'Stair hall', 'oak'),
    room(R(700, zN, 1350, 0), 'kitchen', 'Kitchen', 'tile'),
    room(R(700, 0, 1350, zS), 'dining', 'Dining room', 'oak'),
    room(R(1350, zN, 1950, -150), 'bath', 'Bathroom 1', 'tile'),
    room(R(1350, -150, 1950, zS), 'bedroom', 'Bedroom 4 (guest)', 'oak'),
  ];
  // Stair rises north through the hall; the hearth straddles the play-room wall.
  const st = stair(b, L0, 500, 300, 270, 100, LV);
  const hearth = R(-880, -130, -720, 130);
  const blockers0 = [grow(st, 10), grow(hearth, 40)];
  const p0 = buildLevel(b, L0, H, r0, mats);
  archAt(b, p0, 0, zN, RIVER_X, 2 * CH + 20, 230);
  archAt(b, p0, 0, zS, RIVER_X, 2 * CH + 20, 230);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 2, ['N'], 110, 220, dr, blockers0); // front door, hidden on the north
  placeExteriorDoor(b, p0, 1, ['S'], 200, 230, dr, blockers0); // great room → deck
  placeExteriorDoor(b, p0, 0, ['S'], 160, 230, dr, blockers0); // play room → deck
  placeExteriorDoor(b, p0, 0, ['W'], 160, 230, dr, blockers0); // play room → west lawn
  placeDoors(b, p0, dr, doorPolicy, blockers0);
  placeWindows(b, p0, (r, _p, side) => {
    if (r.type === 'bath') return RIBBON(60, 60, 150, 10);
    if (r.type === 'hall') return RIBBON(60, 100, 120, 10);
    if (r.type === 'other' || (r.type === 'living' && side === 'S')) return RIBBON(90, 190, 30, 8);
    return RIBBON(90, 130, 90, 8);
  });
  furnishLevel(b, p0, rng.fork('furnish0'), blockers0);
  // Double-sided hearth and a tall Roman-brick chimney through the low roof.
  b.mass(L0, -800, 0, 160, 150, 260, 0, 'fieldstone');
  b.mass(L0, -800, 0, 120, 420, 200, 150, 'roman');
  b.furniture(L0, 'fireplace', -680, 0, 90);
  b.furniture(L0, 'fireplace', -920, 0, 270);
  // Play room: rugs, loungers by the water, a piano for sing-alongs, a globe and an easel.
  for (const [x, z, cat, rot] of [
    [-1750, -300, 'rug', 90], [-1750, 300, 'rug', 90], [-1000, -330, 'rug', 90], [-1000, 330, 'rug', 90],
    [-1880, -280, 'bookshelf', 270], [-1880, 260, 'bench', 270], [-1600, -440, 'piano', 0],
    [-1050, 420, 'lounger', 90], [-1050, -440, 'easel', 0], [-1650, 300, 'globe', 0],
    [-1100, -250, 'armchair', 270], [-1050, 200, 'crystal', 0],
  ] as [number, number, string, number][]) b.furniture(L0, cat, x, z, rot);

  /* ── Upper floor: a shorter bar centered over the hearth, three bedrooms and a bath ── */
  const r1 = [
    room(R(-500, -450, 300, 120), 'bedroom', 'Main bedroom', 'oak'),
    room(R(-500, 120, 300, 450), 'bath', 'Bathroom 2', 'tile'),
    room(R(300, -450, 700, 450), 'hall', 'Landing', 'oak'),
    room(R(700, -450, 1250, 0), 'bedroom', 'Bedroom 2', 'oak'),
    room(R(700, 0, 1250, 450), 'bedroom', 'Bedroom 3', 'oak'),
  ];
  const blockers1 = [R(440, -130, 560, 310)];
  const p1 = buildLevel(b, L1, H, r1, mats);
  placeDoors(b, p1, rng.fork('doors1'), { ...doorPolicy, cost: baseDoorCost }, blockers1);
  placeWindows(b, p1, (r) => (r.type === 'hall' ? null : r.type === 'bath' ? RIBBON(60, 60, 150, 10) : RIBBON(80, 110, 100, 8)));
  furnishLevel(b, p1, rng.fork('furnish1'), blockers1);

  /* ── Roofs: low copper hips with deep cantilevered eaves ── */
  b.roof(L0, R(-2000, zN, 1950, zS), 'hip', 14, 260, H, 18, 'copper');
  b.roof(L1, R(-500, -450, 1250, 450), 'hip', 14, 220, LV + H, 18, 'copper');

  /* ── The deck: a big cedar platform on the river's east bank, with a jetty over the water ── */
  const deck = R(RIVER_X + CH + 20, zS + 15, 300, zS + 15 + 620);
  b.slab(L0, deck, 'platform', 25, 0, true, 'cedar');
  b.slab(L0, R(RIVER_X + CH + 20, deck.z1, RIVER_X + CH + 340, deck.z1 + 260), 'platform', 25, 0, true, 'cedar');
  for (const [x, z, cat, rot] of [
    [-700, 900, 'lounger', 270], [-450, 900, 'lounger', 270], [-200, 900, 'lounger', 270],
    [0, 800, 'dining_table', 0], [-200, 1050, 'bench', 0], [200, 1050, 'bench', 0], [250, 650, 'plant', 0],
    [-1050, 650, 'plant', 0], [-1050, 1100, 'lantern', 0],
  ] as [number, number, string, number][]) b.furniture(L0, cat, x, z, rot);
  // Low planter walls, Prairie-style urns at the deck corners.
  b.mass(L0, deck.x1 - 40, deck.z1 - 40, 80, 70, 80, 0, 'roman');
  b.furniture(L0, 'urn', deck.x1 - 40, deck.z1 - 40, 0, 70);

  /* ── Grounds: a gravel drive from the north, a stone terrace east, woods and willows ── */
  b.slab(L0, R(400, -4700, 640, zN - 15), 'path', 6, 2, false, 'gravel');
  b.slab(L0, R(1950 + 15, -300, 2500, 450), 'terrace', 30, 0, true, 'stucco');
  row(b, 'hedge', 800, zN - 300, 1950, zN - 300, 10, 90);
  const trees: [string, number, number, number][] = [
    ['tree', -2400, -1500, 120], ['tree', -900, -2300, 110], ['pine', -2600, -3200, 130], ['pine', -600, -3800, 120],
    ['tree', -2200, 1300, 130], ['tree', -1900, 2400, 110], ['tree', 1400, 2200, 120], ['pine', 2900, -2500, 140],
    ['tree', 2600, 1200, 115], ['pine', 3100, 900, 120], ['tree', -2400, 4200, 130], ['tree', 2300, 4400, 120],
    ['shrub', -400, 1500, 100], ['shrub', 300, 1600, 90], ['shrub', 1700, 900, 100], ['shrub', -1800, -900, 100],
    ['pine', -2900, -400, 125], ['tree', 2500, -1200, 110],
  ];
  for (const [k, x, z, s] of trees) b.plant(k as 'tree', x, z, s);

  /* ── Otters: three ride the river (through the play room), two play in the lake ── */
  for (const [x, z] of [[-1500, -3600], [-1380, -1500], [-1000, 2200], [900, 3600], [-200, 3950]]) {
    b.furniture(L0, 'otter', x, z, 0);
  }
  return b.doc;
}
