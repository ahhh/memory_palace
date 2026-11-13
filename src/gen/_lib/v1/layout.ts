/**
 * FROZEN (v1). Turns non-overlapping room rectangles into walls, doors and windows.
 * All math is integer centimeters.
 */
import type { Id, OpeningKind, RoomType } from '../../../model/schema';
import type { DocBuilder } from './builder';
import { type Rect, overlaps, R } from './rect';
import type { Rng } from './rng';

export interface RoomSpec {
  rect: Rect;
  type: RoomType;
  label: string;
  floor: string;
  holes?: Rect[];
  /** Exterior sides that must stay windowless (party walls, the condo corridor). */
  blind?: Side[];
}

export type Side = 'N' | 'S' | 'E' | 'W';

export interface Piece {
  /** 'x': runs along x at z = coord. 'z': runs along z at x = coord. */
  axis: 'x' | 'z';
  coord: number;
  lo: number;
  hi: number;
  /** Room index on the -z/-x side, or -1. */
  neg: number;
  /** Room index on the +z/+x side, or -1. */
  pos: number;
  exterior: boolean;
  wall: Id;
  /** Occupied spans along the piece: [from, to, 1 = passable opening / 0 = window]. */
  used: [number, number, number][];
}

export const pieceLen = (p: Piece) => p.hi - p.lo;

/** Outside direction of an exterior piece. */
export function pieceSide(p: Piece): Side {
  if (p.axis === 'x') return p.pos >= 0 ? 'N' : 'S';
  return p.pos >= 0 ? 'W' : 'E';
}

/** Rectangle swept by an opening on a piece, `depth` cm to each side. */
function openingZone(p: Piece, c: number, w: number, depth: number): Rect {
  const a = p.lo + c - w / 2, b = p.lo + c + w / 2;
  return p.axis === 'x' ? R(a, p.coord - depth, b, p.coord + depth) : R(p.coord - depth, a, p.coord + depth, b);
}

export function extractPieces(rects: Rect[]): Omit<Piece, 'wall' | 'used' | 'exterior'>[] {
  const out: Omit<Piece, 'wall' | 'used' | 'exterior'>[] = [];
  for (const axis of ['x', 'z'] as const) {
    // Gather lines: coordinate → edges on it.
    const lines = new Map<number, { lo: number; hi: number }[]>();
    rects.forEach((r) => {
      const edges = axis === 'x'
        ? [{ c: r.z0, lo: r.x0, hi: r.x1 }, { c: r.z1, lo: r.x0, hi: r.x1 }]
        : [{ c: r.x0, lo: r.z0, hi: r.z1 }, { c: r.x1, lo: r.z0, hi: r.z1 }];
      for (const e of edges) {
        const arr = lines.get(e.c) ?? [];
        arr.push({ lo: e.lo, hi: e.hi });
        lines.set(e.c, arr);
      }
    });
    const coords = [...lines.keys()].sort((a, b) => a - b);
    for (const c of coords) {
      const edges = lines.get(c)!;
      const bps = [...new Set(edges.flatMap((e) => [e.lo, e.hi]))].sort((a, b) => a - b);
      let cur: Omit<Piece, 'wall' | 'used' | 'exterior'> | null = null;
      for (let i = 0; i + 1 < bps.length; i++) {
        const lo = bps[i], hi = bps[i + 1];
        let neg = -1, pos = -1;
        rects.forEach((r, ri) => {
          if (axis === 'x') {
            if (r.x0 <= lo && r.x1 >= hi) {
              if (r.z1 === c) neg = ri;
              if (r.z0 === c) pos = ri;
            }
          } else if (r.z0 <= lo && r.z1 >= hi) {
            if (r.x1 === c) neg = ri;
            if (r.x0 === c) pos = ri;
          }
        });
        if (neg < 0 && pos < 0) { cur = null; continue; }
        if (cur && cur.hi === lo && cur.neg === neg && cur.pos === pos) {
          cur.hi = hi;
        } else {
          cur = { axis, coord: c, lo, hi, neg, pos };
          out.push(cur);
        }
      }
    }
  }
  return out;
}

export interface LevelPlan {
  level: Id;
  height: number;
  rooms: RoomSpec[];
  roomIds: Id[];
  pieces: Piece[];
}

export function buildLevel(
  b: DocBuilder, level: Id, height: number, rooms: RoomSpec[],
  mats: { ext: string; int: string }, extT = 30, intT = 12,
): LevelPlan {
  const roomIds = rooms.map((r) => b.room(level, r.rect, r.label, r.type, r.floor, r.holes));
  const pieces: Piece[] = extractPieces(rooms.map((r) => r.rect)).map((p) => {
    const exterior = p.neg < 0 || p.pos < 0;
    const wall = p.axis === 'x'
      ? b.wall(level, p.lo, p.coord, p.hi, p.coord, exterior ? extT : intT, height, exterior, exterior ? mats.ext : mats.int)
      : b.wall(level, p.coord, p.lo, p.coord, p.hi, exterior ? extT : intT, height, exterior, exterior ? mats.ext : mats.int);
    return { ...p, exterior, wall, used: [] };
  });
  return { level, height, rooms, roomIds, pieces };
}

function fits(p: Piece, c: number, w: number, blockers: Rect[], margin = 25): boolean {
  const a = c - w / 2, z = c + w / 2;
  if (a < margin || z > pieceLen(p) - margin) return false;
  for (const [u0, u1] of p.used) if (a < u1 + 15 && z > u0 - 15) return false;
  const zone = openingZone(p, c, w, 90);
  for (const bl of blockers) if (overlaps(zone, bl)) return false;
  return true;
}

function doorCandidates(p: Piece, w: number, rng: Rng): number[] {
  const L = pieceLen(p);
  const center = Math.round(L / 20) * 10;
  const nearA = 40 + w / 2, nearB = L - 40 - w / 2;
  const order = rng.pick([[center, nearA, nearB], [nearA, center, nearB], [nearB, center, nearA]]);
  const extra: number[] = [];
  for (let s = 30; s < L / 2; s += 30) extra.push(center - s, center + s);
  return [...order, ...extra];
}

export function addOpening(
  b: DocBuilder, p: Piece, kind: OpeningKind, w: number, h: number, sill: number,
  rng: Rng, blockers: Rect[], at?: number,
): Id | null {
  const cands = at !== undefined ? [at] : doorCandidates(p, w, rng);
  for (const c of cands) {
    if (!fits(p, c, w, kind === 'window' ? [] : blockers)) continue;
    p.used.push([c - w / 2, c + w / 2, kind === 'window' ? 0 : 1]);
    return b.opening(p.wall, kind, c, w, h, sill);
  }
  return null;
}

export interface DoorPolicy {
  /** Lower = more desirable connection; null = never connect directly. */
  cost(a: RoomSpec, b: RoomSpec): number | null;
  /** Make this connection a wide open arch instead of a door. */
  arch?(a: RoomSpec, b: RoomSpec): boolean;
  /** Probability of adding each remaining non-tree connection (creates loops). */
  loops: number;
  doorWidth: number;
  doorHeight: number;
}

/** Spanning tree of the room-adjacency graph (Kruskal), plus style-dependent extra loops. */
export function placeDoors(b: DocBuilder, plan: LevelPlan, rng: Rng, policy: DoorPolicy, blockers: Rect[]) {
  const edges: { p: Piece; cost: number; i: number }[] = [];
  plan.pieces.forEach((p, i) => {
    if (p.exterior || pieceLen(p) < policy.doorWidth + 60) return;
    const c = policy.cost(plan.rooms[p.neg], plan.rooms[p.pos]);
    if (c === null) return;
    edges.push({ p, cost: c * 1000 + Math.min(999, Math.floor(100000 / pieceLen(p))), i });
  });
  edges.sort((x, y) => x.cost - y.cost || x.i - y.i);
  const parent = plan.rooms.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const rest: typeof edges = [];
  const connected = new Set<string>();
  const connect = (e: (typeof edges)[number]) => {
    const A = plan.rooms[e.p.neg], B = plan.rooms[e.p.pos];
    const arch = policy.arch?.(A, B) ?? false;
    const w = arch ? Math.min(pieceLen(e.p) - 80, 300) : policy.doorWidth;
    const id = addOpening(b, e.p, arch ? 'arch' : 'door', w, arch ? 240 : policy.doorHeight, 0, rng, blockers);
    if (id) connected.add(Math.min(e.p.neg, e.p.pos) + ':' + Math.max(e.p.neg, e.p.pos));
    return id;
  };
  for (const e of edges) {
    const ra = find(e.p.neg), rb = find(e.p.pos);
    if (ra !== rb) {
      if (connect(e)) parent[ra] = rb;
      else rest.push(e);
    } else rest.push(e);
  }
  for (const e of rest) {
    const key = Math.min(e.p.neg, e.p.pos) + ':' + Math.max(e.p.neg, e.p.pos);
    if (connected.has(key)) continue;
    if (find(e.p.neg) !== find(e.p.pos)) { if (connect(e)) parent[find(e.p.neg)] = find(e.p.pos); continue; }
    if (policy.cost(plan.rooms[e.p.neg], plan.rooms[e.p.pos])! <= 2 && rng.chance(policy.loops)) connect(e);
  }
}

export function exteriorPiecesOf(plan: LevelPlan, roomIdx: number, side?: Side): Piece[] {
  return plan.pieces
    .filter((p) => p.exterior && (p.neg === roomIdx || p.pos === roomIdx) && (!side || pieceSide(p) === side))
    .sort((a, b) => pieceLen(b) - pieceLen(a) || a.lo - b.lo);
}

/** Exterior door on the longest exterior piece of a room facing `side`. */
export function placeExteriorDoor(
  b: DocBuilder, plan: LevelPlan, roomIdx: number, sides: Side[], w: number, h: number,
  rng: Rng, blockers: Rect[], centered = true,
): { piece: Piece; offset: number } | null {
  for (const s of sides) {
    for (const p of exteriorPiecesOf(plan, roomIdx, s)) {
      const c = Math.round(pieceLen(p) / 20) * 10;
      const id = addOpening(b, p, 'door', w, h, 0, rng, blockers, centered ? c : undefined)
        ?? addOpening(b, p, 'door', w, h, 0, rng, blockers);
      if (id) return { piece: p, offset: p.used[p.used.length - 1][0] + w / 2 };
    }
  }
  return null;
}

export interface WindowSpec { width: number; height: number; sill: number; mode: 'spaced' | 'ribbon'; spacing: number; gap: number }
export type WindowPolicy = (room: RoomSpec, piece: Piece, side: Side) => WindowSpec | null;

export function placeWindows(b: DocBuilder, plan: LevelPlan, policy: WindowPolicy) {
  for (const p of plan.pieces) {
    if (!p.exterior) continue;
    const ri = p.neg >= 0 ? p.neg : p.pos;
    const room = plan.rooms[ri];
    const side = pieceSide(p);
    if (room.blind?.includes(side)) continue;
    const spec = policy(room, p, side);
    if (!spec) continue;
    // Free intervals along the piece.
    const L = pieceLen(p);
    const used = p.used.slice().sort((x, y) => x[0] - y[0]);
    const free: [number, number][] = [];
    let s = 35;
    for (const [u0, u1] of used) {
      if (u0 - 25 > s) free.push([s, u0 - 25]);
      s = Math.max(s, u1 + 25);
    }
    if (L - 35 > s) free.push([s, L - 35]);
    for (const [f0, f1] of free) {
      const fl = f1 - f0;
      if (spec.mode === 'ribbon') {
        const n = Math.floor((fl + spec.gap) / (spec.width + spec.gap));
        if (n < 1) continue;
        const total = n * spec.width + (n - 1) * spec.gap;
        const start = f0 + Math.round((fl - total) / 2);
        for (let i = 0; i < n; i++) {
          const c = start + i * (spec.width + spec.gap) + spec.width / 2;
          p.used.push([c - spec.width / 2, c + spec.width / 2, 0]);
          b.opening(p.wall, 'window', c, spec.width, spec.height, spec.sill);
        }
      } else {
        const n = Math.floor(fl / spec.spacing);
        if (n < 1) {
          if (fl >= spec.width + 20) {
            const c = f0 + Math.round(fl / 2);
            p.used.push([c - spec.width / 2, c + spec.width / 2, 0]);
            b.opening(p.wall, 'window', c, spec.width, spec.height, spec.sill);
          }
          continue;
        }
        for (let i = 0; i < n; i++) {
          const c = f0 + Math.round((fl * (2 * i + 1)) / (2 * n));
          p.used.push([c - spec.width / 2, c + spec.width / 2, 0]);
          b.opening(p.wall, 'window', c, spec.width, spec.height, spec.sill);
        }
      }
    }
  }
}
