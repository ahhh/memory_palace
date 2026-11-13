/**
 * Animated otters. Each `otter` furniture item swims in the nearest water: along a river
 * (back and forth over its whole course, so they pass under houses the river runs through)
 * or in loops around a pond. Too far from water, an otter just sits and breathes.
 * Render-only: nothing here touches the document.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Furniture, PalaceDoc, V2 } from '../model/schema';
import { useStore } from '../editor/store';
import { addFurnitureItem } from '../geom/levelMesh';
import { MeshBuilder } from '../geom/meshBuilder';
import { centroid, pointInPolygon } from '../model/geometry2d';
import { solidMat } from './materials';

type P3 = [number, number, number];
interface Swim { pts: P3[]; cum: number[]; len: number; loop: boolean; s0: number; speed: number; dir: 1 | -1; sway: number; phase: number }
interface Rest { x: number; y: number; z: number; rot: number; phase: number }

const REACH = 8; // meters: how far an otter will go to find water

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function path(pts: P3[], loop: boolean) {
  const all = loop ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < all.length; i++) cum.push(cum[i - 1] + Math.hypot(all[i][0] - all[i - 1][0], all[i][2] - all[i - 1][2]));
  return { pts: all, cum, len: cum[cum.length - 1] || 1 };
}

/** Distance along the polyline of the point nearest p, and the plan distance to it. */
function project(pts: P3[], cum: number[], p: V2) {
  let best = { d: Infinity, s: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, , az] = pts[i], [bx, , bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2));
    const d = Math.hypot(p[0] - ax - dx * t, p[1] - az - dz * t);
    if (d < best.d) best = { d, s: cum[i] + (cum[i + 1] - cum[i]) * t };
  }
  return best;
}

function sample(sw: Swim, s: number) {
  let i = 1;
  while (i < sw.cum.length - 1 && sw.cum[i] < s) i++;
  const a = sw.pts[i - 1], b = sw.pts[i];
  const t = (s - sw.cum[i - 1]) / ((sw.cum[i] - sw.cum[i - 1]) || 1);
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
  return { x: a[0] + dx * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + dz * t, ux: dx / l, uz: dz / l };
}

function plan(doc: PalaceDoc, f: Furniture): Swim | Rest {
  const h = hash(f.id);
  let best: { d: number; make: () => Swim } | null = null;
  for (const r of Object.values(doc.rivers)) {
    const p = path(r.pts as P3[], false);
    const { d, s } = project(p.pts, p.cum, f.pos);
    if (d < r.width / 2 + REACH && (!best || d < best.d)) {
      best = { d, make: () => ({ ...p, loop: false, s0: s, speed: 0.75 + h * 0.5, dir: h > 0.5 ? 1 : -1, sway: Math.max(0, r.width / 2 - 0.9) * 0.45, phase: h * 50 }) };
    }
  }
  for (const pd of Object.values(doc.ponds)) {
    const c = centroid(pd.polygon);
    const inside = pointInPolygon(f.pos, pd.polygon);
    const d = inside ? 0 : Math.min(...pd.polygon.map((q) => Math.hypot(q[0] - f.pos[0], q[1] - f.pos[1])));
    if (d > REACH || (best && d >= best.d)) continue;
    // Loop through the otter's spot, at the same relative distance from the middle.
    const k = inside
      ? Math.min(0.85, Math.max(0.25, Math.hypot(f.pos[0] - c[0], f.pos[1] - c[1]) / Math.max(0.5, ...pd.polygon.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])))))
      : 0.6;
    const pts = pd.polygon.map((q): P3 => [c[0] + (q[0] - c[0]) * k, pd.y, c[1] + (q[1] - c[1]) * k]);
    best = {
      d, make: () => {
        const p = path(pts, true);
        return { ...p, loop: true, s0: project(p.pts, p.cum, f.pos).s, speed: 0.5 + h * 0.4, dir: h > 0.5 ? 1 : -1, sway: 0.4, phase: h * 50 };
      },
    };
  }
  if (best) return best.make();
  const lv = doc.levels[f.level];
  return { x: f.pos[0], y: (lv?.elevation ?? 0) + (f.dy ?? 0), z: f.pos[1], rot: f.rot, phase: h * 50 };
}

function Otter({ geo, motion }: { geo: THREE.BufferGeometry; motion: Swim | Rest }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    t.current += Math.min(dt, 0.1);
    const time = t.current + motion.phase;
    if (!('pts' in motion)) {
      m.position.set(motion.x, motion.y, motion.z);
      m.rotation.set(0, (-motion.rot * Math.PI) / 180, 0);
      m.scale.set(1, 1 + 0.03 * Math.sin(time * 2.5), 1);
      return;
    }
    const sw = motion;
    let s = sw.s0 + sw.dir * sw.speed * t.current;
    let back = false;
    if (sw.loop) s = ((s % sw.len) + sw.len) % sw.len;
    else {
      // Ping-pong along the river.
      const period = 2 * sw.len;
      const u = ((s % period) + period) % period;
      back = u > sw.len;
      s = back ? period - u : u;
    }
    const q = sample(sw, s);
    const fwd = (sw.dir === 1) !== back ? 1 : -1;
    const hx = q.ux * fwd, hz = q.uz * fwd;
    // Meander across the channel; porpoise-dive every ~11 s.
    const off = sw.sway * Math.sin(time * 0.37);
    const dive = Math.max(0, Math.sin(time * 0.57) - 0.93) / 0.07;
    m.position.set(q.x - hz * off, q.y - 0.12 + 0.025 * Math.sin(time * 3.1) - dive * 0.35, q.z + hx * off);
    const yaw = Math.atan2(hz, hx) + 0.18 * Math.sin(time * 2.2) + 0.25 * Math.cos(time * 0.37) * Math.sign(sw.sway);
    m.rotation.set(0, -yaw, dive * 0.5 * Math.sin(time * 1.3));
  });
  return <mesh ref={ref} geometry={geo} material={solidMat} castShadow />;
}

export function Otters() {
  const furniture = useStore((s) => s.doc.furniture);
  const rivers = useStore((s) => s.doc.rivers);
  const ponds = useStore((s) => s.doc.ponds);
  const geo = useMemo(() => {
    const mb = new MeshBuilder();
    addFurnitureItem(mb, 'otter', 0, 0, 0, 0);
    return mb.build();
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const otters = useMemo(() => {
    const doc = useStore.getState().doc;
    return Object.values(furniture).filter((f) => f.cat === 'otter').map((f) => ({ id: f.id, motion: plan(doc, f) }));
  }, [furniture, rivers, ponds]);
  return <group>{otters.map((o) => <Otter key={o.id} geo={geo} motion={o.motion} />)}</group>;
}
