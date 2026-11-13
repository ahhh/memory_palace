/**
 * FROZEN once deployed. The Willits House (Wright, 1901): a cruciform Prairie plan whose
 * four wings (living, dining, kitchen, entry) pinwheel around a central hearth. Bedrooms sit
 * over the wings; the shorter upper wings leave broad flat roofs below.
 */
import type { Id } from '../../../model/schema';
import type { DocBuilder } from '../../_lib/v1/builder';
import { RIBBON, baseDoorCost, openPlanArch, room, roofs, scatter, setSite, stair } from '../../_lib/v1/common';
import { furnishLevel } from '../../_lib/v1/furnish';
import { type DoorPolicy, type RoomSpec, buildLevel, placeDoors, placeExteriorDoor, placeWindows } from '../../_lib/v1/layout';
import { R, grow } from '../../_lib/v1/rect';
import type { Rng } from '../../_lib/v1/rng';

const H = 260, LV = H + 20;
const doorPolicy: DoorPolicy = { cost: baseDoorCost, arch: openPlanArch, loops: 0.5, doorWidth: 90, doorHeight: 210 };

function chimney(b: DocBuilder, level: Id, height: number, mat: string) {
  b.mass(level, 0, 0, 220, height, 140, 0, mat);
  b.mass(level, 0, 0, 160, 40, 100, height, mat);
}

export function willits(b: DocBuilder, rng: Rng) {
  const d = rng.fork('dims');
  const hc = d.step(320, 360, 20); // half the hearth core (the arms are as wide as the core)
  const aS = d.step(700, 900, 20), aE = d.step(560, 700, 20), aN = d.step(500, 620, 20), aW = d.step(640, 720, 20);
  const ext = d.pick(['stucco', 'stucco', 'roman']);
  const roofMat = d.pick(['copper', 'shingle']);
  const mats = { ext, int: 'plaster' };
  const L0 = b.level(0, 0, H, 'Main floor');
  const L1 = b.level(1, LV, H, 'Bedroom floor');

  const core = R(-hc, -hc, hc, hc);
  const arms = { S: R(-hc, hc, hc, hc + aS), E: R(hc, -hc, hc + aE, hc), N: R(-hc, -hc - aN, hc, -hc), W: R(-hc - aW, -hc, -hc, hc) };
  const st = stair(b, L0, -hc - 110, -hc + 15 + 50, 180, 100, LV);
  const hearth = R(-110, -70, 110, 70);
  chimney(b, L0, 2 * LV + 60, ext === 'roman' ? 'roman' : 'fieldstone');
  const block = [grow(st, 10), grow(hearth, 30)];

  const r0: RoomSpec[] = [
    room(core, 'hall', 'Hearth hall', 'oak'),
    room(arms.S, 'living', 'Living room', 'oak'),
    room(arms.E, 'dining', 'Dining room', 'oak'),
    room(arms.N, 'kitchen', 'Kitchen', 'tile'),
    room(arms.W, 'hall', 'Entry hall', 'oak'),
  ];
  const p0 = buildLevel(b, L0, H, r0, mats);
  const dr = rng.fork('doors');
  placeExteriorDoor(b, p0, 4, ['W'], 100, 220, dr, block);
  placeExteriorDoor(b, p0, 1, ['S'], 160, 220, dr, block);
  placeExteriorDoor(b, p0, 3, ['N', 'E'], 90, 210, dr, block, false);
  placeDoors(b, p0, dr, doorPolicy, block);
  placeWindows(b, p0, (r) => (r.type === 'hall' ? RIBBON(60, 100, 120, 10) : RIBBON(90, 140, 80, 10)));
  furnishLevel(b, p0, rng.fork('furnish0'), block);

  // Upper floor: shorter south and east wings, so broad flat roofs reach out below them.
  const sS = d.step(100, 260, 20), sE = d.step(0, 160, 20);
  const up = { S: R(-hc, hc, hc, hc + aS - sS), E: R(hc, -hc, hc + aE - sE, hc) };
  const bathW = 240;
  const r1: RoomSpec[] = [
    room(core, 'hall', 'Landing', 'oak'),
    room(up.S, 'bedroom', 'Main bedroom', 'oak'),
    room(up.E, 'bedroom', 'Bedroom 2', 'oak'),
    room(R(-hc, -hc - aN, -hc + bathW, -hc), 'bath', 'Bathroom', 'tile'),
    room(R(-hc + bathW, -hc - aN, hc, -hc), 'bedroom', 'Bedroom 3', 'oak'),
    room(arms.W, 'hall', 'Upper hall', 'oak'),
  ];
  const p1 = buildLevel(b, L1, H, r1, mats);
  placeDoors(b, p1, rng.fork('doors1'), doorPolicy, block);
  placeWindows(b, p1, (r) => (r.type === 'hall' ? RIBBON(60, 80, 130, 10) : RIBBON(80, 110, 100, 10)));
  furnishLevel(b, p1, rng.fork('furnish1'), block);

  const ov = d.step(160, 260, 20);
  roofs(b, [
    { level: L0, elevation: 0, height: H, rects: [core, arms.S, arms.E, arms.N, arms.W] },
    { level: L1, elevation: LV, height: H, rects: [core, up.S, up.E, arms.N, arms.W] },
  ], { kind: 'hip', pitch: 15, overhang: ov, thickness: 18, material: roofMat }, { kind: 'flat', pitch: 0, overhang: ov, thickness: 18, material: roofMat });

  // Porte-cochère beyond the entry, a terrace beyond the living room.
  const pc = R(-hc - aW - 500, -hc + 20, -hc - aW - 15, hc - 20);
  b.slab(L0, pc, 'path', 6, 2, false, 'concrete');
  b.roof(L0, pc, 'flat', 0, 80, H - 20, 18, roofMat);
  for (const z of [pc.z0 + 30, pc.z1 - 30]) b.mass(L0, pc.x0 + 30, z, 50, H - 20, 50, 0, ext);
  const tz = hc + aS + 15;
  b.slab(L0, R(-hc - 250, tz, hc + 250, tz + 360), 'terrace', 30, 0, true, 'stucco');
  for (const x of [-hc - 250, hc + 220]) b.mass(L0, x + 15, tz + 330, 90, 70, 90, 0, 'stucco');

  // Wooded lot with a drive from the west.
  const s = rng.fork('site');
  const ext2 = Math.max(hc + aS + 400, hc + aE, hc + aN, hc + aW + 500);
  const SW = 2 * ext2 + 2800;
  setSite(b, SW, SW, 'grass', s.int(0, 40), s.int(1, 9999));
  b.slab(L0, R(-SW / 2, pc.z0 + 40, pc.x0, pc.z1 - 40), 'path', 6, 2, false, 'gravel');
  scatter(b, s, s.int(14, 22), R(-SW / 2 + 200, -SW / 2 + 200, SW / 2 - 200, SW / 2 - 200),
    [grow(R(pc.x0, -hc - aN, hc + aE, tz + 360), 300), R(-SW / 2, pc.z0 - 100, pc.x0, pc.z1 + 100)], ['tree', 'tree', 'pine', 'shrub']);
}
