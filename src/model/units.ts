import type { V2, V3 } from './schema';

/** Quantize meters to whole centimeters. Idempotent, so codec round-trips are exact. */
export const q = (m: number): number => {
  const r = Math.round(m * 100) / 100;
  return r === 0 ? 0 : r; // normalize -0
};
export const q2 = (p: readonly [number, number]): V2 => [q(p[0]), q(p[1])];
export const q3 = (p: readonly [number, number, number]): V3 => [q(p[0]), q(p[1]), q(p[2])];
export const deg = (d: number): number => {
  const r = Math.round(d) % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r;
};
export const toCm = (m: number): number => Math.round(m * 100);
export const fromCm = (cm: number): number => cm / 100;
export const DEG2RAD = Math.PI / 180;
