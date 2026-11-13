/**
 * FROZEN once deployed. Family home v2: the seed picks one of several real house types
 * (unless `plan` is given), builds it, and may mirror it left-to-right.
 */
import type { PalaceDoc, Recipe } from '../../../model/schema';
import { makeRng } from '../../_lib/v1/rng';
import { type PlanInfo, choosePlan, mirrorDocX, outside } from '../../_lib/v2/variety';
import { colonial } from './colonial';
import { bungalow, capecod, dogtrot, foursquare, ranch, shotgun } from './plans';

export const PARAMS = {
  plan: ['colonial', 'foursquare', 'bungalow', 'ranch', 'shotgun', 'capecod', 'dogtrot'],
  floors: ['1', '2'],
  bedrooms: ['2', '3', '4', '5'],
  garage: ['0', '1'],
};

type P = Record<string, string>;
const sym = (p: P) => p.symmetric === '1';
const PLANS: PlanInfo[] = [
  { id: 'colonial', weight: 3, fits: () => true },
  { id: 'foursquare', weight: 2, fits: (p) => p.floors !== '1' && !outside(p, 'bedrooms', 2, 3) && !sym(p) },
  { id: 'bungalow', weight: 2, fits: (p) => p.floors !== '2' && !outside(p, 'bedrooms', 2, 3) && !sym(p) },
  { id: 'ranch', weight: 2, fits: (p) => p.floors !== '2' && !outside(p, 'bedrooms', 2, 4) && !sym(p) },
  { id: 'shotgun', weight: 1, fits: (p) => p.garage !== '1' && !outside(p, 'bedrooms', 2, p.floors === '1' ? 3 : 4) },
  { id: 'capecod', weight: 2, fits: (p) => p.floors !== '1' && !outside(p, 'bedrooms', 2, 3) && !(sym(p) && p.garage === '1') },
  { id: 'dogtrot', weight: 1, fits: (p) => p.floors !== '2' && p.garage !== '1' && !outside(p, 'bedrooms', 2, 2) },
];

const BUILD: Record<string, (r: Recipe, rng: ReturnType<typeof makeRng>) => PalaceDoc> = {
  colonial, foursquare, bungalow, ranch, shotgun, capecod, dogtrot,
};

/** Plans that can be built mirror-symmetric. */
export const SYMMETRIC_PLANS = ['colonial', 'shotgun', 'capecod', 'dogtrot'];

export function generate(recipe: Recipe): PalaceDoc {
  const rng = makeRng('family/2/' + recipe.seed);
  const plan = choosePlan(PLANS, recipe.params, rng.fork('plan'));
  const doc = BUILD[plan](recipe, rng.fork(plan));
  if (rng.fork('mirror').chance(0.5)) mirrorDocX(doc);
  return doc;
}
