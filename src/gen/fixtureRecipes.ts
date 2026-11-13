import type { Recipe, StyleId } from '../model/schema';
import { GENERATORS } from './registry';

export const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
export const PARAM_SETS: Record<StyleId, Record<string, string>[]> = {
  condo: [{}, { bedrooms: '0' }, { bedrooms: '3', corner: '1' }, { symmetric: '1' }, { symmetric: '1', bedrooms: '0', furniture: '0' }],
  family: [{}, { floors: '1', bedrooms: '3' }, { floors: '2', bedrooms: '5', garage: '1' }, { symmetric: '1' }, { symmetric: '1', floors: '1' }, { furniture: '0' }],
  prairie: [{ variant: 'robie' }, { variant: 'fallingwater' }, { variant: 'usonian' }, { symmetric: '1' }],
  mansion: [{}, { floors: '3', court: '1' }, { floors: '2', court: '0' }, { symmetric: '0' }, { symmetric: '0', floors: '3', court: '1' }],
};

/** v2 adds a set per plan; versions without an entry here use PARAM_SETS. */
export const PARAM_SETS_BY_VER: Partial<Record<StyleId, Record<number, Record<string, string>[]>>> = {
  condo: { 2: [{}, { plan: 'linear', symmetric: '1' }, { plan: 'railroad' }, { plan: 'classicsix', corner: '1' }, { plan: 'loft', bedrooms: '0' }, { bedrooms: '3' }] },
  family: { 2: [
    {}, { plan: 'colonial', floors: '1' }, { plan: 'foursquare', garage: '1' }, { plan: 'bungalow', bedrooms: '3' },
    { plan: 'ranch', bedrooms: '4' }, { plan: 'shotgun' }, { plan: 'shotgun', floors: '2', bedrooms: '4' },
    { plan: 'capecod', symmetric: '1' }, { plan: 'dogtrot' }, { floors: '1', furniture: '0' },
  ] },
  prairie: { 2: [{ variant: 'robie' }, { variant: 'fallingwater' }, { variant: 'usonian' }, { variant: 'willits' }, { symmetric: '1' }, {}] },
  mansion: { 2: [{}, { plan: 'palladian', floors: '3', court: '1' }, { plan: 'rotonda' }, { plan: 'elizabethan', floors: '3' }, { plan: 'elizabethan', symmetric: '0' }, { plan: 'siheyuan', symmetric: '0' }] },
};
export const paramSets = (style: StyleId, ver: number) => PARAM_SETS_BY_VER[style]?.[ver] ?? PARAM_SETS[style];

/** Every registered generator version × params × seeds: the frozen-output fixture set. */
export function fixtureRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const style of Object.keys(GENERATORS) as StyleId[]) {
    for (const ver of Object.keys(GENERATORS[style]!).map(Number)) {
      for (const params of paramSets(style, ver)) for (const seed of SEEDS) out.push({ style, ver, seed, params });
    }
  }
  return out;
}

export const fixtureKey = (r: Recipe) => `${r.style}@${r.ver}/${r.seed}/${JSON.stringify(r.params)}`;
