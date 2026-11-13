import type { PalaceDoc, Recipe, StyleId } from '../model/schema';
import * as condo1 from './condo/v1';
import * as family1 from './family/v1';
import * as mansion1 from './mansion/v1';
import * as prairie1 from './prairie/v1';

type Gen = { generate(r: Recipe): PalaceDoc; PARAMS: Record<string, string[]> };

/**
 * Every generator version that ever shipped stays registered forever so old links
 * regenerate identically. New behavior → new version folder, bump LATEST.
 */
export const GENERATORS: Partial<Record<StyleId, Record<number, Gen>>> = {
  condo: { 1: condo1 },
  family: { 1: family1 },
  mansion: { 1: mansion1 },
  prairie: { 1: prairie1 },
};

export const LATEST: Partial<Record<StyleId, number>> = { condo: 1, family: 1, mansion: 1, prairie: 1 };

/**
 * Options every style understands. FROZEN semantics, like the generators themselves:
 *  furniture=0  → generate the bare architecture (no furniture).
 *  symmetric=1/0 → mirror-symmetric plan and facade, or not. Styles without the param set
 *                  use their own default (SYMMETRIC_DEFAULT); prairie fallingwater/usonian ignore it.
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
