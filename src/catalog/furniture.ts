/**
 * Render catalog: each item is a handful of primitive parts. Footprints for ids the
 * generators use come from the frozen FURN_DIMS_V1 table; new ids may be appended.
 */
import { FURN_DIMS_V1 } from '../gen/_lib/v1/furnish';

export type Shape = 'box' | 'cyl' | 'sphere' | 'cone';
/** Position is the part's center in meters, item-local (y up, front toward +z). Size is w, h, d. */
export interface Part { s: Shape; p: [number, number, number]; z: [number, number, number]; c: string }
export interface CatalogItem { id: string; label: string; group: string; dims: [number, number, number]; parts: Part[] }

const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: string): Part => ({ s: 'box', p: [x, y, z], z: [w, h, d], c });
const cyl = (x: number, y: number, z: number, w: number, h: number, c: string): Part => ({ s: 'cyl', p: [x, y, z], z: [w, h, w], c });
const ball = (x: number, y: number, z: number, r: number, c: string): Part => ({ s: 'sphere', p: [x, y, z], z: [r * 2, r * 2, r * 2], c });

const WOOD = '#8b5e3c', DARK = '#4a3426', LINEN = '#e9e2d4', FABRIC = '#7c8a6e', STEEL = '#c9ccd0', WHITE = '#f4f2ee', BLACK = '#26272b', GREEN = '#4f7a3a', GOLD = '#c9a94a', RED = '#8e3b36', BLUE = '#3d5a80';

type Builder = (w: number, h: number, d: number) => Part[];

const BUILDERS: Record<string, [string, string, Builder]> = {
  bed_double: ['Double bed', 'Bedroom', (w, _h, d) => [
    box(0, 0.2, 0, w, 0.3, d, DARK), box(0, 0.45, 0.05, w - 0.06, 0.22, d - 0.12, LINEN),
    box(0, 0.6, -d / 2 + 0.06, w, 1.0, 0.08, DARK), box(-w / 4, 0.6, -d / 2 + 0.3, w / 2 - 0.12, 0.12, 0.35, WHITE),
    box(w / 4, 0.6, -d / 2 + 0.3, w / 2 - 0.12, 0.12, 0.35, WHITE), box(0, 0.58, d / 6, w - 0.04, 0.06, d * 0.55, BLUE)]],
  bed_single: ['Single bed', 'Bedroom', (w, _h, d) => [
    box(0, 0.2, 0, w, 0.3, d, WOOD), box(0, 0.45, 0.05, w - 0.06, 0.22, d - 0.12, LINEN),
    box(0, 0.5, -d / 2 + 0.05, w, 0.9, 0.06, WOOD), box(0, 0.6, -d / 2 + 0.3, w - 0.2, 0.12, 0.35, WHITE),
    box(0, 0.58, d / 6, w - 0.04, 0.06, d * 0.55, RED)]],
  nightstand: ['Nightstand', 'Bedroom', (w, h, d) => [box(0, h / 2, 0, w, h, d, WOOD), cyl(0, h + 0.15, 0, 0.18, 0.3, GOLD)]],
  wardrobe: ['Wardrobe', 'Bedroom', (w, h, d) => [box(0, h / 2, 0, w, h, d, WOOD), box(0, h / 2, d / 2, 0.02, h - 0.1, 0.01, DARK)]],
  desk: ['Desk', 'Office', (w, h, d) => [box(0, h - 0.02, 0, w, 0.04, d, WOOD), box(-w / 2 + 0.2, h / 2 - 0.02, 0, 0.36, h - 0.04, d - 0.04, WOOD), box(0.2, h + 0.18, -0.1, 0.5, 0.32, 0.03, BLACK)]],
  chair: ['Chair', 'Office', (w, h, d) => [box(0, 0.45, 0, w, 0.06, d, DARK), box(0, 0.7, -d / 2 + 0.03, w, 0.5, 0.05, DARK), cyl(0, 0.22, 0, 0.06, 0.44, STEEL)].map((p) => (void h, p))],
  sofa: ['Sofa', 'Living', (w, h, d) => [
    box(0, 0.25, 0.05, w, 0.4, d - 0.1, FABRIC), box(0, h / 2 + 0.1, -d / 2 + 0.1, w, h - 0.2, 0.2, FABRIC),
    box(-w / 2 + 0.1, 0.4, 0.05, 0.2, 0.5, d - 0.1, FABRIC), box(w / 2 - 0.1, 0.4, 0.05, 0.2, 0.5, d - 0.1, FABRIC)]],
  armchair: ['Armchair', 'Living', (w, h, d) => [
    box(0, 0.25, 0.05, w, 0.4, d - 0.1, RED), box(0, h / 2 + 0.1, -d / 2 + 0.1, w, h - 0.2, 0.2, RED),
    box(-w / 2 + 0.08, 0.4, 0.05, 0.16, 0.45, d - 0.1, RED), box(w / 2 - 0.08, 0.4, 0.05, 0.16, 0.45, d - 0.1, RED)]],
  coffee_table: ['Coffee table', 'Living', (w, h, d) => [box(0, h - 0.03, 0, w, 0.06, d, WOOD), box(0, h / 2, 0, w - 0.1, h - 0.06, d - 0.1, DARK)]],
  tv_stand: ['Media console', 'Living', (w, _h, d) => [box(0, 0.25, 0, w, 0.5, d, DARK), box(0, 0.85, 0, w * 0.8, 0.6, 0.05, BLACK)]],
  dining_table: ['Dining table', 'Dining', (w, h, d) => [box(0, h - 0.03, 0, w, 0.05, d, WOOD), box(0, h / 2 - 0.03, 0, w * 0.6, h - 0.06, 0.12, DARK)]],
  long_table: ['Banquet table', 'Dining', (w, h, d) => [box(0, h - 0.03, 0, w, 0.05, d, DARK), box(0, h - 0.0, 0, w - 0.4, 0.01, 0.4, WHITE), box(-w / 3, h / 2, 0, 0.12, h, d * 0.6, DARK), box(w / 3, h / 2, 0, 0.12, h, d * 0.6, DARK), cyl(0, h + 0.2, 0, 0.1, 0.4, GOLD)]],
  dining_chair: ['Dining chair', 'Dining', (w, h, d) => [box(0, 0.45, 0, w, 0.05, d, WOOD), box(0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.02, w, h - 0.45, 0.04, WOOD), box(0, 0.22, 0, w - 0.08, 0.44, d - 0.08, DARK)]],
  counter: ['Kitchen counter', 'Kitchen', (w, h, d) => [box(0, h / 2, 0, w, h - 0.04, d, WHITE), box(0, h - 0.02, 0, w, 0.04, d + 0.02, '#575a5e'), box(w / 4, h + 0.0, 0.02, 0.5, 0.01, 0.35, STEEL), box(0, h + 0.55, -d / 2 + 0.17, w, 0.7, 0.34, WHITE)]],
  fridge: ['Refrigerator', 'Kitchen', (w, h, d) => [box(0, h / 2, 0, w, h, d, STEEL), box(w / 2 - 0.08, h * 0.6, d / 2 + 0.02, 0.03, 0.5, 0.03, BLACK)]],
  island: ['Kitchen island', 'Kitchen', (w, h, d) => [box(0, h / 2, 0, w - 0.1, h - 0.04, d - 0.2, WOOD), box(0, h - 0.02, 0, w, 0.04, d, WHITE)]],
  toilet: ['Toilet', 'Bath', (w, _h, d) => [box(0, 0.6, -d / 2 + 0.09, w, 0.4, 0.18, WHITE), cyl(0, 0.2, 0.08, w * 0.9, 0.4, WHITE)]],
  bathtub: ['Bathtub', 'Bath', (w, h, d) => [box(0, h / 2, 0, w, h, d, WHITE), box(0, h - 0.04, 0, w - 0.12, 0.02, d - 0.12, '#b8dbe6')]],
  sink: ['Vanity sink', 'Bath', (w, h, d) => [box(0, h / 2 - 0.05, 0, w, h - 0.1, d, WOOD), box(0, h - 0.05, 0, w, 0.1, d, WHITE), box(0, h + 0.45, -d / 2 + 0.02, w * 0.8, 0.6, 0.02, '#cfe3ea')]],
  shower: ['Shower', 'Bath', (w, h, d) => [box(0, 0.05, 0, w, 0.1, d, WHITE), box(0, h / 2, d / 2 - 0.01, w, h, 0.02, '#cfe6ee'), box(w / 2 - 0.01, h / 2, 0, 0.02, h, d, '#cfe6ee'), cyl(0, h - 0.1, -d / 2 + 0.2, 0.2, 0.03, STEEL)]],
  bookshelf: ['Bookshelf', 'Office', (w, h, d) => {
    const parts = [box(0, h / 2, 0, w, h, d, DARK)];
    const cols = ['#9c3d3d', '#3d6b9c', '#c9a94a', '#5a8a4a', '#7a4a8a'];
    for (let i = 0; i < 5; i++) parts.push(box(0, 0.25 + i * 0.38, 0.03, w - 0.08, 0.28, d - 0.08, cols[i]));
    return parts;
  }],
  piano: ['Grand piano', 'Music', (w, h, d) => [box(0, h - 0.2, 0, w, 0.32, d, BLACK), box(0, 0.35, -d / 2 + 0.2, 0.08, 0.7, 0.08, BLACK), box(-w / 3, 0.35, d / 3, 0.08, 0.7, 0.08, BLACK), box(w / 3, 0.35, d / 3, 0.08, 0.7, 0.08, BLACK), box(0, h - 0.05, d / 2 + 0.05, w * 0.8, 0.04, 0.12, WHITE)]],
  plant: ['Potted plant', 'Decor', (w, h) => [cyl(0, 0.2, 0, w * 0.7, 0.4, '#a0613b'), ball(0, h - w / 2, 0, w / 2, GREEN), ball(0.08, h - w, 0.05, w / 2.5, GREEN)]],
  rug: ['Rug', 'Decor', (w, h, d) => [box(0, h / 2 + 0.005, 0, w, 0.012, d, '#9a6a5a')]],
  car: ['Car', 'Garage', (w, h, d) => [box(0, 0.5, 0, w, 0.55, d, '#3c6e91'), box(0, 1.0, -0.2, w - 0.15, h - 0.95, d * 0.5, '#2b4f69'), cyl(-w / 2 + 0.1, 0.32, d / 3, 0.64, 0.2, BLACK), cyl(w / 2 - 0.1, 0.32, d / 3, 0.64, 0.2, BLACK), cyl(-w / 2 + 0.1, 0.32, -d / 3, 0.64, 0.2, BLACK), cyl(w / 2 - 0.1, 0.32, -d / 3, 0.64, 0.2, BLACK)]],
  washer: ['Washer', 'Laundry', (w, h, d) => [box(0, h / 2, 0, w, h, d, WHITE), cyl(0, h / 2, d / 2, 0.4, 0.02, '#9fb7c4')]],
  statue: ['Statue', 'Decor', (w, h, d) => [box(0, 0.5, 0, w, 1.0, d, '#e8e4dc'), cyl(0, 1.3, 0, w * 0.45, 0.6, '#f1eee8'), ball(0, h - 0.25, 0, 0.2, '#f1eee8')]],
  bench: ['Bench', 'Decor', (w, h, d) => [box(0, h - 0.04, 0, w, 0.08, d, WOOD), box(-w / 2 + 0.1, h / 2 - 0.04, 0, 0.08, h - 0.08, d, DARK), box(w / 2 - 0.1, h / 2 - 0.04, 0, 0.08, h - 0.08, d, DARK)]],
  console: ['Console table', 'Decor', (w, h, d) => [box(0, h - 0.03, 0, w, 0.05, d, WOOD), box(0, h / 2, 0, w - 0.1, h - 0.06, d - 0.1, DARK), cyl(w / 4, h + 0.2, 0, 0.16, 0.4, GOLD)]],
  sideboard: ['Sideboard', 'Dining', (w, h, d) => [box(0, h / 2, 0, w, h, d, DARK), cyl(-w / 4, h + 0.15, 0, 0.12, 0.3, GOLD), cyl(w / 4, h + 0.15, 0, 0.12, 0.3, GOLD)]],
  fireplace: ['Fireplace', 'Living', (w, h, d) => [box(0, h / 2, 0, w, h, d, '#d9d3c7'), box(0, 0.4, d / 2 - 0.05, w * 0.5, 0.6, 0.12, BLACK), box(0, h + 0.02, 0, w + 0.1, 0.06, d + 0.06, '#efebe2')]],
  harp: ['Harp', 'Music', (w, h, d) => [box(0, 0.1, 0, w, 0.2, d, GOLD), box(0, h / 2, -d / 3, 0.12, h, 0.12, GOLD), box(0, h - 0.1, 0, 0.1, 0.12, d, GOLD), box(0, h / 2, 0.05, 0.02, h - 0.4, d * 0.5, '#f1e7c7')]],
  chandelier: ['Chandelier', 'Decor', (w, _h) => [ball(0, 3.3, 0, w / 2.5, '#fff2c4'), cyl(0, 3.9, 0, 0.04, 0.8, GOLD), cyl(0, 3.1, 0, w, 0.06, GOLD)]],
  lounger: ['Sun lounger', 'Outdoor', (w, _h, d) => [box(0, 0.3, 0.1, w, 0.08, d - 0.3, WHITE), box(0, 0.45, -d / 2 + 0.2, w, 0.08, 0.5, WHITE)]],
};

/** Extra placeable items (not used by v1 generators): dims in cm like the frozen table. */
const EXTRA_DIMS: Record<string, [number, number, number]> = {
  rocking_chair: [75, 85, 100], folding_screen: [130, 40, 160], horse_statue: [60, 45, 150], marble_bust: [50, 50, 160],
  mantel_clock: [50, 40, 115], lantern: [40, 40, 120], mirror: [70, 12, 180], gargoyle: [160, 160, 180],
  globe: [60, 60, 110], lamp: [40, 40, 160], clock: [50, 35, 210], urn: [60, 60, 100], crystal: [50, 50, 60],
  telescope: [70, 70, 150], easel: [70, 60, 170], skeleton: [50, 40, 170], suit_armor: [60, 50, 190], cauldron: [80, 80, 70],
};
const PLINTH = (w: number, h: number, d: number, top: Builder): Part[] => [box(0, h / 2, 0, w, h, d, '#e3ddd1'), ...top(w, h, d).map((p) => ({ ...p, p: [p.p[0], p.p[1] + h, p.p[2]] as [number, number, number] }))];
const EXTRA_BUILDERS: Record<string, [string, string, Builder]> = {
  rocking_chair: ['Rocking chair', 'Living', (w, h, d) => [box(0, 0.45, 0, w, 0.06, d, WOOD), box(0, 0.75, -d / 2 + 0.05, w, h - 0.5, 0.05, WOOD), box(-w / 2, 0.1, 0, 0.04, 0.06, d + 0.2, DARK), box(w / 2, 0.1, 0, 0.04, 0.06, d + 0.2, DARK)]],
  folding_screen: ['Folding screen', 'Decor', (w, h, d) => [box(-w / 3, h / 2, 0, w / 3, h, 0.03, RED), box(0, h / 2, d / 3, w / 3, h, 0.03, GOLD), box(w / 3, h / 2, 0, w / 3, h, 0.03, RED)]],
  horse_statue: ['Bronze horse', 'Curiosities', (w, _h, d) => PLINTH(w * 0.8, 1.0, d * 0.8, () => [box(0, 0.25, 0, 0.4, 0.3, 0.15, '#7a5a2e'), ball(0.2, 0.45, 0, 0.1, '#7a5a2e')])],
  marble_bust: ['Marble bust', 'Curiosities', (w, _h, d) => PLINTH(w * 0.8, 1.05, d * 0.8, () => [box(0, 0.12, 0, 0.3, 0.24, 0.18, WHITE), ball(0, 0.38, 0, 0.13, WHITE)])],
  mantel_clock: ['Mantel clock', 'Curiosities', (w, _h, d) => PLINTH(w * 0.8, 0.9, d * 0.8, () => [box(0, 0.12, 0, 0.32, 0.24, 0.12, DARK), cyl(0, 0.14, 0.07, 0.14, 0.01, WHITE)])],
  lantern: ['Lantern', 'Curiosities', (w, _h, d) => PLINTH(w * 0.8, 0.9, d * 0.8, () => [box(0, 0.14, 0, 0.12, 0.26, 0.12, '#f4d27a')])],
  mirror: ['Ornate mirror', 'Curiosities', (w, h, d) => [box(0, h / 2 + 0.4, 0, w, h - 0.8, d, GOLD), box(0, h / 2 + 0.4, d / 2, w - 0.1, h - 0.9, 0.01, '#d7e6ec')]],
  gargoyle: ['Gothic statue', 'Curiosities', (w, h, d) => [box(0, 0.25, 0, w, 0.5, d, '#8c877c'), box(0, 0.5 + (h - 0.5) / 2, 0, w * 0.5, h - 0.5, d * 0.5, '#8c877c')]],
  globe: ['Globe', 'Memory props', (w, h) => [cyl(0, 0.4, 0, 0.12, 0.8, WOOD), ball(0, h - w / 2, 0, w / 2, '#5b8fb9')]],
  lamp: ['Floor lamp', 'Decor', (w, h) => [cyl(0, 0.02, 0, w * 0.7, 0.04, BLACK), cyl(0, h / 2, 0, 0.03, h, BLACK), cyl(0, h - 0.15, 0, w, 0.3, '#f6e8c2')]],
  clock: ['Grandfather clock', 'Memory props', (w, h, d) => [box(0, h / 2, 0, w, h, d, DARK), cyl(0, h - 0.4, d / 2, 0.36, 0.02, WHITE)]],
  urn: ['Urn', 'Memory props', (w, h) => [cyl(0, h / 2, 0, w, h, '#4f7f8a'), ball(0, h, 0, w / 3, '#4f7f8a')]],
  crystal: ['Crystal ball', 'Memory props', (w, h) => [cyl(0, 0.1, 0, w * 0.6, 0.2, GOLD), ball(0, h - w / 2, 0, w / 2, '#b9a7ff')]],
  telescope: ['Telescope', 'Memory props', (_w, h) => [cyl(0, h / 3, 0, 0.06, h * 0.66, BLACK), box(0, h - 0.2, 0.1, 0.16, 0.16, 0.9, GOLD)]],
  easel: ['Easel', 'Memory props', (w, h) => [box(0, h / 2, 0, 0.05, h, 0.05, WOOD), box(0, h * 0.6, 0.06, w, w * 0.8, 0.03, WHITE)]],
  skeleton: ['Skeleton', 'Memory props', (_w, h) => [cyl(0, h * 0.35, 0, 0.06, h * 0.7, WHITE), box(0, h * 0.65, 0, 0.36, 0.3, 0.12, WHITE), ball(0, h - 0.12, 0, 0.12, WHITE)]],
  suit_armor: ['Suit of armor', 'Memory props', (w, h, d) => [box(0, h * 0.3, 0, w * 0.6, h * 0.6, d * 0.6, STEEL), box(0, h * 0.72, 0, w, h * 0.3, d * 0.8, STEEL), ball(0, h - 0.13, 0, 0.14, STEEL)]],
  cauldron: ['Cauldron', 'Memory props', (w, h) => [ball(0, h / 2, 0, w / 2, BLACK), cyl(0, h - 0.05, 0, w * 0.8, 0.04, '#5fae4f')]],
};

export const CATALOG: Record<string, CatalogItem> = {};
for (const [id, [label, group, build]] of Object.entries(BUILDERS)) {
  const dims = FURN_DIMS_V1[id];
  CATALOG[id] = { id, label, group, dims, parts: build(dims[0] / 100, dims[2] / 100, dims[1] / 100) };
}
for (const [id, [label, group, build]] of Object.entries(EXTRA_BUILDERS)) {
  const dims = EXTRA_DIMS[id];
  CATALOG[id] = { id, label, group, dims, parts: build(dims[0] / 100, dims[2] / 100, dims[1] / 100) };
}

export const CATALOG_GROUPS = [...new Set(Object.values(CATALOG).map((c) => c.group))];

/**
 * Detailed CC0 models from Poly Haven (polyhaven.com), optimized into public/models.
 * Each model is fitted inside the item's footprint, so frozen generator layouts never change.
 *  rot: turn (deg) so the model's front faces +z and its long side runs along x.
 *  pedestal: draw a plinth this tall and set the model on top.
 *  stretch: scale height freely to the item height (e.g. a cabinet used as a wardrobe).
 */
export interface ModelSpec { file: string; rot?: number; pedestal?: number; stretch?: boolean; lift?: number }
export const MODELS: Record<string, ModelSpec> = {
  sofa: { file: 'sofa_02' },
  armchair: { file: 'ArmChair_01' },
  coffee_table: { file: 'modern_coffee_table_01', rot: 90 },
  nightstand: { file: 'ClassicNightstand_01' },
  wardrobe: { file: 'painted_wooden_cabinet', stretch: true },
  desk: { file: 'gallinera_table' },
  chair: { file: 'dining_chair_02' },
  dining_chair: { file: 'dining_chair_02' },
  dining_table: { file: 'wooden_table_02' },
  long_table: { file: 'painted_wooden_table' },
  bookshelf: { file: 'wooden_bookshelf_worn' },
  console: { file: 'ClassicConsole_01' },
  sideboard: { file: 'GothicCommode_01' },
  bed_double: { file: 'GothicBed_01' },
  bed_single: { file: 'vintage_day_bed', rot: 90 },
  bench: { file: 'painted_wooden_bench' },
  statue: { file: 'marble_bust_01', pedestal: 1.3 },
  rocking_chair: { file: 'Rockingchair_01' },
  folding_screen: { file: 'chinese_screen_panels' },
  horse_statue: { file: 'horse_statue_01', pedestal: 1.0 },
  marble_bust: { file: 'marble_bust_01', pedestal: 1.05 },
  mantel_clock: { file: 'mantel_clock_01', pedestal: 0.9 },
  lantern: { file: 'Lantern_01', pedestal: 0.9 },
  mirror: { file: 'ornate_mirror_01', lift: 0.5 },
  gargoyle: { file: 'gothic_statue' },
};
export const modelUrl = (file: string) => `${import.meta.env.BASE_URL}models/${file}.glb`;
