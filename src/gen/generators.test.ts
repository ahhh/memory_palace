import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GENERATORS, generate } from './registry';
import type { StyleId } from '../model/schema';
import { unreachableRooms, validate } from '../model/validate';
import { docHash } from '../share/hash';
import { deepEqual } from '../share/deepEqual';
import { suggestJourney } from '../journey/suggest';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/hashes.json', import.meta.url));
import { PARAM_SETS, SEEDS, fixtureKey as key, fixtureRecipes as recipes } from './fixtureRecipes';

describe('generators', () => {
  const all = recipes();

  it('are deterministic within a run', () => {
    for (const r of all.filter((_, i) => i % 5 === 0)) expect(deepEqual(generate(r), generate(r))).toBe(true);
  });

  it('match frozen fixture hashes (old share links must regenerate identically)', () => {
    const hashes: Record<string, string> = {};
    for (const r of all) hashes[key(r)] = docHash(generate(r));
    if (process.env.UPDATE_GEN_FIXTURES || !existsSync(FIXTURES)) {
      // Only add entries for versions not yet recorded; never rewrite frozen ones.
      const prev: Record<string, string> = existsSync(FIXTURES) ? JSON.parse(readFileSync(FIXTURES, 'utf8')) : {};
      writeFileSync(FIXTURES, JSON.stringify({ ...hashes, ...(process.env.UPDATE_GEN_FIXTURES === 'force' ? {} : prev) }, null, 1) + '\n');
    }
    const fixed: Record<string, string> = JSON.parse(readFileSync(FIXTURES, 'utf8'));
    const mismatched = Object.keys(fixed).filter((k) => hashes[k] !== undefined && hashes[k] !== fixed[k]);
    expect(mismatched).toEqual([]);
  });

  it.each(all.map((r) => [key(r), r] as const))('%s is valid and fully reachable', (_k, r) => {
    const doc = generate(r);
    expect(validate(doc)).toEqual([]);
    expect(unreachableRooms(doc).map((id) => doc.rooms[id].label)).toEqual([]);
    expect(Object.keys(doc.rooms).length).toBeGreaterThan(2);
    for (const v of JSON.stringify(doc).match(/-?\d+\.\d+/g) ?? []) expect(Number(v)).toBe(Math.round(Number(v) * 100) / 100);
  });

  it('suggests a journey through every generated style', () => {
    for (const style of Object.keys(GENERATORS) as StyleId[]) {
      const doc = generate({ style, ver: 1, seed: 'journey', params: PARAM_SETS[style][0] });
      const j = suggestJourney(doc);
      expect(j.length).toBeGreaterThan(3);
      expect(new Set(j.map((a) => a.room)).size).toBeGreaterThan(Math.min(5, Object.keys(doc.rooms).length / 2));
    }
  });
});

describe('generator options', () => {
  const extWalls = (style: StyleId, params: Record<string, string>, seed: string) => {
    const doc = generate({ style, ver: 1, seed, params });
    const ground = Object.values(doc.levels).find((l) => l.index === 0)!;
    return Object.values(doc.walls).filter((w) => w.level === ground.id && w.exterior)
      .map((w) => [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0]), Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])]);
  };
  /** Every exterior wall has a mirror twin across the vertical axis through the house. */
  const isMirrorSymmetric = (walls: number[][]) => {
    const minX = Math.min(...walls.map((w) => w[0])), maxX = Math.max(...walls.map((w) => w[1]));
    const axis2 = minX + maxX;
    const key = (w: number[]) => w.map((v) => Math.round(v * 100)).join(',');
    const set = new Set(walls.map(key));
    return walls.every((w) => set.has(key([axis2 - w[1], axis2 - w[0], w[2], w[3]])));
  };

  it.each([
    ['family', { symmetric: '1' }], ['family', { symmetric: '1', floors: '1' }],
    ['condo', { symmetric: '1' }], ['condo', { symmetric: '1', bedrooms: '0' }],
    ['prairie', { symmetric: '1' }], ['mansion', {}],
  ] as const)('%s %j has a mirror-symmetric outline for every seed', (style, params) => {
    for (const seed of SEEDS) expect(isMirrorSymmetric(extWalls(style, params, seed))).toBe(true);
  });

  it('symmetric=0 makes mansions asymmetric', () => {
    expect(SEEDS.every((seed) => !isMirrorSymmetric(extWalls('mansion', { symmetric: '0' }, seed)))).toBe(true);
  });

  it('furniture=0 builds the bare architecture', () => {
    for (const style of Object.keys(GENERATORS) as StyleId[]) {
      const bare = generate({ style, ver: 1, seed: 'bare', params: { furniture: '0' } });
      const full = generate({ style, ver: 1, seed: 'bare', params: {} });
      expect(Object.keys(bare.furniture)).toHaveLength(0);
      expect(Object.keys(full.furniture).length).toBeGreaterThan(0);
      expect(Object.keys(bare.walls)).toEqual(Object.keys(full.walls));
    }
  });
});
