import { COLLECTIONS, type CollectionKey, type Id, type PalaceDoc } from '../model/schema';
import { idFromNum, idNum, sortedIds } from '../model/ids';
import { deepEqual } from './deepEqual';
import { packEntity, packMeta, packSite, unpackEntity, unpackMeta, unpackSite } from './pack';

/**
 * Structural diff by entity id against a regenerated base. Size depends on how much
 * differs, not on edit history. Adds and modifications are both "upserts".
 */
export function diffPacked(base: PalaceDoc, doc: PalaceDoc): unknown[] {
  const cols: unknown[] = COLLECTIONS.map((k) => {
    const b = base[k] as Record<Id, unknown>, d = doc[k] as Record<Id, unknown>;
    const up = sortedIds(d).filter((id) => !deepEqual(b[id], d[id])).map((id) => packEntity(k, d[id] as Record<string, unknown>));
    const del = sortedIds(b).filter((id) => !(id in d)).map(idNum);
    return up.length || del.length ? [up, del] : 0;
  });
  while (cols.length && cols[cols.length - 1] === 0) cols.pop();
  return [
    1,
    doc.nextId,
    deepEqual(base.meta, doc.meta) ? 0 : packMeta(doc.meta),
    deepEqual(base.site, doc.site) ? 0 : packSite(doc.site),
    cols,
    doc.journey.map(idNum),
  ];
}

export function applyPacked(base: PalaceDoc, t: unknown[]): PalaceDoc {
  if (t[0] !== 1) throw new Error('Unsupported delta version');
  const doc: PalaceDoc = structuredClone(base);
  doc.nextId = t[1] as number;
  if (t[2]) doc.meta = unpackMeta(t[2] as unknown[]);
  if (t[3]) doc.site = unpackSite(t[3] as unknown[]);
  (t[4] as unknown[]).forEach((c, i) => {
    if (!c) return;
    const k: CollectionKey = COLLECTIONS[i];
    const rec = doc[k] as Record<Id, unknown>;
    const [up, del] = c as [unknown[][], number[]];
    for (const n of del) delete rec[idFromNum(k, n)];
    for (const tuple of up) {
      const e = unpackEntity(k, tuple);
      rec[e.id as string] = e;
    }
  });
  doc.journey = (t[5] as number[]).map((n) => idFromNum('anchors', n));
  return doc;
}

export function docsEqual(a: PalaceDoc, b: PalaceDoc) {
  return deepEqual(a, b);
}
