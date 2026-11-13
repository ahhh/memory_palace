/**
 * Where the tour (and walk spawn) camera stands to look at an anchor, and the path it walks
 * between anchors. The camera enters each room through its doorway, walks to a clear spot
 * at (or near) the room's center, and only then turns to face the anchor.
 */
import type { Id, PalaceDoc, V2, V3 } from '../model/schema';
import { centroid, dist, pointInPolygon, rot2 } from '../model/geometry2d';
import { byLevel, doorLinks, wallDir } from '../model/queries';
import { CATALOG } from '../catalog/furniture';
import { resolve, type Seg } from '../walk/collision';
import { OUT, anchorNode, roomGraph, routeEdges } from './graph';

export const EYE = 1.6;
const BODY = 0.3; // camera body radius when finding a free spot
const MIN_VIEW = 1.3, GOOD_VIEW = 1.7; // comfortable distances to the anchor (m)
const DOOR_STEP = 0.6; // how far the path runs straight through a doorway on each side

export interface Viewpoint { eye: V3; look: V3 }

const RING: V2[] = [[1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1], [0.71, -0.71]];

/** Is p inside the footprint of any (non-rug) furniture on this level? */
function inFurniture(doc: PalaceDoc, level: Id, p: V2, pad = 0.2): boolean {
  for (const f of byLevel(doc.furniture, level)) {
    const item = CATALOG[f.cat];
    if (!item || f.cat === 'rug' || f.cat === 'chandelier') continue;
    const local = rot2([p[0] - f.pos[0], p[1] - f.pos[1]], -f.rot);
    if (Math.abs(local[0]) < item.dims[0] / 200 + pad && Math.abs(local[1]) < item.dims[1] / 200 + pad) return true;
  }
  return false;
}

function segCross(p1: V2, p2: V2, p3: V2, p4: V2) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/**
 * Nothing at eye-ish height between `eye` and the anchor. The last stretch next to the
 * anchor is ignored: anchors sit on furniture, whose own collider would otherwise always
 * "block" the view of it.
 */
export function clearView(eye: V2, target: V2, elevation: number, segs: Seg[]): boolean {
  const d = dist(eye, target);
  const stop = Math.max(0, d - 0.7);
  if (stop < 0.05) return true;
  const end: V2 = [eye[0] + ((target[0] - eye[0]) * stop) / d, eye[1] + ((target[1] - eye[1]) * stop) / d];
  const y = elevation + 1.2;
  return !segs.some((s) => s.y0 <= y && s.y1 >= y && segCross(eye, end, s.a, s.b));
}

/** A spot to stand in: inside the room, out of the furniture, clear of walls. */
function standable(doc: PalaceDoc, level: Id, poly: V2[], p0: V2, elevation: number, segs: Seg[]): V2 | null {
  if (!pointInPolygon(p0, poly) || inFurniture(doc, level, p0)) return null;
  const p = resolve(p0, BODY, elevation, segs);
  if (dist(p, p0) > 0.45 || !pointInPolygon(p, poly) || inFurniture(doc, level, p, 0.05)) return null;
  return p;
}

export function anchorViewpoint(doc: PalaceDoc, id: Id, segs: Seg[]): Viewpoint | null {
  const a = doc.anchors[id];
  const lv = a && doc.levels[a.level];
  if (!a || !lv) return null;
  // Aim at the object itself, not the marker floating above it, so tall pieces (wardrobes,
  // bookshelves) don't tip the view into the ceiling and low ones still show their marker.
  const look: V3 = [a.pos[0], lv.elevation + Math.min(1.45, Math.max(0.5, a.pos[1] - 0.45)), a.pos[2]];
  const target: V2 = [a.pos[0], a.pos[2]];
  const at = (p: V2): Viewpoint => ({ eye: [p[0], lv.elevation + EYE, p[1]], look });
  const room = doc.rooms[anchorNode(doc, id)];
  if (room) {
    // The room's center first, then rings around it, nearest first.
    const c = centroid(room.polygon);
    const cands: V2[] = [c];
    for (const r of [0.6, 1.2, 1.8]) for (const [dx, dz] of RING) cands.push([c[0] + dx * r, c[1] + dz * r]);
    for (const p0 of cands) {
      let p = standable(doc, room.level, room.polygon, p0, lv.elevation, segs);
      if (!p) continue;
      // Too close to see it properly: step back from the anchor, away through the room.
      const d = dist(p, target);
      if (d < MIN_VIEW) {
        if (d < 0.05) continue;
        const q: V2 = [target[0] + ((p[0] - target[0]) * GOOD_VIEW) / d, target[1] + ((p[1] - target[1]) * GOOD_VIEW) / d];
        const back = standable(doc, room.level, room.polygon, q, lv.elevation, segs);
        if (!back || !clearView(p, back, lv.elevation, segs)) continue;
        p = back;
      }
      if (clearView(p, target, lv.elevation, segs)) return at(p);
    }
  }
  // No room (or no clear spot): back off from the anchor against its facing.
  const r = (a.facing * Math.PI) / 180;
  const backDir: V2 = [-Math.cos(r), -Math.sin(r)];
  for (const k of [1.8, 1.4, 1.0, 0.6]) {
    const p: V2 = [target[0] + backDir[0] * k, target[1] + backDir[1] * k];
    if (clearView(p, target, lv.elevation, segs)) return at(resolve(p, 0.25, lv.elevation, segs));
  }
  return at([target[0] + backDir[0] * 0.5, target[1] + backDir[1] * 0.5]);
}

/**
 * Floor-level waypoints from one anchor's room to another's: straight through each doorway
 * (a point either side of it, so the camera doesn't cut corners through the jambs), and
 * stairs bottom to top. The caller appends the destination viewpoint (the room's center).
 */
export function tourRoute(doc: PalaceDoc, fromAnchor: Id, toAnchor: Id): V3[] {
  const a = anchorNode(doc, fromAnchor), b = anchorNode(doc, toAnchor);
  if (a === OUT && b === OUT) return [];
  const links = doorLinks(doc);
  const out: V3[] = [];
  let prev: V2 | null = doc.rooms[a] ? centroid(doc.rooms[a].polygon) : null;
  for (const e of routeEdges(roomGraph(doc), a, b)) {
    if (e.via.length === 1) {
      const [x, y, z] = e.via[0];
      const link = links.find((l) => Math.abs(l.point[0] - x) < 0.01 && Math.abs(l.point[1] - z) < 0.01);
      if (link) {
        const [ux, uz] = wallDir(link.wall);
        let n: V2 = [-uz, ux];
        // Point the normal from the side we come from toward the side we go to.
        const next = doc.rooms[e.to] ? centroid(doc.rooms[e.to].polygon) : null;
        const ref = prev ?? (next ? [2 * x - next[0], 2 * z - next[1]] as V2 : null);
        if (ref && (ref[0] - x) * n[0] + (ref[1] - z) * n[1] > 0) n = [-n[0], -n[1]];
        out.push([x - n[0] * DOOR_STEP, y, z - n[1] * DOOR_STEP], [x, y, z], [x + n[0] * DOOR_STEP, y, z + n[1] * DOOR_STEP]);
      } else out.push(e.via[0]);
      prev = [x, z];
    } else {
      out.push(...e.via);
      const t = e.via[e.via.length - 1];
      prev = [t[0], t[2]];
    }
  }
  return out;
}
