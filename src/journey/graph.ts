import type { Id, PalaceDoc, V3 } from '../model/schema';
import { doorLinks, roomAt } from '../model/queries';
import { stairTargetLevel, stairTop } from '../model/stairs';

export const OUT = 'OUT';

export interface Edge { to: string; via: V3[] }

/** Room adjacency through doors and stairs. Waypoints are world positions at floor level. */
export function roomGraph(doc: PalaceDoc): Map<string, Edge[]> {
  const g = new Map<string, Edge[]>();
  const add = (a: string, b: string, via: V3[]) => {
    if (!g.has(a)) g.set(a, []);
    if (!g.has(b)) g.set(b, []);
    g.get(a)!.push({ to: b, via });
    g.get(b)!.push({ to: a, via: [...via].reverse() });
  };
  for (const d of doorLinks(doc)) {
    const y = doc.levels[d.wall.level]?.elevation ?? 0;
    add(d.a?.id ?? OUT, d.b?.id ?? OUT, [[d.point[0], y, d.point[1]]]);
  }
  for (const s of Object.values(doc.stairs)) {
    const lv = doc.levels[s.level];
    if (!lv) continue;
    const tl = stairTargetLevel(doc, s);
    const top = stairTop(s);
    const yb = lv.elevation + Math.min(0, s.rise), yt = lv.elevation + Math.max(0, s.rise);
    const bottomRoom = s.rise > 0 ? roomAt(doc, s.level, s.start) : null;
    const topRoom = s.rise > 0 ? (tl ? roomAt(doc, tl.id, top) : null) : roomAt(doc, s.level, top);
    add(bottomRoom?.id ?? OUT, topRoom?.id ?? OUT, [[s.start[0], yb, s.start[1]], [top[0], yt, top[1]]]);
  }
  return g;
}

/** Shortest (fewest rooms) chain of edges between two rooms. */
export function routeEdges(g: Map<string, Edge[]>, from: string, to: string): Edge[] {
  if (from === to) return [];
  const prev = new Map<string, { node: string; edge: Edge }>();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const e of g.get(n) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, { node: n, edge: e });
      q.push(e.to);
    }
  }
  if (!prev.has(to)) return [];
  const out: Edge[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur)!;
    out.push(p.edge);
    cur = p.node;
  }
  return out.reverse();
}

/** Shortest (fewest rooms) path of waypoints between two rooms. */
export function routeBetween(g: Map<string, Edge[]>, from: string, to: string): V3[] {
  return routeEdges(g, from, to).flatMap((e) => e.via);
}

export const anchorNode = (doc: PalaceDoc, id: Id) => doc.anchors[id]?.room ?? roomAt(doc, doc.anchors[id]?.level ?? '', [doc.anchors[id]?.pos[0] ?? 0, doc.anchors[id]?.pos[2] ?? 0])?.id ?? OUT;
