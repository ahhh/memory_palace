/** FROZEN (v1). Ordered binary treemap partition in integer cm, cuts snapped to 10 cm. */
import { type Rect, rd, rw, snap10 } from './rect';

export type Axis = 'x' | 'z' | 'auto';

/**
 * Split `r` into rectangles with areas proportional to `weights`, preserving order
 * (so neighbors in the list tend to be neighbors in space).
 * axis 'x' = cut with lines of constant x (pieces arranged left→right).
 */
export function partition(r: Rect, weights: number[], axis: Axis = 'auto'): Rect[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) return [r];
  const total = weights.reduce((s, w) => s + w, 0);
  let k = 1, best = Infinity, acc = 0;
  for (let i = 1; i < weights.length; i++) {
    acc += weights[i - 1];
    const d = Math.abs(2 * acc - total);
    if (d < best) { best = d; k = i; }
  }
  let left = 0;
  for (let i = 0; i < k; i++) left += weights[i];
  const ax = axis === 'auto' ? (rw(r) >= rd(r) ? 'x' : 'z') : axis;
  const span = ax === 'x' ? rw(r) : rd(r);
  const lo = ax === 'x' ? r.x0 : r.z0;
  const minSide = Math.min(120, Math.floor(span / 2 / 10) * 10);
  let cut = lo + snap10(Math.round((span * left) / total));
  if (cut < lo + minSide) cut = lo + minSide;
  if (cut > lo + span - minSide) cut = lo + span - minSide;
  const [a, b]: [Rect, Rect] = ax === 'x'
    ? [{ ...r, x1: cut }, { ...r, x0: cut }]
    : [{ ...r, z1: cut }, { ...r, z0: cut }];
  const sub = axis === 'auto' ? 'auto' : axis;
  return [...partition(a, weights.slice(0, k), sub), ...partition(b, weights.slice(k), sub)];
}

/** Split a span [lo, hi] into pieces proportional to weights (10 cm snapped). */
export function splitSpan(lo: number, hi: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  const cuts = [lo];
  let acc = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    acc += weights[i];
    cuts.push(lo + snap10(Math.round(((hi - lo) * acc) / total)));
  }
  cuts.push(hi);
  return cuts;
}
