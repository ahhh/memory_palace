/** Local library of palaces in localStorage. Each entry stores its share code. */
import type { PalaceDoc } from '../model/schema';
import { decodeShare, encodeShare } from '../share/codec';

export interface LibraryEntry { id: string; name: string; style: string; updatedAt: number; anchors: number; size: number }

const INDEX = 'mp:index:v1';
const KEY = (id: string) => `mp:p:${id}`;
const LAST = 'mp:last:v1';

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string): boolean {
  try { localStorage.setItem(k, v); return true; } catch { return false; }
}

export function listLibrary(): LibraryEntry[] {
  try {
    const arr = JSON.parse(safeGet(INDEX) ?? '[]') as LibraryEntry[];
    return arr.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function newLibraryId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export async function saveToLibrary(id: string, doc: PalaceDoc): Promise<boolean> {
  const code = await encodeShare(doc);
  if (!safeSet(KEY(id), code)) return false;
  const entry: LibraryEntry = {
    id, name: doc.meta.name, style: doc.meta.style, updatedAt: Date.now(),
    anchors: doc.journey.length, size: code.length,
  };
  const rest = listLibrary().filter((e) => e.id !== id);
  safeSet(INDEX, JSON.stringify([entry, ...rest]));
  safeSet(LAST, id);
  return true;
}

export async function loadFromLibrary(id: string): Promise<PalaceDoc | null> {
  const code = safeGet(KEY(id));
  if (!code) return null;
  try {
    const doc = await decodeShare(code);
    safeSet(LAST, id);
    return doc;
  } catch {
    return null;
  }
}

export function deleteFromLibrary(id: string) {
  try {
    localStorage.removeItem(KEY(id));
    safeSet(INDEX, JSON.stringify(listLibrary().filter((e) => e.id !== id)));
  } catch { /* ignore */ }
}

export const lastOpened = () => safeGet(LAST);
