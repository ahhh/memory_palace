import { ID_PREFIX, type CollectionKey, type Id, type PalaceDoc } from './schema';

/** Allocate a new id for `kind`. Mutates doc.nextId (use inside an immer draft or a fresh doc). */
export function newId(doc: { nextId: number }, kind: CollectionKey): Id {
  const n = doc.nextId++;
  return ID_PREFIX[kind] + n.toString(36);
}

export const idNum = (id: Id): number => parseInt(id.slice(1), 36);
export const idFromNum = (kind: CollectionKey, n: number): Id => ID_PREFIX[kind] + n.toString(36);

/** Ids of a collection sorted by allocation order — the canonical iteration order. */
export function sortedIds<T>(rec: Record<Id, T>): Id[] {
  return Object.keys(rec).sort((a, b) => idNum(a) - idNum(b));
}

export function kindOfId(doc: PalaceDoc, id: Id): CollectionKey | null {
  for (const k of Object.keys(ID_PREFIX) as CollectionKey[]) {
    if (ID_PREFIX[k] === id[0] && (doc[k] as Record<Id, unknown>)[id]) return k;
  }
  return null;
}
