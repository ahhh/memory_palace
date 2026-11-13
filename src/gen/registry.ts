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

export function generate(r: Recipe): PalaceDoc {
  const g = GENERATORS[r.style]?.[r.ver];
  if (!g) throw new Error(`No generator ${r.style}@${r.ver}`);
  return g.generate({ ...r, params: { ...r.params } });
}

export function paramsFor(style: StyleId): Record<string, string[]> {
  return GENERATORS[style]?.[LATEST[style]!]?.PARAMS ?? {};
}
