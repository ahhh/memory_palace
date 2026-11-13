import type { OpeningKind, PalaceDoc } from './schema';
import { SCHEMA_VERSION } from './schema';

export const WALL_EXT = 0.3;
export const WALL_INT = 0.12;
export const WALL_HEIGHT = 2.8;

export const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.3, sill: 0.9 },
  arch: { width: 1.6, height: 2.3, sill: 0 },
};

export const MATERIALS: Record<string, { color: string; label: string }> = {
  plaster: { color: '#ece6da', label: 'Plaster' },
  brick: { color: '#a95e44', label: 'Red brick' },
  roman: { color: '#b98a5e', label: 'Roman brick' },
  stone: { color: '#b9b2a3', label: 'Stone' },
  fieldstone: { color: '#8f8676', label: 'Fieldstone' },
  wood: { color: '#8a5a35', label: 'Wood' },
  cedar: { color: '#a5704a', label: 'Cedar' },
  concrete: { color: '#cfcac0', label: 'Concrete' },
  stucco: { color: '#e3d3b4', label: 'Stucco' },
  marble: { color: '#f2efe8', label: 'Marble' },
  siding: { color: '#dfe4e6', label: 'Siding' },
  slate: { color: '#4f5660', label: 'Slate' },
  copper: { color: '#5f8f7e', label: 'Copper' },
  shingle: { color: '#6b5e57', label: 'Shingle' },
  tile: { color: '#d9d4cb', label: 'Tile' },
  oak: { color: '#c19a6b', label: 'Oak floor' },
  carpet: { color: '#9aa3a8', label: 'Carpet' },
  parquet: { color: '#9c6b3f', label: 'Parquet' },
  flagstone: { color: '#a39b8b', label: 'Flagstone' },
  grass: { color: '#7d9b5a', label: 'Grass' },
  gravel: { color: '#bdb5a5', label: 'Gravel' },
  glass: { color: '#a9d2e3', label: 'Glass' },
  white: { color: '#f6f4ef', label: 'White' },
};
export const matColor = (m: string) => (MATERIALS[m] ?? MATERIALS.plaster).color;

export function emptyDoc(name = 'Untitled palace'): PalaceDoc {
  return {
    schema: SCHEMA_VERSION,
    nextId: 2,
    meta: { name, style: 'custom' },
    site: { size: [40, 40], ground: 'grass', terrain: { baseY: 0, amp: 0, scale: 20, seed: 1 } },
    levels: { L1: { id: 'L1', index: 0, elevation: 0, height: WALL_HEIGHT, name: 'Ground floor' } },
    walls: {}, openings: {}, rooms: {}, slabs: {}, roofs: {}, stairs: {}, masses: {},
    furniture: {}, anchors: {}, rivers: {}, ponds: {}, plants: {},
    journey: [],
  };
}
