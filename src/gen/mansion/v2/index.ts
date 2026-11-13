/**
 * FROZEN once deployed. Mansion v2: the seed picks one of several real great-house types
 * (unless `plan` is given), builds it, and may mirror it left-to-right.
 */
import type { PalaceDoc, Recipe } from '../../../model/schema';
import { type Rng, makeRng } from '../../_lib/v1/rng';
import { type PlanInfo, choosePlan, mirrorDocX } from '../../_lib/v2/variety';
import { palladian } from './palladian';
import { elizabethan, rotonda, siheyuan } from './plans';

export const PARAMS = {
  plan: ['palladian', 'rotonda', 'elizabethan', 'siheyuan'],
  floors: ['2', '3'],
  court: ['0', '1'],
};

const PLANS: PlanInfo[] = [
  { id: 'palladian', weight: 3, fits: () => true },
  { id: 'rotonda', weight: 2, fits: (p) => p.court !== '1' && p.symmetric !== '0' },
  { id: 'elizabethan', weight: 2, fits: (p) => p.court !== '1' },
  // A single-storey compound; its courtyard is the "court".
  { id: 'siheyuan', weight: 2, fits: (p) => !p.floors && p.court !== '0' },
];
const BUILD: Record<string, (r: Recipe, rng: Rng) => PalaceDoc> = { palladian, rotonda, elizabethan, siheyuan };

/** Plans that can be built mirror-symmetric (rotonda always is). */
export const SYMMETRIC_PLANS = ['palladian', 'rotonda', 'elizabethan', 'siheyuan'];

export function generate(recipe: Recipe): PalaceDoc {
  const rng = makeRng('mansion/2/' + recipe.seed);
  const plan = choosePlan(PLANS, recipe.params, rng.fork('plan'));
  const doc = BUILD[plan](recipe, rng.fork(plan));
  if (rng.fork('mirror').chance(0.5)) mirrorDocX(doc);
  return doc;
}
