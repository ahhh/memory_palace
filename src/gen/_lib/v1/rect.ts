/** FROZEN (v1). Integer-centimeter rectangles. */
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export const R = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1),
});
export const rw = (r: Rect) => r.x1 - r.x0;
export const rd = (r: Rect) => r.z1 - r.z0;
export const area = (r: Rect) => rw(r) * rd(r);
export const cx = (r: Rect) => (r.x0 + r.x1) / 2;
export const cz = (r: Rect) => (r.z0 + r.z1) / 2;
export const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, z0: r.z0 + d, x1: r.x1 - d, z1: r.z1 - d });
export const grow = (r: Rect, d: number): Rect => inset(r, -d);
export const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
export const contains = (outer: Rect, inner: Rect) =>
  inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.z0 >= outer.z0 && inner.z1 <= outer.z1;
export const containsPt = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const translate = (r: Rect, dx: number, dz: number): Rect => ({ x0: r.x0 + dx, z0: r.z0 + dz, x1: r.x1 + dx, z1: r.z1 + dz });
export const mirrorX = (r: Rect, axis: number): Rect => R(2 * axis - r.x1, r.z0, 2 * axis - r.x0, r.z1);
/** Round to a 10 cm grid. */
export const snap10 = (v: number) => Math.round(v / 10) * 10;
