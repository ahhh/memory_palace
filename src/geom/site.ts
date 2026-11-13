/**
 * Site rendering: terrain heightfield (flattened under the house, carved by rivers and
 * ponds), water surfaces and plants. Render-only — not part of deterministic generation.
 */
import * as THREE from 'three';
import type { PalaceDoc, River, V2 } from '../model/schema';
import { matColor } from '../model/defaults';
import { bbox, pointInPolygon } from '../model/geometry2d';
import { MeshBuilder, PRIMS, rgb } from './meshBuilder';

function hash2(ix: number, iz: number, seed: number) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const fbm = (x: number, z: number, seed: number) =>
  (vnoise(x, z, seed) - 0.5) + 0.5 * (vnoise(x * 2.03, z * 2.03, seed + 7) - 0.5) + 0.25 * (vnoise(x * 4.1, z * 4.1, seed + 13) - 0.5);

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface Pad { x0: number; z0: number; x1: number; z1: number }

function distToRect(p: Pad, x: number, z: number) {
  const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1);
  return Math.hypot(dx, dz);
}

/** Nearest point on a river polyline: distance in plan and interpolated water height. */
function riverQuery(r: River, x: number, z: number) {
  let best = Infinity, y = r.pts[0]?.[1] ?? 0;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const [ax, ay, az] = r.pts[i], [bx, by, bz] = r.pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; y = ay + (by - ay) * t; }
  }
  return { d: best, y };
}

function distToPolyEdge(poly: V2[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export type HeightFn = (x: number, z: number) => number;

/** Build the terrain height function for a document (memoize per doc). */
export function makeHeightFn(doc: PalaceDoc): HeightFn {
  const t = doc.site.terrain;
  const ground = Object.values(doc.levels).find((l) => l.index === 0);
  const pads: Pad[] = [];
  if (ground) {
    const pts: V2[] = [];
    for (const r of Object.values(doc.rooms)) if (r.level === ground.id) pts.push(...r.polygon);
    for (const w of Object.values(doc.walls)) if (w.level === ground.id) pts.push(w.a, w.b);
    for (const s of Object.values(doc.slabs)) if (s.level === ground.id && s.kind !== 'terrace') pts.push(...s.polygon);
    if (pts.length) {
      const b = bbox(pts);
      pads.push({ x0: b.x0 - 1, z0: b.z0 - 1, x1: b.x1 + 1, z1: b.z1 + 1 });
    }
  }
  const padY = (ground?.elevation ?? 0) - 0.04;
  const rivers = Object.values(doc.rivers);
  const ponds = Object.values(doc.ponds);
  return (x, z) => {
    let h = t.baseY + (t.amp > 0 ? t.amp * 2 * fbm(x / Math.max(1, t.scale), z / Math.max(1, t.scale), t.seed) : 0);
    for (const p of pads) {
      const d = distToRect(p, x, z);
      h = padY + (h - padY) * smooth(0, 8, d);
    }
    for (const r of rivers) {
      const { d, y } = riverQuery(r, x, z);
      const half = r.width / 2;
      const bed = y - r.depth;
      const prof = d < half - 1 ? bed : d < half ? bed + (y + 0.25 - bed) * (d - (half - 1)) : y + 0.25 + (d - half) * 1.1;
      h = Math.min(h, prof);
    }
    for (const p of ponds) {
      const inside = pointInPolygon([x, z], p.polygon);
      const d = distToPolyEdge(p.polygon, x, z);
      const prof = inside ? p.y - p.depth * smooth(0, 1.2, d) : p.y + 0.12 + d * 0.6;
      h = Math.min(h, prof);
    }
    return h;
  };
}

export function buildTerrain(doc: PalaceDoc, height: HeightFn): THREE.BufferGeometry {
  const [sw, sd] = doc.site.size;
  const W = sw + 40, D = sd + 40;
  const step = Math.max(0.6, Math.max(W, D) / 260);
  const nx = Math.ceil(W / step), nz = Math.ceil(D / step);
  const geo = new THREE.PlaneGeometry(W, D, nx, nz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const grass = rgb(matColor(doc.site.ground)), grass2 = rgb('#93a96b'), dirt = rgb('#8a7a5e'), rock = rgb('#8c877c');
  const waterYs = [...Object.values(doc.rivers).flatMap((r) => r.pts.map((p) => p[1])), ...Object.values(doc.ponds).map((p) => p.y)];
  const lowWater = waterYs.length ? Math.max(...waterYs) : -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h);
    const hx = height(x + 0.5, z) - h, hz = height(x, z + 0.5) - h;
    const slope = Math.hypot(hx, hz) / 0.5;
    const n = vnoise(x * 0.3, z * 0.3, 99);
    let c: [number, number, number] = n > 0.5 ? grass : grass2;
    if (slope > 0.9) c = rock;
    else if (h < lowWater + 0.08 && waterYs.length) c = dirt;
    cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildWater(doc: PalaceDoc): { surface: THREE.BufferGeometry; foam: THREE.BufferGeometry } {
  const mb = new MeshBuilder();
  const foam = new MeshBuilder();
  const blue = rgb('#3e7f98');
  const white = rgb('#eef6f8');
  for (const r of Object.values(doc.rivers)) {
    const half = r.width / 2 - 0.4;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, ay, az] = r.pts[i], [bx, by, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * half, nz = (dx / l) * half;
      if (Math.abs(by - ay) > 0.4) {
        // Waterfall sheet + splash.
        const top = Math.max(ay, by), bot = Math.min(ay, by);
        const fx = (ax + bx) / 2, fz = (az + bz) / 2;
        foam.quad([fx - nx, top, fz - nz], [fx + nx, top, fz + nz], [fx + nx, bot, fz + nz], [fx - nx, bot, fz - nz], white);
        foam.quad([fx + nx, top, fz + nz], [fx - nx, top, fz - nz], [fx - nx, bot, fz - nz], [fx + nx, bot, fz + nz], white);
        foam.aabox(fx + (dx / l) * 0.8, bot + 0.05, fz + (dz / l) * 0.8, Math.abs(nx) * 2 + 1.5, 0.15, Math.abs(nz) * 2 + 1.5, white);
        continue;
      }
      // Extend slightly to hide seams.
      const ex = (dx / l) * 0.05, ez = (dz / l) * 0.05;
      mb.quad([ax - nx - ex, ay, az - nz - ez], [ax + nx - ex, ay, az + nz - ez], [bx + nx + ex, by, bz + nz + ez], [bx - nx + ex, by, bz - nz + ez], blue);
    }
  }
  for (const p of Object.values(doc.ponds)) {
    const shape = new THREE.Shape(p.polygon.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    mb.geometry(geo, new THREE.Matrix4().makeTranslation(0, p.y, 0), blue);
    geo.dispose();
    if (p.fountain) {
      const c = p.polygon.reduce((a, q) => [a[0] + q[0] / p.polygon.length, a[1] + q[1] / p.polygon.length], [0, 0]);
      const stone = rgb('#d8d2c4');
      foam.geometry(PRIMS.cyl, new THREE.Matrix4().compose(new THREE.Vector3(c[0], p.y + 0.4, c[1]), new THREE.Quaternion(), new THREE.Vector3(0.5, 1.2, 0.5)), stone);
      foam.geometry(PRIMS.cyl, new THREE.Matrix4().compose(new THREE.Vector3(c[0], p.y + 1.0, c[1]), new THREE.Quaternion(), new THREE.Vector3(1.6, 0.15, 1.6)), stone);
      foam.geometry(PRIMS.cone, new THREE.Matrix4().compose(new THREE.Vector3(c[0], p.y + 1.6, c[1]), new THREE.Quaternion(), new THREE.Vector3(0.9, 1.2, 0.9)), white);
    }
  }
  return { surface: mb.build(), foam: foam.build() };
}

export function buildPlants(doc: PalaceDoc, height: HeightFn): THREE.BufferGeometry {
  const mb = new MeshBuilder();
  const trunk = rgb('#6b4f36'), leaf = rgb('#5d8a4a'), leaf2 = rgb('#47703c'), pine = rgb('#36593a'), hedge = rgb('#4e7a3f');
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const put = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: [number, number, number]) => {
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    mb.geometry(geo, m, c);
  };
  for (const p of Object.values(doc.plants)) {
    const [x, z] = p.pos;
    const s = p.scale;
    const y = height(x, z);
    switch (p.kind) {
      case 'tree':
        put(PRIMS.cyl, x, y + 1.3 * s, z, 0.35 * s, 2.6 * s, 0.35 * s, trunk);
        put(PRIMS.sphere, x, y + 3.6 * s, z, 3.4 * s, 3.0 * s, 3.4 * s, (x * 7 + z * 3) % 2 > 1 ? leaf : leaf2);
        put(PRIMS.sphere, x + 0.6 * s, y + 4.3 * s, z - 0.3 * s, 2.2 * s, 2.0 * s, 2.2 * s, leaf);
        break;
      case 'pine':
        put(PRIMS.cyl, x, y + 1 * s, z, 0.3 * s, 2 * s, 0.3 * s, trunk);
        put(PRIMS.cone, x, y + 3.5 * s, z, 2.6 * s, 4.5 * s, 2.6 * s, pine);
        put(PRIMS.cone, x, y + 5.3 * s, z, 1.8 * s, 3 * s, 1.8 * s, pine);
        break;
      case 'shrub':
        put(PRIMS.sphere, x, y + 0.5 * s, z, 1.3 * s, 1.0 * s, 1.3 * s, leaf2);
        break;
      case 'hedge':
        put(PRIMS.box, x, y + 0.55 * s, z, 1.25 * s, 1.1 * s, 0.9 * s, hedge);
        break;
    }
  }
  return mb.build();
}
