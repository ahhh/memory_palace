import * as THREE from 'three';

const tmpColor = new THREE.Color();
const colorCache = new Map<string, [number, number, number]>();
export function rgb(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.set(hex);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

type V3 = [number, number, number];

/** Accumulates flat-shaded, vertex-colored triangles into one BufferGeometry. */
export class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];

  tri(a: V3, b: V3, c: V3, color: [number, number, number]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
    }
  }

  /** Quad a-b-c-d, counter-clockwise when seen from the front. */
  quad(a: V3, b: V3, c: V3, d: V3, color: [number, number, number]) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /**
   * Box in a plan frame: origin (x, z), axis u = (ux, uz) unit; spans u∈[u0,u1],
   * n∈[n0,n1] (n = left normal (uz, -ux)), y∈[y0,y1].
   * colors: [+n side, -n side, others]
   */
  box(ox: number, oz: number, ux: number, uz: number, u0: number, u1: number, n0: number, n1: number, y0: number, y1: number,
    cPos: [number, number, number], cNeg = cPos, cOther = cPos) {
    if (u1 - u0 < 1e-4 || n1 - n0 < 1e-4 || y1 - y0 < 1e-4) return;
    const nx = uz, nz = -ux;
    const P = (u: number, n: number, y: number): V3 => [ox + ux * u + nx * n, y, oz + uz * u + nz * n];
    const a = P(u0, n0, y0), b = P(u1, n0, y0), c = P(u1, n1, y0), d = P(u0, n1, y0);
    const e = P(u0, n0, y1), f = P(u1, n0, y1), g = P(u1, n1, y1), h = P(u0, n1, y1);
    this.quad(e, f, g, h, cOther); // top (winding chosen for +y normal below)
    this.quad(a, d, c, b, cOther); // bottom
    this.quad(a, b, f, e, cNeg); // -n side
    this.quad(c, d, h, g, cPos); // +n side
    this.quad(b, c, g, f, cOther); // +u end
    this.quad(d, a, e, h, cOther); // -u end
  }

  /** Axis-aligned box from center + size. */
  aabox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: [number, number, number]) {
    this.box(cx, cz, 1, 0, -sx / 2, sx / 2, -sz / 2, sz / 2, cy - sy / 2, cy + sy / 2, color);
  }

  /** Append another geometry transformed by `m`, in a single color. */
  geometry(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: [number, number, number]) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const n = new THREE.Vector3();
    const nAttr = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      n.fromBufferAttribute(nAttr, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(color[0], color[1], color[2]);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export const PRIMS = {
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sphere: new THREE.IcosahedronGeometry(0.5, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
};
