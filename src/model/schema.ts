/**
 * PalaceDoc — the single source of truth for a design.
 *
 * Conventions (relied on by the share codec — do not break):
 *  - Lengths are meters, always rounded to whole centimeters (see units.q).
 *  - Angles are integer degrees. 0° = +x, 90° = +z (plan "down"/front), etc.
 *  - Plan coordinates are V2 = [x, z]; y is up.
 *  - Ids are `<prefix><base36 counter>` drawn from doc.nextId. One prefix per kind.
 *  - Optional fields are omitted, never set to undefined.
 */
export const SCHEMA_VERSION = 1 as const;

export type Id = string;
export type V2 = [number, number];
export type V3 = [number, number, number];

export type StyleId = 'condo' | 'family' | 'mansion' | 'prairie';
export type DocStyle = StyleId | 'custom';

export interface Recipe {
  style: StyleId;
  ver: number;
  seed: string;
  /** Only explicitly chosen params; anything absent is chosen by the seed. */
  params: Record<string, string>;
}

export type RoomType =
  | 'living' | 'kitchen' | 'dining' | 'bedroom' | 'bath' | 'hall' | 'office' | 'garage'
  | 'library' | 'salon' | 'gallery' | 'ballroom' | 'laundry' | 'closet' | 'music' | 'other';

export type OpeningKind = 'door' | 'window' | 'arch';
export type RoofKind = 'flat' | 'hip' | 'gable';
export type SlabKind = 'terrace' | 'balcony' | 'path' | 'platform';
export type PlantKind = 'tree' | 'pine' | 'shrub' | 'hedge';

export interface Level { id: Id; index: number; elevation: number; height: number; name: string }

export interface Wall {
  id: Id; level: Id; a: V2; b: V2;
  thickness: number; height: number; exterior: boolean; material: string;
}

export interface Opening {
  id: Id; wall: Id; kind: OpeningKind;
  /** Distance from wall.a to the opening center, along the wall. */
  offset: number; width: number; height: number; sill: number;
}

export interface Room {
  id: Id; level: Id; polygon: V2[]; label: string; type: RoomType; floor: string;
  /** Floor voids (e.g. a double-height hall's gallery). Railings are drawn around them. */
  holes?: V2[][];
}

export interface Slab {
  id: Id; level: Id; polygon: V2[]; kind: SlabKind; thickness: number;
  /** Top of slab relative to the level elevation. */
  dy: number; railing: boolean; material: string;
}

export interface Roof {
  id: Id; level: Id; center: V2; size: V2; kind: RoofKind;
  pitch: number; overhang: number; eaveY: number; thickness: number; material: string;
}

export interface Stair {
  id: Id; level: Id;
  /** Center of the bottom edge of the stair footprint. */
  start: V2;
  /** Direction of ascent, degrees, one of 0/90/180/270. */
  dir: number;
  width: number; run: number;
  /** Signed vertical travel; negative stairs go down from the level. */
  rise: number;
}

export interface Mass { id: Id; level: Id; center: V2; size: V3; rot: number; dy: number; material: string }

export interface Furniture { id: Id; level: Id; cat: string; pos: V2; rot: number; dy?: number }

export interface Anchor {
  id: Id; level: Id;
  /** x, height above level floor, z */
  pos: V3;
  facing: number;
  title: string; note: string;
  room?: Id;
}

export interface River { id: Id; pts: V3[]; width: number; depth: number }
export interface Pond { id: Id; polygon: V2[]; y: number; depth: number; fountain: boolean }
export interface Plant { id: Id; kind: PlantKind; pos: V2; scale: number }

export interface Site {
  size: V2;
  ground: string;
  terrain: { baseY: number; amp: number; scale: number; seed: number };
}

export interface Meta { name: string; style: DocStyle; origin?: Recipe }

export interface PalaceDoc {
  schema: typeof SCHEMA_VERSION;
  nextId: number;
  meta: Meta;
  site: Site;
  levels: Record<Id, Level>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  rooms: Record<Id, Room>;
  slabs: Record<Id, Slab>;
  roofs: Record<Id, Roof>;
  stairs: Record<Id, Stair>;
  masses: Record<Id, Mass>;
  furniture: Record<Id, Furniture>;
  anchors: Record<Id, Anchor>;
  rivers: Record<Id, River>;
  ponds: Record<Id, Pond>;
  plants: Record<Id, Plant>;
  /** Ordered anchor ids: the walking route through the palace. */
  journey: Id[];
}

export type CollectionKey =
  | 'levels' | 'walls' | 'openings' | 'rooms' | 'slabs' | 'roofs' | 'stairs' | 'masses'
  | 'furniture' | 'anchors' | 'rivers' | 'ponds' | 'plants';

/** Stable order. Appending is fine; reordering breaks share links. */
export const COLLECTIONS: CollectionKey[] = [
  'levels', 'walls', 'openings', 'rooms', 'slabs', 'roofs', 'stairs', 'masses',
  'furniture', 'anchors', 'rivers', 'ponds', 'plants',
];

export const ID_PREFIX: Record<CollectionKey, string> = {
  levels: 'L', walls: 'w', openings: 'o', rooms: 'r', slabs: 's', roofs: 'f', stairs: 't',
  masses: 'm', furniture: 'u', anchors: 'a', rivers: 'v', ponds: 'p', plants: 'g',
};
