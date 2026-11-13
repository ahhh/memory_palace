import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GENERATORS, generate } from './registry';
import type { Recipe, StyleId } from '../model/schema';
import { unreachableRooms, validate } from '../model/validate';
import { docHash } from '../share/hash';
import { deepEqual } from '../share/deepEqual';
import { suggestJourney } from '../journey/suggest';

const FIXTURES = fileURLToPath(new URL('./__fixtures__/hashes.json', import.meta.url));
const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const PARAM_SETS: Record<StyleId, Record<string, string>[]> = {
  condo: [{}, { bedrooms: '0' }, { bedrooms: '3', corner: '1' }],
  family: [{}, { floors: '1', bedrooms: '3' }, { floors: '2', bedrooms: '5', garage: '1' }],
  prairie: [{ variant: 'robie' }, { variant: 'fallingwater' }, { variant: 'usonian' }],
  mansion: [{}, { floors: '3', court: '1' }, { floors: '2', court: '0' }],
};

function recipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const style of Object.keys(GENERATORS) as StyleId[]) {
    for (const ver of Object.keys(GENERATORS[style]!).map(Number)) {
      for (const params of PARAM_SETS[style]) for (const seed of SEEDS) out.push({ style, ver, seed, params });
    }
  }
  return out;
}
const key = (r: Recipe) => `${r.style}@${r.ver}/${r.seed}/${JSON.stringify(r.params)}`;

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
