import type { PalaceDoc, Roof } from '../model/schema';
import { matColor } from '../model/defaults';
import { MeshBuilder, rgb } from './meshBuilder';

type P3 = [number, number, number];

/** Add a triangle, flipped if needed so its normal points away from `inside`. */
function outTri(mb: MeshBuilder, a: P3, b: P3, c: P3, inside: P3, col: [number, number, number]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const mx = (a[0] + b[0] + c[0]) / 3 - inside[0], my = (a[1] + b[1] + c[1]) / 3 - inside[1], mz = (a[2] + b[2] + c[2]) / 3 - inside[2];
  if (nx * mx + ny * my + nz * mz < 0) mb.tri(a, c, b, col);
  else mb.tri(a, b, c, col);
}

export function addRoof(mb: MeshBuilder, r: Roof, baseY = 0) {
  const o = r.overhang;
  const W = r.size[0] + 2 * o, D = r.size[1] + 2 * o;
  const x0 = r.center[0] - W / 2, x1 = r.center[0] + W / 2, z0 = r.center[1] - D / 2, z1 = r.center[1] + D / 2;
  const y = baseY + r.eaveY;
  const col = rgb(matColor(r.material));
  const soffit = rgb('#e8e2d6');
  const t = r.thickness;
  if (r.kind === 'flat' || r.pitch <= 0) {
    mb.aabox(r.center[0], y + t / 2, r.center[1], W, t, D, col);
    return;
  }
  const tan = Math.tan((r.pitch * Math.PI) / 180);
  const alongX = W >= D;
  const half = (alongX ? D : W) / 2;
  const rise = half * tan;
  const yr = y + t + rise;
  const inside: P3 = [r.center[0], y, r.center[1]];
  const top = y + t;
  // Eave band (gives the roof visible thickness) and soffit.
  mb.box(x0, z0, 1, 0, 0, W, -D, 0, y, top, col);
  mb.quad([x0, y - 0.001, z0], [x1, y - 0.001, z0], [x1, y - 0.001, z1], [x0, y - 0.001, z1], soffit);
  const c = (a: P3, b: P3, d: P3) => outTri(mb, a, b, d, inside, col);
  if (alongX) {
    const inset = r.kind === 'hip' ? half : 0;
    const r0: P3 = [x0 + inset, yr, r.center[1]], r1: P3 = [x1 - inset, yr, r.center[1]];
    const A: P3 = [x0, top, z0], B: P3 = [x1, top, z0], C: P3 = [x1, top, z1], E: P3 = [x0, top, z1];
    c(E, C, r1); c(E, r1, r0); // south slope
    c(B, A, r0); c(B, r0, r1); // north slope
    c(A, E, r0); c(C, B, r1); // hip ends or gable triangles
  } else {
    const inset = r.kind === 'hip' ? half : 0;
    const r0: P3 = [r.center[0], yr, z0 + inset], r1: P3 = [r.center[0], yr, z1 - inset];
    const A: P3 = [x0, top, z0], B: P3 = [x1, top, z0], C: P3 = [x1, top, z1], E: P3 = [x0, top, z1];
    c(A, E, r1); c(A, r1, r0); // west slope
    c(C, B, r0); c(C, r0, r1); // east slope
    c(B, A, r0); c(E, C, r1);
  }
}

export function buildRoofs(doc: PalaceDoc, maxLevelIndex = Infinity) {
  const mb = new MeshBuilder();
  for (const r of Object.values(doc.roofs)) {
    const lv = doc.levels[r.level];
    if (!lv || lv.index > maxLevelIndex) continue;
    addRoof(mb, r);
  }
  return mb.build();
}
