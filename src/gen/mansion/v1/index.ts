/**
 * FROZEN once deployed. Mansion / palace: a symmetric composition on a 50 cm module —
 * entrance portico, foyer, double-height grand hall with a gallery, ballroom, enfilade
 * wings, an optional U-shaped court with a fountain, and a formal garden on the axis.
 */
import type { PalaceDoc, Recipe, RoomType } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import { W, baseDoorCost, roofs, room, row, scatter, setSite, stair, stairRun } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type DoorPolicy, type RoomSpec, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { partition } from '../../_lib/v1/partition';
import { type Rect, R, grow, mirrorX } from '../../_lib/v1/rect';
import { type Rng, makeRng } from '../../_lib/v1/rng';
import { DIR8 } from '../../_lib/v1/trig';

export const PARAMS = {
  floors: ['2', '3'],
  court: ['0', '1'],
};

const NAMES_A = ['Ashford', 'Belmont', 'Carrow', 'Dunmore', 'Everleigh', 'Fairhaven', 'Glenwood', 'Harrowgate', 'Kingsley', 'Lockwood'];
const NAMES_B = ['Hall', 'Manor', 'Palace', 'Court', 'Park', 'Abbey'];

const doors: DoorPolicy = {
  cost: baseDoorCost,
  arch: (a, b) => (a.type === 'hall' && b.type === 'gallery') || (a.type === 'gallery' && b.type === 'hall'),
  loops: 0.7,
  doorWidth: 120,
  doorHeight: 260,
};

type Prog = [RoomType, string][];
const LEFT_WING: Prog[] = [
  [['salon', 'Drawing room'], ['music', 'Music room'], ['library', 'Library'], ['salon', 'Morning room']],
  [['library', 'Library'], ['office', 'Study'], ['salon', 'Blue salon'], ['music', 'Music room']],
];
const RIGHT_WING: Prog[] = [
  [['dining', 'State dining room'], ['salon', 'Card room'], ['dining', 'Breakfast room'], ['kitchen', 'Kitchen']],
  [['dining', 'Dining room'], ['office', 'Estate office'], ['salon', 'Green salon'], ['kitchen', 'Kitchen']],
];

const m50 = (r: Rng, lo: number, hi: number) => r.step(lo, hi, 50);

export function generate(recipe: Recipe): PalaceDoc {
  const rng = makeRng('mansion/1/' + recipe.seed);
  const prog = rng.fork('program');
  const P = recipe.params;
  const floors = P.floors ? Number(P.floors) : prog.chance(0.5) ? 3 : 2;
  const court = P.court ? P.court === '1' : prog.chance(0.6);
  const b = new DocBuilder({ name: `${prog.pick(NAMES_A)} ${prog.pick(NAMES_B)}`, style: 'mansion', origin: recipe });

  const d = rng.fork('dims');
  const cw2 = m50(d, 700, 900);
  const fd = m50(d, 500, 600), hd = m50(d, 1100, 1400), bd = m50(d, 750, 950);
  const ww = m50(d, 1000, 1300), wd = m50(d, 1000, 1250);
  const recess = d.pick([0, 150, 300]);
  const zF = Math.round((fd + hd + bd) / 100) * 50; // centers the block on z = 0
  const zH = zF - fd, zBk = zH - hd, zB = zBk - bd;
  const zWf = zF - recess, zWb = zWf - wd;
  const ext = d.pick(['stone', 'marble', 'brick', 'stucco']);
  const mats = { ext, int: 'plaster' };

  const H0 = 450, H1 = 400, H2 = 340;
  const L0 = b.level(0, 0, H0, 'State floor');
  const L1 = b.level(1, H0 + 20, H1, 'Bedroom floor');
  const L2 = floors === 3 ? b.level(2, H0 + H1 + 40, H2, 'Attic floor') : null;

  // Center block.
  const foyer = R(-cw2, zH, cw2, zF), hall = R(-cw2, zBk, cw2, zH), back = R(-cw2, zB, cw2, zBk);
  // Right wing as a 2×2 grid; the left wing mirrors it.
  const wR = R(cw2, zWb, cw2 + ww, zWf);
  const xs = cw2 + Math.round(ww / 100) * 50, zs = zWb + Math.round(wd / 100) * 50;
  const gridR = [R(cw2, zs, xs, zWf), R(xs, zs, cw2 + ww, zWf), R(cw2, zWb, xs, zs), R(xs, zWb, cw2 + ww, zs)];
  const leftProg = prog.pick(LEFT_WING), rightProg = prog.pick(RIGHT_WING);
  // Asymmetric (symmetric=0): the west wing gets its own width/depth/setback from a separate
  // random stream, so the default symmetric palaces are untouched.
  const asym = P.symmetric === '0';
  const a = rng.fork('asym');
  const wwL = asym ? m50(a, 700, ww - 200) : ww;
  // Depth ≥ 10.5 m keeps room for the corridor stair plus a door to the hall behind it.
  const wdL = asym ? m50(a, 1050, Math.max(1050, wd)) : wd;
  const zWfL = asym ? zF - a.pick([0, 150, 300]) : zWf, zWbL = zWfL - wdL;
  const wL = asym ? R(-cw2 - wwL, zWbL, -cw2, zWfL) : mirrorX(wR, 0);
  const xsL = -cw2 - Math.round(wwL / 100) * 50, zsL = zWbL + Math.round(wdL / 100) * 50;
  const gridL = asym
    ? [R(xsL, zsL, -cw2, zWfL), R(-cw2 - wwL, zsL, xsL, zWfL), R(xsL, zWbL, -cw2, zsL), R(-cw2 - wwL, zWbL, xsL, zsL)]
    : gridR.map((r) => mirrorX(r, 0));
  const bw = Math.min(m50(d, 550, 700), cw2 + ww - xs);
  const courtD = m50(d, 900, 1300);
  const bwR = court ? R(cw2 + ww - bw, zB - courtD, cw2 + ww, zWb) : null;

  // Grand stair inside the hall, ascending toward the back to the gallery.
  const rise0 = H0 + 20;
  const st = stair(b, L0, 0, zBk + 15 + 220 + stairRun(rise0), 270, 220, rise0);
  const block0 = [grow(st, 20)];

  const r0: RoomSpec[] = [
    room(foyer, 'hall', 'Foyer', 'marble'),
    room(hall, 'hall', 'Grand hall', 'marble'),
    room(back, 'ballroom', 'Ballroom', 'parquet'),
  ];
  gridR.forEach((r, i) => {
    r0.push(room(r, rightProg[i][0], rightProg[i][1], rightProg[i][0] === 'kitchen' ? 'tile' : 'parquet'));
    r0.push(room(gridL[i], leftProg[i][0], leftProg[i][1], leftProg[i][0] === 'kitchen' ? 'tile' : 'parquet'));
  });
  if (bwR) {
    const parts = partition(bwR, [55, 45], 'z');
    r0.push(room(parts[0], 'gallery', 'Sculpture gallery', 'marble'));
    if (!asym) r0.push(room(mirrorX(parts[0], 0), 'salon', 'Orangery', 'flagstone'));
    r0.push(room(parts[1], 'laundry', 'Servants’ hall', 'tile'));
    if (!asym) r0.push(room(mirrorX(parts[1], 0), 'gallery', 'Portrait gallery', 'marble'));
  }
  const p0 = buildLevel(b, L0, H0, r0, mats, 40, 15);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 0, ['S'], 180, 320, dr, block0);
  placeExteriorDoor(b, p0, 2, ['N'], 160, 300, dr, block0);
  placeExteriorDoor(b, p0, 2, ['N'], 160, 300, dr, block0, false);
  placeDoors(b, p0, dr, doors, block0);
  placeWindows(b, p0, (r) => (r.type === 'laundry' || r.type === 'kitchen' ? W(110, 220, 80, 320) : W(130, 280, 60, 300)));
  furnishLevel(b, p0, rng.fork('furnish0'), block0);

  // Upper floors: center + both wings, each wing with an inner corridor.
  const upper = (lv: string, h: number, idx: number, rise: number | null) => {
    const rr: RoomSpec[] = [];
    const corridorR = R(cw2, zWb, cw2 + 220, zWf);
    const outer = R(cw2 + 220, zWb, cw2 + ww, zWf);
    const parts = partition(outer, [38, 24, 38], 'z');
    if (idx === 1) {
      rr.push(room(foyer, 'hall', 'Upper hall', 'parquet'));
      rr.push(room(hall, 'gallery', 'Gallery', 'parquet', { holes: [R(hall.x0 + 200, st.z0 - 15, hall.x1 - 200, hall.z1 - 200)] }));
      const bp = partition(back, [24, 52, 24], 'x');
      rr.push(room(bp[0], 'bath', 'Bathroom', 'marble'), room(bp[1], 'bedroom', 'State bedroom', 'parquet'), room(bp[2], 'salon', 'Sitting room', 'parquet'));
    } else {
      rr.push(room(foyer, 'hall', 'Attic hall', 'oak'));
      rr.push(room(hall, 'gallery', 'Long gallery', 'oak'));
      partition(back, [1, 1, 1], 'x').forEach((r, i) => rr.push(room(r, 'bedroom', `Guest room ${i + 1}`, 'oak')));
    }
    const names = idx === 1 ? ['Blue bedroom', 'Rose bedroom', 'Yellow bedroom', 'Green bedroom'] : ['Nursery', 'Governess', 'Maid’s room', 'Valet’s room'];
    const partsL = asym ? partition(R(-cw2 - wwL, zWbL, -cw2 - 220, zWfL), [38, 24, 38], 'z') : [];
    for (const side of [1, -1]) {
      const mir = (r: Rect, i: number) => (side === 1 ? r : asym ? partsL[i] : mirrorX(r, 0));
      const corr = side === 1 ? corridorR : asym ? R(-cw2 - 220, zWbL, -cw2, zWfL) : mirrorX(corridorR, 0);
      rr.push(room(corr, 'hall', side === 1 ? 'East corridor' : 'West corridor', 'oak'));
      rr.push(room(mir(parts[0], 0), 'bedroom', names[side === 1 ? 0 : 1], 'carpet'));
      rr.push(room(mir(parts[1], 1), 'bath', 'Bathroom', 'tile'));
      rr.push(room(mir(parts[2], 2), 'bedroom', names[side === 1 ? 2 : 3], 'carpet'));
    }
    const p = buildLevel(b, lv, h, rr, mats, 35, 15);
    // Secondary stair in the west corridor, against the inner wall.
    const stairX = -cw2 - 15 - 55;
    const blockers = [grow(st, 20)];
    if (rise !== null) blockers.push(grow(stair(b, lv, stairX, zWfL - 15 - 150, 270, 100, rise), 15));
    if (idx === 2) blockers.push(grow(R(stairX - 50, zWfL - 165 - stairRun(H1 + 20), stairX + 50, zWfL - 165), 15));
    placeDoors(b, p, rng.fork('doors' + idx), { ...doors, doorWidth: 100, doorHeight: 240 }, blockers);
    placeWindows(b, p, (r) => (r.type === 'bath' ? W(90, 150, 100, 400) : idx === 1 ? W(120, 230, 60, 300) : W(100, 160, 80, 300)));
    furnishLevel(b, p, rng.fork('furnish' + idx), blockers);
    return p;
  };
  upper(L1, H1, 1, L2 ? H1 + 20 : null);
  if (L2) upper(L2, H2, 2, null);

  // Roofs.
  const mainRects = [R(-cw2, zB, cw2, zF), wR, wL];
  const fps = [
    { level: L0, elevation: 0, height: H0, rects: [...mainRects, ...(bwR ? (asym ? [bwR] : [bwR, mirrorX(bwR, 0)]) : [])] },
    { level: L1, elevation: H0 + 20, height: H1, rects: mainRects },
    ...(L2 ? [{ level: L2, elevation: H0 + H1 + 40, height: H2, rects: mainRects }] : []),
  ];
  roofs(b, fps, { kind: 'hip', pitch: 28, overhang: 50, thickness: 25, material: 'slate' });

  // Portico with columns and a pediment.
  const pw = 300, pd = 650;
  b.slab(L0, R(-pw - 100, zF + 20, pw + 100, zF + 20 + pd), 'platform', 40, 0, false, 'marble');
  for (let i = 0; i < 4; i++) {
    const x = -pw + 30 + Math.round(((2 * pw - 60) * i) / 3);
    b.mass(L0, x, zF + pd - 40, 60, H0, 60, 0, 'marble');
  }
  b.roof(L0, R(-pw, zF, pw, zF + pd), 'gable', 25, 30, H0, 25, 'slate');

  // Formal garden on the axis: reflecting pool, allées, hedges; fountain court behind.
  const s = rng.fork('site');
  const halfW = cw2 + ww;
  const poolZ0 = zF + pd + 600, poolL = m50(s, 1600, 2400);
  b.pond([[-250, poolZ0], [250, poolZ0], [250, poolZ0 + poolL], [-250, poolZ0 + poolL]], -20, 60, false);
  const n = Math.floor(poolL / 400) + 1;
  row(b, 'tree', -700, poolZ0, -700, poolZ0 + poolL, n, 110);
  row(b, 'tree', 700, poolZ0, 700, poolZ0 + poolL, n, 110);
  const halfL = cw2 + wwL;
  row(b, 'hedge', -halfL, zF + 300, -pw - 300, zF + 300, Math.floor((halfL - pw - 300) / 120), 90);
  row(b, 'hedge', pw + 300, zF + 300, halfW, zF + 300, Math.floor((halfW - pw - 300) / 120), 90);
  b.slab(L0, R(-150, zF + 20 + pd, 150, poolZ0 + poolL + 800), 'path', 6, 2, false, 'gravel');
  if (bwR) {
    const fzc = zB - Math.round(courtD / 100) * 50, fr = Math.min(300, Math.round(courtD / 4));
    b.pond(DIR8.map(([dx, dz]) => [Math.round(dx * fr), Math.round(fzc + dz * fr)] as [number, number]), -10, 60, true);
  }
  const zMax = poolZ0 + poolL + 800, zMin = zB - (court ? courtD : 0) - 1500;
  const SW = 2 * halfW + 3600, SD = 2 * Math.max(zMax, -zMin) + 600;
  setSite(b, SW, SD, 'grass', s.int(0, 40), s.int(1, 9999), 0, 3000);
  scatter(b, s, s.int(14, 22), R(-SW / 2 + 300, -SD / 2 + 300, SW / 2 - 300, SD / 2 - 300),
    [grow(R(-halfW, zB - (court ? courtD : 0), halfW, poolZ0 + poolL + 200), 500)], ['tree', 'pine', 'tree']);
  return b.doc;
}
