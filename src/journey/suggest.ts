import type { Id, PalaceDoc, Room, V2, V3 } from '../model/schema';
import { byLevel, levelsSorted } from '../model/queries';
import { centroid, pointInPolygon, polygonArea } from '../model/geometry2d';
import { CATALOG } from '../catalog/furniture';
import { OUT, roomGraph } from './graph';

export interface SuggestedAnchor { level: Id; pos: V3; facing: number; title: string; room: Id }

const d2 = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (from: V2, to: V2) => Math.atan2(to[1] - from[1], to[0] - from[0]);

/**
 * A classic method-of-loci route: enter at the front door, walk room to room always
 * taking the next door on your right (depth-first), climb stairs when a floor is done,
 * and drop one locus per room (by default) on its most memorable furniture. Each locus faces
 * away from the room's center, where the tour camera stands to view it.
 */
export function suggestJourney(doc: PalaceDoc, maxPerRoom = 1): SuggestedAnchor[] {
  const g = roomGraph(doc);
  const levels = levelsSorted(doc);
  const ground = levels[0];
  const entries = (g.get(OUT) ?? []).filter((e) => doc.rooms[e.to]?.level === ground?.id);
  entries.sort((a, b) => {
    const ra = doc.rooms[a.to], rb = doc.rooms[b.to];
    return (rb.type === 'hall' ? 1 : 0) - (ra.type === 'hall' ? 1 : 0) || b.via[0][2] - a.via[0][2];
  });
  const start = entries[0]?.to ?? Object.keys(doc.rooms)[0];
  if (!start) return [];
  const out: SuggestedAnchor[] = [];
  const seen = new Set<string>([OUT]);
  const visitRoom = (room: Room, enteredAt: V2) => {
    const area = Math.abs(polygonArea(room.polygon));
    if (area < 2.5) return;
    const items = byLevel(doc.furniture, room.level)
      .filter((f) => pointInPolygon(f.pos, room.polygon) && f.cat !== 'rug' && f.cat !== 'chandelier')
      .map((f) => ({ f, size: (CATALOG[f.cat]?.dims[0] ?? 50) * (CATALOG[f.cat]?.dims[1] ?? 50) }))
      .sort((a, b) => b.size - a.size);
    const n = Math.min(maxPerRoom, Math.max(1, Math.ceil(area / 25)));
    const lv = doc.levels[room.level];
    const center = centroid(room.polygon);
    const picked = new Set<string>();
    for (let i = 0; i < n; i++) {
      const it = items.find((x) => !picked.has(x.f.cat));
      let pos: V3, what: string;
      if (it) {
        picked.add(it.f.cat);
        const h = (CATALOG[it.f.cat]?.dims[2] ?? 80) / 100;
        pos = [it.f.pos[0], Math.min(h + 0.35, lv.height - 0.4), it.f.pos[1]];
        what = CATALOG[it.f.cat]?.label ?? it.f.cat;
      } else if (i === 0) {
        const c = centroid(room.polygon);
        pos = [c[0], 1.2, c[1]];
        what = 'center';
      } else break;
      const from = d2(center, [pos[0], pos[2]]) > 0.3 ? center : enteredAt;
      const facing = Math.round((angle(from, [pos[0], pos[2]]) * 180) / Math.PI);
      out.push({ level: room.level, pos, facing: ((facing % 360) + 360) % 360, title: `${room.label} · ${what}`, room: room.id });
    }
  };
  const dfs = (id: string, enteredAt: V2, heading: number) => {
    seen.add(id);
    const room = doc.rooms[id];
    if (room) visitRoom(room, enteredAt);
    const c = room ? centroid(room.polygon) : enteredAt;
    const edges = (g.get(id) ?? []).filter((e) => !seen.has(e.to));
    const sameLevel = edges.filter((e) => e.via.length === 1);
    const stairs = edges.filter((e) => e.via.length > 1);
    // Keep turning right: order exits clockwise starting just right of the heading.
    const rel = (e: (typeof edges)[number]) => {
      let a = angle(c, [e.via[0][0], e.via[0][2]]) - heading;
      while (a <= -Math.PI) a += 2 * Math.PI;
      while (a > Math.PI) a -= 2 * Math.PI;
      return a <= 0 ? a + 2 * Math.PI : a;
    };
    sameLevel.sort((a, b) => rel(a) - rel(b));
    for (const e of [...sameLevel, ...stairs]) {
      if (seen.has(e.to) || e.to === OUT) continue;
      const p = e.via[e.via.length - 1];
      dfs(e.to, [p[0], p[2]], angle(c, [p[0], p[2]]));
    }
  };
  const first = entries[0]?.via[0];
  dfs(start, first ? [first[0], first[2]] : [0, 0], -Math.PI / 2);
  return out;
}
