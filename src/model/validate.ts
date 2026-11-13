import type { Id, PalaceDoc } from './schema';
import { doorLinks, roomAt, wallLength } from './queries';
import { sortedIds } from './ids';
import { stairTargetLevel, stairTop } from './stairs';

/** Structural invariants. Returns human-readable problems (empty = valid). */
export function validate(doc: PalaceDoc): string[] {
  const errs: string[] = [];
  for (const w of Object.values(doc.walls)) {
    if (!doc.levels[w.level]) errs.push(`wall ${w.id}: bad level`);
    if (wallLength(w) < 0.05) errs.push(`wall ${w.id}: zero length`);
  }
  const byWall = new Map<Id, { a: number; b: number; id: Id }[]>();
  for (const o of Object.values(doc.openings)) {
    const w = doc.walls[o.wall];
    if (!w) { errs.push(`opening ${o.id}: bad wall`); continue; }
    const a = o.offset - o.width / 2, b = o.offset + o.width / 2;
    if (a < -1e-6 || b > wallLength(w) + 1e-6) errs.push(`opening ${o.id}: outside wall ${w.id}`);
    const arr = byWall.get(w.id) ?? [];
    for (const x of arr) if (a < x.b - 1e-6 && x.a < b - 1e-6) errs.push(`opening ${o.id} overlaps ${x.id}`);
    arr.push({ a, b, id: o.id });
    byWall.set(w.id, arr);
  }
  for (const k of ['rooms', 'slabs', 'roofs', 'stairs', 'masses', 'furniture', 'anchors'] as const) {
    for (const e of Object.values(doc[k]) as { id: Id; level: Id }[]) {
      if (!doc.levels[e.level]) errs.push(`${k} ${e.id}: bad level`);
    }
  }
  for (const a of doc.journey) if (!doc.anchors[a]) errs.push(`journey: missing anchor ${a}`);
  return errs;
}

/** Room ids not reachable from outside through doors and stairs. */
export function unreachableRooms(doc: PalaceDoc): Id[] {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
  };
  for (const d of doorLinks(doc)) link(d.a?.id ?? 'OUT', d.b?.id ?? 'OUT');
  for (const s of Object.values(doc.stairs)) {
    const bottom = roomAt(doc, s.level, s.start);
    const tl = stairTargetLevel(doc, s);
    const top = tl ? roomAt(doc, tl.id, stairTop(s)) : null;
    link(bottom?.id ?? 'OUT', top?.id ?? 'OUT');
  }
  const seen = new Set<string>(['OUT']);
  const q = ['OUT'];
  while (q.length) {
    const n = q.pop()!;
    for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); q.push(m); }
  }
  return sortedIds(doc.rooms).filter((id) => !seen.has(id));
}
