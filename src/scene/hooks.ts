import { useMemo } from 'react';
import type { Level, PalaceDoc, V2 } from '../model/schema';
import { useStore } from '../editor/store';
import { levelsSorted } from '../model/queries';
import { bbox } from '../model/geometry2d';
import { makeHeightFn } from '../geom/site';

export function useDoc() {
  return useStore((s) => s.doc);
}

export function useLevels(): Level[] {
  const levels = useStore((s) => s.doc.levels);
  return useMemo(() => Object.values(levels).sort((a, b) => a.index - b.index), [levels]);
}

export function useActiveLevel(): Level | undefined {
  const levels = useStore((s) => s.doc.levels);
  const id = useStore((s) => s.ui.activeLevel);
  return levels[id] ?? Object.values(levels).sort((a, b) => a.index - b.index)[0];
}

export function houseBounds(doc: PalaceDoc) {
  const pts: V2[] = [];
  for (const w of Object.values(doc.walls)) pts.push(w.a, w.b);
  for (const r of Object.values(doc.rooms)) pts.push(...r.polygon);
  if (!pts.length) return { x0: -5, z0: -5, x1: 5, z1: 5, cx: 0, cz: 0, size: 10, top: 3 };
  const b = bbox(pts);
  const top = Math.max(3, ...levelsSorted(doc).map((l) => l.elevation + l.height));
  return { ...b, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, size: Math.max(b.x1 - b.x0, b.z1 - b.z0, 6), top };
}

export function useBounds() {
  const walls = useStore((s) => s.doc.walls);
  const rooms = useStore((s) => s.doc.rooms);
  const levels = useStore((s) => s.doc.levels);
  return useMemo(() => houseBounds(useStore.getState().doc), [walls, rooms, levels]);
}

export function useHeightFn() {
  const doc = useStore((s) => s.doc);
  const key = [doc.site, doc.rivers, doc.ponds, doc.levels, doc.rooms, doc.walls, doc.slabs];
   
  return useMemo(() => makeHeightFn(useStore.getState().doc), key);
}
