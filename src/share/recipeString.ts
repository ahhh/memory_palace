import type { Recipe, StyleId } from '../model/schema';

const STYLES: StyleId[] = ['condo', 'family', 'mansion', 'prairie'];

/** Seeds are restricted to URL-safe characters so recipes read nicely in links. */
export const sanitizeSeed = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'palace';
const sanitizeParam = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');

/** `family@1.oak-river-42` or `family@1.oak-river-42.floors=2,garage=1` */
export function formatRecipe(r: Recipe): string {
  const params = Object.keys(r.params).sort().map((k) => `${sanitizeParam(k)}=${sanitizeParam(r.params[k])}`).join(',');
  return `${r.style}@${r.ver}.${r.seed}${params ? '.' + params : ''}`;
}

export function parseRecipe(s: string): Recipe {
  const m = /^([a-z]+)@(\d+)\.([a-z0-9-]+)(?:\.([A-Za-z0-9_=,-]*))?$/.exec(s);
  if (!m || !STYLES.includes(m[1] as StyleId)) throw new Error(`Bad recipe: ${s}`);
  const params: Record<string, string> = {};
  if (m[4]) for (const kv of m[4].split(',')) {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) params[k] = v;
  }
  return { style: m[1] as StyleId, ver: Number(m[2]), seed: m[3], params };
}
