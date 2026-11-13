/** Tiny event bus so DOM overlay buttons can drive camera controllers inside the Canvas. */
type CamEvent =
  | { type: 'orbit'; dTheta?: number; dPhi?: number; zoom?: number; reset?: boolean }
  | { type: 'step'; dist: number }
  | { type: 'turn'; deg: number };

const listeners = new Set<(e: CamEvent) => void>();
export const camBus = {
  emit: (e: CamEvent) => listeners.forEach((l) => l(e)),
  on: (l: (e: CamEvent) => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** Touch-first device (phones/tablets): no hover, no pointer lock, no press-and-hold. */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
