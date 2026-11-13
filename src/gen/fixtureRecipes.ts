import type { Recipe, StyleId } from '../model/schema';
import { GENERATORS } from './registry';

export const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
export const PARAM_SETS: Record<StyleId, Record<string, string>[]> = {
  condo: [{}, { bedrooms: '0' }, { bedrooms: '3', corner: '1' }, { symmetric: '1' }, { symmetric: '1', bedrooms: '0', furniture: '0' }],
  family: [{}, { floors: '1', bedrooms: '3' }, { floors: '2', bedrooms: '5', garage: '1' }, { symmetric: '1' }, { symmetric: '1', floors: '1' }, { furniture: '0' }],
  prairie: [{ variant: 'robie' }, { variant: 'fallingwater' }, { variant: 'usonian' }, { symmetric: '1' }],
  mansion: [{}, { floors: '3', court: '1' }, { floors: '2', court: '0' }, { symmetric: '0' }, { symmetric: '0', floors: '3', court: '1' }],
};

/** Every registered generator version × params × seeds: the frozen-output fixture set. */
export function fixtureRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const style of Object.keys(GENERATORS) as StyleId[]) {
    for (const ver of Object.keys(GENERATORS[style]!).map(Number)) {
      for (const params of PARAM_SETS[style]) for (const seed of SEEDS) out.push({ style, ver, seed, params });
    }
  }
  return out;
}

export const fixtureKey = (r: Recipe) => `${r.style}@${r.ver}/${r.seed}/${JSON.stringify(r.params)}`;
