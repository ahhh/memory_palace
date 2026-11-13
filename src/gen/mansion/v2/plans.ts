/**
 * FROZEN once deployed. Great-house plans modelled on real ones:
 *  - rotonda: Palladio's Villa La Rotonda (1567): a square block around a domed central
 *    hall, cross halls to four identical porticos, paired rooms in each corner.
 *  - elizabethan: the Elizabethan "prodigy house" E-plan (Hardwick, Montacute): a range
 *    with projecting end wings and a central porch, a great hall entered through the
 *    screens passage, a great chamber above, and a long gallery across the top floor.
 *  - siheyuan: the Beijing courtyard house: separate halls facing a square court, the main
 *    hall to the north, wing houses east and west, a gate-house row to the south.
 */
import type { PalaceDoc, Recipe, RoomType } from '../../../model/schema';
import { DocBuilder } from '../../_lib/v1/builder';
import { type LevelFootprint, W, baseDoorCost, room, roofs, row, scatter, setSite, stair } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type DoorPolicy, type RoomSpec, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { partition } from '../../_lib/v1/partition';
import { type Rect, R, grow } from '../../_lib/v1/rect';
import type { Rng } from '../../_lib/v1/rng';
import { colonnade } from '../../_lib/v2/variety';

const m50 = (r: Rng, lo: number, hi: number) => r.step(lo, hi, 50);
const doors: DoorPolicy = { cost: baseDoorCost, loops: 0.6, doorWidth: 120, doorHeight: 260 };

function floorsOf(recipe: Recipe, rng: Rng, p3: number): number {
  return recipe.params.floors ? Number(recipe.params.floors) : rng.chance(p3) ? 3 : 2;
}

/* ─────────────────────────────── Villa Rotonda ─────────────────────────────── */
export function rotonda(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const floors = floorsOf(recipe, prog, 0.4);
  const b = new DocBuilder({ name: `Villa ${prog.pick(['Capra', 'Almerico', 'Foscari', 'Emo', 'Cornaro', 'Badoer', 'Pisani', 'Barbaro', 'Godi', 'Poiana'])}`, style: 'mansion', origin: recipe });
  const d = rng.fork('dims');
  const c = d.step(900, 1100, 100), arm = m50(d, 800, 900);
  const hc = c / 2, h = hc + arm;
  const ext = d.pick(['stucco', 'stucco', 'marble', 'stone']);
  const mats = { ext, int: 'plaster' };
  const H0 = 420, H1 = 340, H2 = 280;
  const L0 = b.level(0, 0, H0, 'Piano nobile');
  const L1 = b.level(1, H0 + 20, H1, 'Upper floor');
  const L2 = floors === 3 ? b.level(2, H0 + H1 + 40, H2, 'Attic') : null;

  // The square block is a 3×3 grid: rotunda, four cross halls, four corner pairs.
  const rot = R(-hc, -hc, hc, hc);
  const vest = { N: R(-hc, -h, hc, -hc), S: R(-hc, hc, hc, h), E: R(hc, -hc, h, hc), W: R(-h, -hc, -hc, hc) };
  const split = hc + m50(d, Math.round(arm * 0.5 / 50) * 50, Math.round(arm * 0.65 / 50) * 50);
  // Each corner: a big room against the N/S hall and a small one at the outer corner.
  const corners: [Rect, Rect][] = [];
  for (const sz of [-1, 1]) for (const sx of [1, -1]) {
    const big = R(sx * hc, sz * hc, sx * split, sz * h), small = R(sx * split, sz * hc, sx * h, sz * h);
    corners.push([big, small]);
  }
  const BIG: [RoomType, string][] = [['salon', 'Salon'], ['salon', 'Salon of the Gods'], ['dining', 'Dining room'], ['music', 'Music room']];
  const SMALL: [RoomType, string][] = [['office', 'Study'], ['library', 'Library'], ['gallery', 'Cabinet of curiosities'], ['salon', 'Camerino']];
  const bigs = prog.shuffle(BIG), smalls = prog.shuffle(SMALL);

  const rise0 = H0 + 20, rise1 = H1 + 20;
  const st0 = stair(b, L0, hc + 30, -hc + 15 + 60, 0, 120, rise0);
  const st0w = stair(b, L0, -hc - 30, -hc + 15 + 60, 180, 120, rise0);
  const block0 = [grow(st0, 15), grow(st0w, 15)];
  const r0: RoomSpec[] = [
    room(rot, 'hall', 'Rotunda', 'marble'),
    room(vest.N, 'hall', 'North hall', 'marble'), room(vest.S, 'hall', 'South hall', 'marble'),
    room(vest.E, 'hall', 'East hall', 'marble'), room(vest.W, 'hall', 'West hall', 'marble'),
  ];
  corners.forEach(([big, small], i) => {
    r0.push(room(big, bigs[i][0], bigs[i][1], 'parquet'), room(small, smalls[i][0], smalls[i][1], 'parquet'));
  });
  const p0 = buildLevel(b, L0, H0, r0, mats, 40, 15);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 1, ['N'], 160, 320, dr, block0);
  placeExteriorDoor(b, p0, 2, ['S'], 160, 320, dr, block0);
  placeExteriorDoor(b, p0, 3, ['E'], 160, 320, dr, block0);
  placeExteriorDoor(b, p0, 4, ['W'], 160, 320, dr, block0);
  placeDoors(b, p0, dr, doors, block0);
  placeWindows(b, p0, () => W(120, 260, 60, 300));
  furnishLevel(b, p0, rng.fork('furnish0'), block0);

  const upper = (lv: string, H: number, idx: number, blockers: Rect[]) => {
    const rr: RoomSpec[] = [
      idx === 1
        ? room(rot, 'gallery', 'Rotunda gallery', 'marble', { holes: [R(-hc + 200, -hc + 200, hc - 200, hc - 200)] })
        : room(rot, 'hall', 'Attic hall', 'oak'),
      room(vest.N, 'hall', 'North landing', 'oak'), room(vest.S, 'hall', 'South landing', 'oak'),
      room(vest.E, 'hall', 'East landing', 'oak'), room(vest.W, 'hall', 'West landing', 'oak'),
    ];
    const names = idx === 1 ? ['Red bedroom', 'Gold bedroom', 'Green bedroom', 'Blue bedroom'] : ['Steward', 'Tutor', 'Cook', 'Groom'];
    corners.forEach(([big, small], i) => {
      rr.push(room(big, 'bedroom', idx === 1 ? names[i] : `${names[i]}’s room`, idx === 1 ? 'parquet' : 'oak'));
      rr.push(room(small, idx === 1 ? 'bath' : 'closet', idx === 1 ? 'Dressing room' : 'Closet', idx === 1 ? 'marble' : 'oak'));
    });
    const p = buildLevel(b, lv, H, rr, mats, 35, 15);
    placeDoors(b, p, rng.fork('doors' + idx), { ...doors, doorWidth: 100, doorHeight: 240 }, blockers);
    placeWindows(b, p, () => (idx === 1 ? W(110, 200, 70, 300) : W(90, 90, 90, 300)));
    furnishLevel(b, p, rng.fork('furnish' + idx), blockers);
  };
  const st1 = L2 ? stair(b, L1, hc + 30, hc - 15 - 60, 0, 120, rise1) : null;
  upper(L1, H1, 1, [...block0, ...(st1 ? [grow(st1, 15)] : [])]);
  if (L2) upper(L2, H2, 2, [grow(st1!, 15)]);

  // Hipped roof crowned by a stepped drum and lantern standing in for the dome.
  const top = L2 ?? L1, topH = L2 ? H2 : H1, topY = L2 ? H0 + H1 + 40 + H2 : H0 + 20 + H1;
  b.roof(top, R(-h, -h, h, h), 'hip', 22, 60, topY, 25, d.pick(['shingle', 'slate', 'copper']));
  const dw = Math.round(c * 0.8 / 10) * 10;
  b.mass(top, 0, 0, dw, 560, dw, topH - 40, ext);
  b.mass(top, 0, 0, dw - 160, 140, dw - 160, topH + 520, 'copper');
  b.mass(top, 0, 0, 120, 160, 120, topH + 660, 'white');

  // Four identical hexastyle-ish porticos, each deeper than wide so its pediment faces out.
  const pw = m50(d, 600, 700), pd = pw + 150;
  const porticos = [R(-pw / 2, -h - pd, pw / 2, -h), R(-pw / 2, h, pw / 2, h + pd), R(h, -pw / 2, h + pd, pw / 2), R(-h - pd, -pw / 2, -h, pw / 2)];
  porticos.forEach((p, i) => {
    b.slab(L0, p, 'platform', 60, 0, false, 'marble');
    if (i < 2) {
      const z = i === 0 ? p.z0 + 40 : p.z1 - 40;
      colonnade(b, L0, p.x0 + 40, z, p.x1 - 40, z, 4, 60, H0, 'marble');
    } else {
      const x = i === 2 ? p.x1 - 40 : p.x0 + 40;
      colonnade(b, L0, x, p.z0 + 40, x, p.z1 - 40, 4, 60, H0, 'marble');
    }
    b.roof(L0, p, 'gable', 22, 30, H0, 25, 'slate');
  });

  // Hilltop site: avenue from the south, lawns, a ring of trees.
  const s = rng.fork('site');
  const SW = 2 * (h + pd) + 4000;
  setSite(b, SW, SW + 1600, 'grass', s.int(40, 120), s.int(1, 9999), 0, 3000);
  b.slab(L0, R(-150, h + pd, 150, SW / 2 + 800), 'path', 6, 2, false, 'gravel');
  const al = SW / 2 + 400 - (h + pd + 400);
  const n = Math.max(3, Math.floor(al / 450));
  row(b, 'pine', -500, h + pd + 400, -500, SW / 2 + 400, n, 120);
  row(b, 'pine', 500, h + pd + 400, 500, SW / 2 + 400, n, 120);
  scatter(b, s, s.int(14, 22), R(-SW / 2 + 300, -SW / 2 - 500, SW / 2 - 300, SW / 2 + 500),
    [grow(R(-h - pd, -h - pd, h + pd, h + pd), 600), R(-700, h, 700, SW)], ['tree', 'pine', 'tree']);
  return b.doc;
}

/* ─────────────────────────────── Elizabethan E-plan ─────────────────────────────── */
export function elizabethan(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const floors = floorsOf(recipe, prog, 0.65);
  const b = new DocBuilder({ name: `${prog.pick(['Hardwick', 'Montacute', 'Wollaton', 'Longleat', 'Burghley', 'Kirby', 'Blickling', 'Charlecote'])} ${prog.pick(['Hall', 'House', 'Court', 'Place'])}`, style: 'mansion', origin: recipe });
  const d = rng.fork('dims');
  const asym = recipe.params.symmetric === '0';
  const LR = d.step(3600, 4400, 100), ww = d.step(800, 1000, 100), dR = d.step(850, 1000, 50), pj = m50(d, 700, 1000);
  const pjE = asym ? m50(d, 400, 1300) : pj;
  const x0 = -LR / 2, x1 = LR / 2, xa = x0 + ww, xb = x1 - ww;
  const zR0 = -Math.round((dR + Math.max(pj, pjE)) / 20) * 10, zR1 = zR0 + dR, zF = zR1 + pj, zFE = zR1 + pjE;
  const ext = d.pick(['stone', 'stone', 'brick', 'roman']);
  const mats = { ext, int: 'plaster' };
  const H0 = 400, H1 = 380, H2 = 360;
  const L0 = b.level(0, 0, H0, 'Hall floor');
  const L1 = b.level(1, H0 + 20, H1, 'Great chamber floor');
  const L2 = floors === 3 ? b.level(2, H0 + H1 + 40, H2, 'Gallery floor') : null;

  const wW = R(x0, zR0, xa, zF), wE = R(xb, zR0, x1, zFE), mid = R(xa, zR0, xb, zR1), porch = R(-200, zR1, 200, zR1 + 300);
  const xm = xa + Math.round((-130 - xa) / 20) * 10;
  const st0 = stair(b, L0, x1 - 15 - 60, zR1 - 15 - 130, 270, 120, H0 + 20);
  const st1 = L2 ? stair(b, L1, xb + Math.round(ww / 20) * 10 - 40, zR0 + 15 + 130, 90, 120, H1 + 20) : null;
  const block0 = [grow(st0, 15)];
  const block1 = [grow(st0, 15), ...(st1 ? [grow(st1, 15)] : [])];

  const r0: RoomSpec[] = [
    room(porch, 'hall', 'Porch', 'flagstone'),
    room(R(-130, zR0, 130, zR1), 'hall', 'Screens passage', 'flagstone'),
    room(R(130, zR0, xb, zR1), 'dining', 'Great hall', 'flagstone'),
    room(R(xm, zR0, -130, zR1), 'laundry', 'Buttery', 'flagstone'),
    room(R(xa, zR0, xm, zR1), 'dining', 'Servants’ hall', 'flagstone'),
    room(R(x0, zR0, xa, zR1), 'kitchen', 'Kitchen', 'flagstone'),
    room(R(x0, zR1, xa, zF), 'laundry', 'Brewhouse', 'flagstone'),
    room(R(xb, zR0, x1, zR1), 'hall', 'Great stair', 'oak'),
    room(R(xb, zR1, x1, zFE), 'salon', 'Great parlour', 'oak'),
  ];
  const p0 = buildLevel(b, L0, H0, r0, mats, 45, 15);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 0, ['S'], 160, 300, dr, block0);
  placeExteriorDoor(b, p0, 1, ['N'], 140, 280, dr, block0);
  placeExteriorDoor(b, p0, 5, ['N', 'W'], 110, 240, dr, block0, false);
  placeDoors(b, p0, dr, doors, block0);
  // "More glass than wall": tall mullioned windows everywhere but the service rooms.
  placeWindows(b, p0, (r) => (r.type === 'laundry' || r.type === 'kitchen' ? W(100, 160, 140, 300) : W(150, 300, 60, 200)));
  furnishLevel(b, p0, rng.fork('furnish0'), block0);

  const r1: RoomSpec[] = [
    room(porch, 'office', 'Porch chamber', 'oak'),
    room(R(-130, zR0, xb, zR1), 'salon', 'Great chamber', 'oak'),
    room(R(xa, zR0, -130, zR1), 'salon', 'Withdrawing chamber', 'oak'),
    room(R(x0, zR0, xa, zR1), 'bedroom', 'West bedchamber', 'carpet'),
    room(R(x0, zR1, xa, zF), 'closet', 'Closet', 'oak'),
    room(R(xb, zR0, x1, zR1), 'hall', 'Stair landing', 'oak'),
    room(R(xb, zR1, x1, zFE), 'bedroom', 'Best bedchamber', 'carpet'),
  ];
  const p1 = buildLevel(b, L1, H1, r1, mats, 40, 15);
  placeDoors(b, p1, rng.fork('doors1'), { ...doors, doorWidth: 100, doorHeight: 240 }, block1);
  placeWindows(b, p1, () => W(150, 280, 60, 200));
  furnishLevel(b, p1, rng.fork('furnish1'), block1);

  const fp: LevelFootprint[] = [
    { level: L0, elevation: 0, height: H0, rects: [wW, wE, mid, porch] },
    { level: L1, elevation: H0 + 20, height: H1, rects: [wW, wE, mid, porch] },
  ];
  if (L2) {
    // The long gallery runs the full length of the top floor.
    const r2: RoomSpec[] = [
      room(R(x0, zR0, x1, zR1), 'gallery', 'Long gallery', 'oak'),
      room(R(x0, zR1, xa, zF), 'bedroom', 'West tower chamber', 'carpet'),
      room(R(xb, zR1, x1, zFE), 'bedroom', 'East tower chamber', 'carpet'),
      room(porch, 'office', 'Banqueting room', 'oak'),
    ];
    const p2 = buildLevel(b, L2, H2, r2, mats, 40, 15);
    const block2 = [grow(st1!, 15)];
    placeDoors(b, p2, rng.fork('doors2'), { ...doors, doorWidth: 100, doorHeight: 240 }, block2);
    placeWindows(b, p2, () => W(160, 260, 60, 200));
    furnishLevel(b, p2, rng.fork('furnish2'), block2);
    fp.push({ level: L2, elevation: H0 + H1 + 40, height: H2, rects: [wW, wE, mid, porch] });
  }
  roofs(b, fp, { kind: 'gable', pitch: 40, overhang: 30, thickness: 25, material: d.pick(['slate', 'shingle']) });
  // Clustered chimney stacks along the back wall.
  const topY = L2 ? H0 + H1 + H2 + 40 : H0 + H1 + 20;
  for (const x of [xa + 150, Math.round(xa / 2 / 10) * 10, Math.round(xb / 2 / 10) * 10, xb - 150]) {
    b.mass(L0, x, zR0 - 45, 180, topY + 300, 60, 0, ext === 'stone' ? 'stone' : 'brick');
  }

  // Walled forecourt between the wings, knot garden, an avenue to the porch.
  const s = rng.fork('site');
  const fz = Math.max(zF, zFE);
  b.slab(L0, R(xa + 100, zR1 + 15, xb - 100, fz + 200), 'path', 6, 2, false, 'gravel');
  for (const sx of [-1, 1]) {
    const k0 = sx < 0 ? xa + 300 : 500, k1 = sx < 0 ? -500 : xb - 300;
    if (k1 - k0 < 300) continue;
    row(b, 'hedge', k0, zR1 + 450, k1, zR1 + 450, Math.max(2, Math.floor((k1 - k0) / 120)), 70);
    row(b, 'hedge', k0, fz - 50, k1, fz - 50, Math.max(2, Math.floor((k1 - k0) / 120)), 70);
  }
  const SW = LR + 4000, SD = 2 * Math.max(-zR0, fz) + 5000;
  setSite(b, SW, SD, 'grass', s.int(0, 50), s.int(1, 9999), 0, 3000);
  b.slab(L0, R(-150, fz + 200, 150, SD / 2), 'path', 6, 2, false, 'gravel');
  const n = Math.max(3, Math.floor((SD / 2 - fz - 600) / 500));
  row(b, 'tree', -450, fz + 600, -450, SD / 2 - 200, n, 120);
  row(b, 'tree', 450, fz + 600, 450, SD / 2 - 200, n, 120);
  scatter(b, s, s.int(12, 20), R(-SW / 2 + 300, -SD / 2 + 300, SW / 2 - 300, SD / 2 - 300),
    [grow(R(x0, zR0, x1, fz), 500), R(-700, fz, 700, SD)], ['tree', 'pine', 'tree']);
  return b.doc;
}

/* ─────────────────────────────── Siheyuan courtyard house ─────────────────────────────── */
export function siheyuan(recipe: Recipe, rng: Rng): PalaceDoc {
  const prog = rng.fork('program');
  const b = new DocBuilder({ name: `${prog.pick(['Peony', 'Jade', 'Pine', 'Crane', 'Lotus', 'Willow', 'Plum Blossom', 'Bamboo'])} ${prog.pick(['Courtyard', 'Mansion', 'Residence', 'Hall'])}`, style: 'mansion', origin: recipe });
  const d = rng.fork('dims');
  const sym = recipe.params.symmetric !== '0';
  const cw = m50(d, 1000, 1400), cd = m50(d, 1000, 1300), wd = m50(d, 450, 550), md = m50(d, 600, 700), sd = m50(d, 450, 520), rd = m50(d, 400, 480);
  const rear = d.chance(0.6);
  const hx = cw / 2, hz = cd / 2, xo = hx + wd;
  const ext = d.pick(['stone', 'brick', 'stone']);
  const mats = { ext, int: 'plaster' };
  const H = 360;
  const L0 = b.level(0, 0, H, 'Courtyard');

  const cen = m50(d, Math.round(cw * 0.36 / 50) * 50, Math.round(cw * 0.44 / 50) * 50);
  const bay = Math.round((cw - cen) / 20) * 10;
  const rooms: RoomSpec[] = [
    room(R(-hx + bay, -hz - md, hx - bay, -hz), 'salon', 'Main hall', 'parquet'),
    room(R(-hx, -hz - md, -hx + bay, -hz), 'bedroom', 'Master’s chamber', 'parquet'),
    room(R(hx - bay, -hz - md, hx, -hz), 'library', 'Study', 'parquet'),
    room(R(-xo, -hz - md, -hx, -hz), 'bath', 'Bathhouse', 'tile'),
    room(R(hx, -hz - md, xo, -hz), 'kitchen', 'Kitchen', 'tile'),
  ];
  const courtDoors: [number, 'N' | 'S' | 'E' | 'W'][] = [[0, 'S']];
  // Wing houses: each room opens onto the courtyard.
  const WEST: [RoomType, string][] = [['bedroom', 'Daughters’ room'], ['dining', 'Dining hall'], ['office', 'Sewing room']];
  const EAST: [RoomType, string][] = [['bedroom', 'Sons’ room'], ['office', 'Guest room'], ['music', 'Music room']];
  const nW = d.int(2, 3);
  partition(R(-xo, -hz, -hx, hz), Array(nW).fill(1), 'z').forEach((r, i) => {
    courtDoors.push([rooms.length, 'E']);
    rooms.push(room(r, WEST[i][0], WEST[i][1], 'parquet'));
  });
  partition(R(hx, -hz, xo, hz), Array(sym ? nW : d.int(2, 3)).fill(1), 'z').forEach((r, i) => {
    courtDoors.push([rooms.length, 'W']);
    rooms.push(room(r, EAST[i][0], EAST[i][1], 'parquet'));
  });
  // South row: the gate hall (centred, or in the lucky south-east corner of the court).
  const gw = m50(d, 300, 400);
  const gx0 = sym ? -gw / 2 : hx - gw, gx1 = gx0 + gw;
  const gateIdx = rooms.length;
  rooms.push(room(R(gx0, hz, gx1, hz + sd), 'hall', 'Gate hall', 'flagstone'));
  const SOUTH: [RoomType, string][] = [['library', 'Schoolroom'], ['office', 'Tutor’s room'], ['laundry', 'Storeroom'], ['office', 'Gatekeeper’s room']];
  const spans: Rect[] = sym
    ? [...partition(R(-xo, hz, gx0, hz + sd), [1, 1], 'x'), ...partition(R(gx1, hz, xo, hz + sd), [1, 1], 'x')]
    : [...partition(R(-xo, hz, gx0, hz + sd), [1, 1, 1], 'x'), R(gx1, hz, xo, hz + sd)];
  spans.forEach((r, i) => {
    courtDoors.push([rooms.length, 'N']);
    rooms.push(room(r, SOUTH[i % SOUTH.length][0], SOUTH[i % SOUTH.length][1], 'parquet'));
  });
  const rearDoors: number[] = [];
  if (rear) {
    const nR = d.int(3, 4);
    partition(R(-xo, -hz - md - rd, xo, -hz - md), Array(nR).fill(1), 'x').forEach((r, i) => {
      rearDoors.push(rooms.length);
      rooms.push(room(r, 'bedroom', `Rear chamber ${i + 1}`, 'parquet'));
    });
  }
  const p = buildLevel(b, L0, H, rooms, mats, 35, 15);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p, gateIdx, ['S'], 180, 280, dr, []);
  placeExteriorDoor(b, p, gateIdx, ['N'], 160, 260, dr, []);
  for (const [i, side] of courtDoors) placeExteriorDoor(b, p, i, [side], 110, 240, dr, []);
  for (const i of rearDoors) placeExteriorDoor(b, p, i, ['N'], 100, 230, dr, [], false);
  placeDoors(b, p, dr, { ...doors, loops: 0.2, doorWidth: 100, doorHeight: 240 }, []);
  // Lattice windows face the court; outer walls stay nearly blind.
  placeWindows(b, p, (r, piece, side) => {
    const facesCourt = (side === 'S' && piece.coord === -hz) || (side === 'N' && piece.coord === hz) || (side === 'E' && piece.coord === -hx) || (side === 'W' && piece.coord === hx);
    return facesCourt ? W(140, 200, 70, 260) : r.type === 'bath' || r.type === 'kitchen' ? W(60, 60, 200, 500) : null;
  });
  furnishLevel(b, p, rng.fork('furnish'), []);

  const roofMat = d.pick(['slate', 'slate', 'copper']);
  const halls = [R(-xo, -hz - md, xo, -hz), R(-xo, -hz, -hx, hz), R(hx, -hz, xo, hz), R(-xo, hz, xo, hz + sd), ...(rear ? [R(-xo, -hz - md - rd, xo, -hz - md)] : [])];
  halls.forEach((r, i) => b.roof(L0, r, 'gable', 28, 70, H, 25, i === 0 ? roofMat : 'slate'));
  // The main hall stands on a raised terrace with a veranda of red columns.
  b.slab(L0, R(-hx + bay, -hz + 15, hx - bay, -hz + 200), 'terrace', 40, 0, false, 'stone');
  colonnade(b, L0, -hx + bay + 30, -hz + 170, hx - bay - 30, -hz + 170, 4, 30, H - 40, 'brick');

  // Courtyard: a fish basin at the crossing of the paths, a pair of trees before the main
  // hall, and a spirit screen inside the gate.
  const s = rng.fork('site');
  b.slab(L0, R(-70, -hz + 200, 70, -130), 'path', 6, 2, false, 'flagstone');
  b.slab(L0, R(-70, 130, 70, hz), 'path', 6, 2, false, 'flagstone');
  b.slab(L0, R(-hx, -70, -130, 70), 'path', 6, 2, false, 'flagstone');
  b.slab(L0, R(130, -70, hx, 70), 'path', 6, 2, false, 'flagstone');
  b.pond([[-110, -110], [110, -110], [110, 110], [-110, 110]], -10, 60, s.chance(0.5));
  const qx = Math.round(hx / 20) * 10, qz = Math.round(hz / 20) * 10;
  b.plant('tree', -qx, -qz, s.int(80, 100));
  b.plant('tree', qx, -qz, s.int(80, 100));
  const gc = Math.round((gx0 + gx1) / 20) * 10;
  b.mass(L0, gc, hz - 170, gw + 40, 280, 40, 0, ext);

  const SW = 2 * xo + 3000, SD = 2 * (hz + md + rd + sd) + 3000;
  setSite(b, SW, SD, 'grass', s.int(0, 20), s.int(1, 9999));
  b.slab(L0, R(-SW / 2, hz + sd + 300, SW / 2, hz + sd + 700), 'path', 6, 2, false, 'gravel');
  b.slab(L0, R(gx0 + 40, hz + sd + 15, gx1 - 40, hz + sd + 300), 'path', 6, 2, false, 'flagstone');
  scatter(b, s, s.int(8, 14), R(-SW / 2 + 300, -SD / 2 + 300, SW / 2 - 300, SD / 2 - 300),
    [grow(R(-xo, -hz - md - rd, xo, hz + sd + 700), 400)], ['tree', 'pine', 'shrub']);
  return b.doc;
}

