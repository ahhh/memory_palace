import type { PalaceDoc, Recipe, StyleId } from '../model/schema';
import * as condo1 from './condo/v1';
import * as condo2 from './condo/v2';
import * as family1 from './family/v1';
import * as family2 from './family/v2';
import * as mansion1 from './mansion/v1';
import * as mansion2 from './mansion/v2';
import * as prairie1 from './prairie/v1';
import * as prairie2 from './prairie/v2';

type Gen = { generate(r: Recipe): PalaceDoc; PARAMS: Record<string, string[]>; SYMMETRIC_PLANS?: string[] };

/**
 * Every generator version that ever shipped stays registered forever so old links
 * regenerate identically. New behavior → new version folder, bump LATEST.
 */
export const GENERATORS: Partial<Record<StyleId, Record<number, Gen>>> = {
  condo: { 1: condo1, 2: condo2 },
  family: { 1: family1, 2: family2 },
  mansion: { 1: mansion1, 2: mansion2 },
  prairie: { 1: prairie1, 2: prairie2 },
};

export const LATEST: Partial<Record<StyleId, number>> = { condo: 2, family: 2, mansion: 2, prairie: 2 };

/**
 * Options every style understands. FROZEN semantics, like the generators themselves:
 *  furniture=0  → generate the bare architecture (no furniture).
 *  symmetric=1/0 → mirror-symmetric plan and facade, or not. Styles without the param set
 *                  use their own default (SYMMETRIC_DEFAULT); prairie fallingwater/usonian/willits ignore it.
 * v2 styles also take plan=… (prairie: variant=…), a named historical house type; when it
 * is absent the seed picks one that suits the other explicit params.
 */
export const COMMON_PARAMS = { furniture: ['0', '1'], symmetric: ['0', '1'] };
export const SYMMETRIC_DEFAULT: Record<StyleId, boolean> = { condo: false, family: false, prairie: false, mansion: true };

export function generate(r: Recipe): PalaceDoc {
  const g = GENERATORS[r.style]?.[r.ver];
  if (!g) throw new Error(`No generator ${r.style}@${r.ver}`);
  const doc = g.generate({ ...r, params: { ...r.params } });
  if (r.params.furniture === '0') doc.furniture = {};
  return doc;
}

export function paramsFor(style: StyleId): Record<string, string[]> {
  return GENERATORS[style]?.[LATEST[style]!]?.PARAMS ?? {};
}

/** Does the symmetric option mean anything for these (explicitly chosen) params? */
export function symmetricApplies(style: StyleId, params: Record<string, string>): boolean {
  if (style === 'prairie') return !params.variant || params.variant === 'robie';
  const plans = GENERATORS[style]?.[LATEST[style]!]?.SYMMETRIC_PLANS;
  return !plans || !params.plan || plans.includes(params.plan);
}
