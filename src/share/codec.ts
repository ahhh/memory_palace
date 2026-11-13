/**
 * Share codes, carried in location.hash as `#p=<code>` (never sent to a server).
 *
 *  r1.<recipe>                  unedited generated palace
 *  e1.<recipe>.<deflated delta> generated palace + edits/anchors
 *  d1.<deflated full doc>       anything (hand-drawn palaces)
 *
 * Every form that ever shipped must keep decoding: see __fixtures__/links.txt.
 */
import type { PalaceDoc } from '../model/schema';
import { generate } from '../gen/registry';
import { base64urlToBytes, bytesToBase64url } from './base64url';
import { deflateJson, inflateJson } from './deflate';
import { applyPacked, diffPacked, docsEqual } from './delta';
import { packDoc, unpackDoc } from './pack';
import { formatRecipe, parseRecipe } from './recipeString';
import { migrate } from '../model/migrate';

export async function encodeShare(doc: PalaceDoc): Promise<string> {
  const full = 'd1.' + bytesToBase64url(await deflateJson(packDoc(doc)));
  const origin = doc.meta.origin;
  if (!origin) return full;
  let base: PalaceDoc;
  try {
    base = generate(origin);
  } catch {
    return full;
  }
  const recipe = formatRecipe(origin);
  if (docsEqual(base, doc)) return 'r1.' + recipe;
  const delta = 'e1.' + recipe + '.' + bytesToBase64url(await deflateJson(diffPacked(base, doc)));
  return delta.length < full.length ? delta : full;
}

export async function decodeShare(code: string): Promise<PalaceDoc> {
  code = code.trim();
  if (code.startsWith('r1.')) return migrate(generate(parseRecipe(code.slice(3))));
  if (code.startsWith('e1.')) {
    const body = code.slice(3);
    const cut = body.lastIndexOf('.');
    const base = generate(parseRecipe(body.slice(0, cut)));
    return migrate(applyPacked(base, (await inflateJson(base64urlToBytes(body.slice(cut + 1)))) as unknown[]));
  }
  if (code.startsWith('d1.')) {
    return migrate(unpackDoc((await inflateJson(base64urlToBytes(code.slice(3)))) as unknown[]));
  }
  throw new Error('Unrecognized palace link');
}

export const SHARE_HASH_KEY = 'p';

export function readHashCode(hash = location.hash): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get(SHARE_HASH_KEY);
}

export function shareUrl(code: string): string {
  const base = location.href.split('#')[0];
  return `${base}#${SHARE_HASH_KEY}=${code}`;
}
