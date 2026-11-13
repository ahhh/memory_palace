import * as THREE from 'three';
import type { Id, Level, PalaceDoc, Room, Slab, V2, Wall } from '../model/schema';
import { byLevel, openingsByWall, roomsBesideWall, wallDir, wallLength } from '../model/queries';
import { matColor } from '../model/defaults';
import { centroid, pointInPolygon } from '../model/geometry2d';
import { stairFootprint, stairTargetLevel, dirVec } from '../model/stairs';
import { ANIMATED_CATS, CATALOG } from '../catalog/furniture';
import { MeshBuilder, PRIMS, rgb } from './meshBuilder';

const PLASTER = '#efe9de';
const FRAME = '#f7f5f0';
const DOOR = '#7a5236';
const GLASS = '#a9d2e3';

export interface LevelMeshOpts {
  /** Walls drawn cut down (Sims-style cutaway). */
  cut?: Set<Id>;
  cutHeight?: number;
  /** Draw every wall at cutHeight. */
  allCut?: boolean;
  furniture?: boolean;
  /** Furniture categories drawn elsewhere (detailed models). */
  skipCat?: (cat: string) => boolean;
}

export interface LevelMeshes { solid: THREE.BufferGeometry; glass: THREE.BufferGeometry }

/** Which side of a wall is outside: +1 = +n side, -1 = -n side, 0 = interior wall. */
export function outsideSign(doc: PalaceDoc, w: Wall): number {
  if (!w.exterior) return 0;
  const [pos, neg] = roomsBesideWall(doc, w, wallLength(w) / 2);
  if (pos && !neg) return -1;
  if (neg && !pos) return 1;
  return 0;
}

function addWalls(mb: MeshBuilder, glass: MeshBuilder, doc: PalaceDoc, level: Level, opts: LevelMeshOpts) {
  const byWall = openingsByWall(doc);
  const y0 = level.elevation;
  for (const w of byLevel(doc.walls, level.id)) {
    const L = wallLength(w);
    if (L < 1e-3) continue;
    const [ux, uz] = wallDir(w);
    const t = w.thickness, ext = t / 2;
    const cut = opts.allCut || opts.cut?.has(w.id);
    const H = cut ? Math.min(opts.cutHeight ?? 0.4, w.height) : w.height;
    const side = outsideSign(doc, w);
    const extC = rgb(matColor(w.material)), intC = rgb(w.exterior ? PLASTER : matColor(w.material === 'plaster' ? 'plaster' : w.material));
    const cPos = side === 1 ? extC : intC, cNeg = side === -1 ? extC : intC;
    const cTop = rgb(cut ? '#6b6258' : matColor(w.material));
    const ops = byWall.get(w.id) ?? [];
    const seg = (u0: number, u1: number, ya: number, yb: number) =>
      mb.box(w.a[0], w.a[1], ux, uz, u0, u1, -ext, ext, y0 + ya, y0 + Math.min(yb, H), cPos, cNeg, cTop);
    let u = -ext;
    for (const o of ops) {
      const a = Math.max(0, o.offset - o.width / 2), b = Math.min(L, o.offset + o.width / 2);
      seg(u, a, 0, H);
      if (o.sill > 0) seg(a, b, 0, o.sill);
      if (o.sill + o.height < H) seg(a, b, o.sill + o.height, H);
      // Frames, glass and door leaves (only where visible above the cut).
      const top = Math.min(o.sill + o.height, H);
      if (o.kind === 'window') {
        if (o.sill < H) {
          glass.box(w.a[0], w.a[1], ux, uz, a, b, -0.01, 0.01, y0 + o.sill, y0 + top, rgb(GLASS));
          const f = rgb(FRAME);
          mb.box(w.a[0], w.a[1], ux, uz, a, b, -ext, ext, y0 + o.sill - 0.04, y0 + o.sill, f);
          if (top === o.sill + o.height) mb.box(w.a[0], w.a[1], ux, uz, a, b, -0.03, 0.03, y0 + top - 0.04, y0 + top, f);
          mb.box(w.a[0], w.a[1], ux, uz, a, a + 0.04, -0.03, 0.03, y0 + o.sill, y0 + top, f);
          mb.box(w.a[0], w.a[1], ux, uz, b - 0.04, b, -0.03, 0.03, y0 + o.sill, y0 + top, f);
        }
      } else if (o.kind === 'door') {
        const glassDoor = o.width >= 1.6 && o.height <= 2.35;
        if (glassDoor) {
          glass.box(w.a[0], w.a[1], ux, uz, a, b, -0.01, 0.01, y0, y0 + top, rgb(GLASS));
          mb.box(w.a[0], w.a[1], ux, uz, (a + b) / 2 - 0.03, (a + b) / 2 + 0.03, -0.03, 0.03, y0, y0 + top, rgb(FRAME));
        } else if (o.width < 2.4) {
          // Open leaf/leaves swung 90° to the -n side.
          const leaves = o.width >= 1.4 ? 2 : 1;
          const lw = o.width / leaves;
          const hinge = (uu: number) => [w.a[0] + ux * uu, w.a[1] + uz * uu] as V2;
          const leafH = Math.min(o.height - 0.02, H);
          const nx = uz, nz = -ux;
          const [h1x, h1z] = hinge(a);
          mb.box(h1x, h1z, -nx, -nz, ext, ext + lw, -0.02, 0.02, y0, y0 + leafH, rgb(DOOR));
          if (leaves === 2) {
            const [h2x, h2z] = hinge(b);
            mb.box(h2x, h2z, -nx, -nz, ext, ext + lw, -0.02, 0.02, y0, y0 + leafH, rgb(DOOR));
          }
        }
      }
      u = b;
    }
    seg(u, L + ext, 0, H);
  }
}

function shapeFrom(poly: V2[], holes: V2[][] = []): THREE.Shape {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  return s;
}

function addExtruded(mb: MeshBuilder, poly: V2[], holes: V2[][], top: number, depth: number, color: string) {
  if (poly.length < 3) return;
  const geo = new THREE.ExtrudeGeometry(shapeFrom(poly, holes), { depth, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Matrix4().makeTranslation(0, top, 0);
  mb.geometry(geo, m, rgb(color));
  geo.dispose();
}

function railing(mb: MeshBuilder, a: V2, b: V2, y: number, h: number, color: string, solid: boolean) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  if (L < 0.05) return;
  const ux = dx / L, uz = dz / L;
  const c = rgb(color);
  if (solid) {
    mb.box(a[0], a[1], ux, uz, 0, L, -0.08, 0.08, y, y + h, c);
  } else {
    mb.box(a[0], a[1], ux, uz, 0, L, -0.03, 0.03, y + h - 0.05, y + h, c);
    const n = Math.max(1, Math.round(L / 1.2));
    for (let i = 0; i <= n; i++) mb.box(a[0], a[1], ux, uz, (L * i) / n - 0.025, (L * i) / n + 0.025, -0.025, 0.025, y, y + h, c);
  }
}

/** Stair holes cut into this level's floors (stairs arriving here from below). */
export function stairHoles(doc: PalaceDoc, level: Level): V2[][] {
  return Object.values(doc.stairs)
    .filter((s) => s.rise > 0 && stairTargetLevel(doc, s)?.id === level.id)
    .map((s) => stairFootprint(s));
}

function addFloors(mb: MeshBuilder, doc: PalaceDoc, level: Level) {
  const holes = stairHoles(doc, level);
  const depth = level.index === 0 ? 0.12 : 0.2;
  for (const r of byLevel(doc.rooms, level.id)) {
    const h = [...(r.holes ?? []), ...holes.filter((h) => pointInPolygon(centroid(h), r.polygon))];
    addExtruded(mb, r.polygon, h, level.elevation, depth, matColor(r.floor));
    for (const hole of r.holes ?? []) {
      for (let i = 0; i < hole.length; i++) railing(mb, hole[i], hole[(i + 1) % hole.length], level.elevation, 1.0, '#3b3029', false);
    }
  }
  for (const h of holes) {
    // Rail the two long sides of each stairwell.
    for (let i = 0; i < 4; i += 2) railing(mb, h[(i + 1) % 4], h[(i + 2) % 4], level.elevation, 1.0, '#3b3029', false);
  }
}

function addSlabs(mb: MeshBuilder, slabs: Slab[], level: Level) {
  for (const s of slabs) {
    const top = level.elevation + s.dy;
    addExtruded(mb, s.polygon, [], top, s.thickness, matColor(s.material));
    if (s.railing) {
      const solid = s.kind === 'terrace';
      for (let i = 0; i < s.polygon.length; i++) {
        railing(mb, s.polygon[i], s.polygon[(i + 1) % s.polygon.length], top, solid ? 0.85 : 1.0, solid ? matColor(s.material) : '#4a4f55', solid);
      }
    }
  }
}

function addStairs(mb: MeshBuilder, doc: PalaceDoc, level: Level) {
  for (const s of byLevel(doc.stairs, level.id)) {
    const [ux, uz] = dirVec(s.dir);
    const n = Math.max(1, Math.round(Math.abs(s.rise) / 0.18));
    const base = level.elevation + Math.min(0, s.rise);
    const rise = Math.abs(s.rise);
    const tread = rgb('#a77d55'), side = rgb('#6e5440');
    for (let i = 0; i < n; i++) {
      const u0 = (s.run * i) / n, u1 = (s.run * (i + 1)) / n;
      const yTop = base + (rise * (i + 1)) / n;
      mb.box(s.start[0], s.start[1], ux, uz, u0, u1, -s.width / 2, s.width / 2, Math.max(base, yTop - 0.25), yTop, side, side, tread);
    }
    // Stringers / handrails.
    for (const k of [-1, 1]) {
      const nx = uz * k * (s.width / 2), nz = -ux * k * (s.width / 2);
      const a: [number, number, number] = [s.start[0] + nx, base + 0.95, s.start[1] + nz];
      const b: [number, number, number] = [s.start[0] + ux * s.run + nx, base + rise + 0.95, s.start[1] + uz * s.run + nz];
      const m = new THREE.Matrix4();
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
      m.compose(mid, q, new THREE.Vector3(0.05, len, 0.05));
      mb.geometry(PRIMS.cyl, m, rgb('#3b3029'));
    }
  }
}

function addMasses(mb: MeshBuilder, doc: PalaceDoc, level: Level) {
  for (const m of byLevel(doc.masses, level.id)) {
    const [sx, sy, sz] = m.size;
    const r = (m.rot * Math.PI) / 180;
    const c = rgb(matColor(m.material));
    mb.box(m.center[0], m.center[1], Math.cos(r), Math.sin(r), -sx / 2, sx / 2, -sz / 2, sz / 2, level.elevation + m.dy, level.elevation + m.dy + sy, c);
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

export function addFurnitureItem(mb: MeshBuilder, cat: string, x: number, y: number, z: number, rot: number, tint?: string) {
  const item = CATALOG[cat];
  if (!item) {
    mb.aabox(x, y + 0.25, z, 0.5, 0.5, 0.5, rgb('#ff00ff'));
    return;
  }
  // Plan rotation: +x → +z for 90°, i.e. a clockwise turn seen from above → negative Y rotation.
  const ry = (-rot * Math.PI) / 180;
  tmpQ.setFromAxisAngle(Y, ry);
  const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(1, 1, 1));
  for (const p of item.parts) {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...p.p), new THREE.Quaternion(), new THREE.Vector3(...p.z));
    tmpM.multiplyMatrices(base, local);
    const geo = p.s === 'box' ? PRIMS.box : p.s === 'cyl' ? PRIMS.cyl : p.s === 'cone' ? PRIMS.cone : PRIMS.sphere;
    mb.geometry(geo, tmpM, rgb(tint ?? p.c));
  }
}

function addFurniture(mb: MeshBuilder, doc: PalaceDoc, level: Level, skip?: (cat: string) => boolean) {
  for (const f of byLevel(doc.furniture, level.id)) {
    if (ANIMATED_CATS.has(f.cat) || skip?.(f.cat)) continue;
    addFurnitureItem(mb, f.cat, f.pos[0], level.elevation + (f.dy ?? 0), f.pos[1], f.rot);
  }
}

export function buildLevelMeshes(doc: PalaceDoc, level: Level, opts: LevelMeshOpts = {}): LevelMeshes {
  const mb = new MeshBuilder();
  const glass = new MeshBuilder();
  addFloors(mb, doc, level);
  addSlabs(mb, byLevel(doc.slabs, level.id), level);
  addWalls(mb, glass, doc, level, opts);
  addStairs(mb, doc, level);
  addMasses(mb, doc, level);
  if (opts.furniture !== false) addFurniture(mb, doc, level, opts.skipCat);
  return { solid: mb.build(), glass: glass.build() };
}

export type { Room };
