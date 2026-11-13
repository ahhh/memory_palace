/**
 * FROZEN (v1). Deterministic PRNG: cyrb128 string hash → sfc32.
 * Only exact integer/IEEE operations are used, so results are identical in every engine.
 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Rng {
  /** uint32 */
  u32(): number;
  /** [0, 1) */
  next(): number;
  /** integer in [lo, hi] inclusive */
  int(lo: number, hi: number): number;
  /** integer cm in [lo, hi], multiple of step */
  step(lo: number, hi: number, step: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  fork(label: string): Rng;
}

export function makeRng(seed: string): Rng {
  let [a, b, c, d] = cyrb128(seed);
  const u32 = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) u32();
  const next = () => u32() / 4294967296;
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const rng: Rng = {
    u32,
    next,
    int,
    step: (lo, hi, s) => lo + s * int(0, Math.floor((hi - lo) / s)),
    chance: (p) => next() < p,
    pick: (arr) => arr[int(0, arr.length - 1)],
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    fork: (label) => makeRng(seed + ':' + label),
  };
  return rng;
}
