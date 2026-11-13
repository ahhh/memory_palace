/**
 * FROZEN once deployed. Condo v2: the seed picks one of several real apartment types
 * (unless `plan` is given), builds it, and may mirror it left-to-right.
 */
import type { PalaceDoc, Recipe } from '../../../model/schema';
import { type Rng, makeRng } from '../../_lib/v1/rng';
import { type PlanInfo, choosePlan, mirrorDocX, outside } from '../../_lib/v2/variety';
import { linear } from './linear';
import { classicsix, loft, railroad } from './plans';

export const PARAMS = {
  plan: ['linear', 'railroad', 'classicsix', 'loft'],
  bedrooms: ['0', '1', '2', '3'],
  corner: ['0', '1'],
};

type P = Record<string, string>;
const sym = (p: P) => p.symmetric === '1';
const PLANS: PlanInfo[] = [
  { id: 'linear', weight: 3, fits: () => true },
  { id: 'railroad', weight: 2, fits: (p) => !outside(p, 'bedrooms', 1, 3) },
  { id: 'classicsix', weight: 2, fits: (p) => !outside(p, 'bedrooms', 2, 3) && !sym(p) },
  { id: 'loft', weight: 2, fits: (p) => !outside(p, 'bedrooms', 0, 1) && !sym(p) },
];
const BUILD: Record<string, (r: Recipe, rng: Rng) => PalaceDoc> = { linear, railroad, classicsix, loft };

export const SYMMETRIC_PLANS = ['linear', 'railroad'];

export function generate(recipe: Recipe): PalaceDoc {
  const rng = makeRng('condo/2/' + recipe.seed);
  const plan = choosePlan(PLANS, recipe.params, rng.fork('plan'));
  const doc = BUILD[plan](recipe, rng.fork(plan));
  if (rng.fork('mirror').chance(0.5)) mirrorDocX(doc);
  return doc;
}
