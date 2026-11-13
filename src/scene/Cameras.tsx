import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls, OrbitControls, OrthographicCamera, PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import type { PalaceDoc, V2, V3 } from '../model/schema';
import { useStore } from '../editor/store';
import { useActiveLevel, useBounds, useHeightFn } from './hooks';
import { buildColliders, groundAt, levelAtHeight, resolve, type Seg } from '../walk/collision';
import { anchorNode, OUT, roomGraph, routeBetween } from '../journey/graph';
import { doorLinks } from '../model/queries';

const EYE = 1.6;

function BuildCamera() {
  const bounds = useBounds();
  const level = useActiveLevel();
  const size = useThree((s) => s.size);
  // Frame the house once when entering Build; edits must not move the camera.
  const [init] = useState(() => ({ b: bounds, zoom: Math.min(size.width, size.height) / (bounds.size * 1.35) }));
  const controls = useRef<React.ComponentRef<typeof MapControls>>(null);
  const y = level?.elevation ?? 0;
  // Keep the camera above the active floor when switching floors.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const dy = y - c.target.y;
    c.target.y += dy;
    c.object.position.y += dy;
    c.update();
  }, [y]);
  return (
    <>
      <OrthographicCamera makeDefault position={[init.b.cx, y + 60, init.b.cz + 0.001]} zoom={init.zoom} near={0.1} far={500} />
      <MapControls
        ref={controls}
        makeDefault
        target={[init.b.cx, y, init.b.cz]}
        enableRotate={false}
        minPolarAngle={0}
        maxPolarAngle={0}
        screenSpacePanning
        mouseButtons={{ LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
        minZoom={4}
        maxZoom={400}
      />
    </>
  );
}

function ExploreCamera() {
  const bounds = useBounds();
  const level = useActiveLevel();
  const [b] = useState(bounds);
  const [ty] = useState((level?.elevation ?? 0) + 1);
  const d = b.size;
  return (
    <>
      <PerspectiveCamera makeDefault fov={40} position={[b.cx + d * 1.15, b.top + d * 1.05, b.cz + d * 1.55]} near={0.1} far={3000} />
      <OrbitControls makeDefault target={[b.cx, ty, b.cz]} maxPolarAngle={1.5} enableDamping dampingFactor={0.12} minDistance={2} maxDistance={Math.max(60, d * 6)} />
    </>
  );
}

/** A spot ~1.5 m in front of an anchor (toward where you approach it from) at eye height. */
export function anchorViewpoint(doc: PalaceDoc, id: string, segs: Seg[]): { eye: V3; look: V3 } | null {
  const a = doc.anchors[id];
  const lv = a && doc.levels[a.level];
  if (!a || !lv) return null;
  const look: V3 = [a.pos[0], lv.elevation + a.pos[1], a.pos[2]];
  const r = (a.facing * Math.PI) / 180;
  const back: V2 = [-Math.cos(r), -Math.sin(r)];
  for (const k of [1.8, 1.4, 1.0, 0.6]) {
    const p: V2 = [a.pos[0] + back[0] * k, a.pos[2] + back[1] * k];
    const blocked = segs.some((s) => s.y0 <= lv.elevation + 1 && s.y1 >= lv.elevation + 1 && s.r > 0.03 && segIntersect([a.pos[0], a.pos[2]], p, s.a, s.b));
    if (!blocked) {
      const fixed = resolve(p, 0.25, lv.elevation, segs);
      return { eye: [fixed[0], lv.elevation + EYE, fixed[1]], look };
    }
  }
  return { eye: [a.pos[0] + back[0] * 0.5, lv.elevation + EYE, a.pos[2] + back[1] * 0.5], look };
}

function segIntersect(p1: V2, p2: V2, p3: V2, p4: V2) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function useColliders() {
  const walls = useStore((s) => s.doc.walls);
  const openings = useStore((s) => s.doc.openings);
  const furniture = useStore((s) => s.doc.furniture);
  const masses = useStore((s) => s.doc.masses);
  return useMemo(() => buildColliders(useStore.getState().doc), [walls, openings, furniture, masses]);
}

function spawnPoint(doc: PalaceDoc, segs: Seg[]): { eye: V3; look: V3 } {
  if (doc.journey[0]) {
    const vp = anchorViewpoint(doc, doc.journey[0], segs);
    if (vp) return vp;
  }
  const front = doorLinks(doc).find((d) => (!d.a || !d.b) && doc.levels[d.wall.level]?.index === 0);
  if (front) {
    const room = front.a ?? front.b!;
    const c = room.polygon.reduce((s, p) => [s[0] + p[0] / room.polygon.length, s[1] + p[1] / room.polygon.length], [0, 0]);
    const dx = front.point[0] - c[0], dz = front.point[1] - c[1];
    const l = Math.hypot(dx, dz) || 1;
    const y = doc.levels[front.wall.level].elevation;
    return { eye: [front.point[0] + (dx / l) * 2.5, y + EYE, front.point[1] + (dz / l) * 2.5], look: [c[0], y + EYE, c[1]] };
  }
  return { eye: [0, EYE, 10], look: [0, EYE, 0] };
}

function WalkCamera() {
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const doc = useStore((s) => s.doc);
  const setUi = useStore((s) => s.setUi);
  const segs = useColliders();
  const height = useHeightFn();
  const keys = useRef<Record<string, boolean>>({});
  const feet = useRef(0);
  const lastCard = useRef<string | null>(null);

  useEffect(() => {
    const camera = cam.current!;
    const sp = spawnPoint(useStore.getState().doc, segs);
    camera.position.set(...sp.eye);
    camera.lookAt(...sp.look);
    feet.current = sp.eye[1] - EYE;
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
     
  }, []);

  const fwd = new THREE.Vector3();
  useFrame((_, dtRaw) => {
    const camera = cam.current;
    if (!camera) return;
    const dt = Math.min(dtRaw, 0.05);
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? 5.5 : 2.6) * dt;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let mx = 0, mz = 0;
    if (k.KeyW || k.ArrowUp) { mx += fwd.x; mz += fwd.z; }
    if (k.KeyS || k.ArrowDown) { mx -= fwd.x; mz -= fwd.z; }
    if (k.KeyD || k.ArrowRight) { mx += right.x; mz += right.z; }
    if (k.KeyA || k.ArrowLeft) { mx -= right.x; mz -= right.z; }
    const l = Math.hypot(mx, mz);
    let p: V2 = [camera.position.x, camera.position.z];
    if (l > 0) {
      p = [p[0] + (mx / l) * speed, p[1] + (mz / l) * speed];
      p = resolve(p, 0.25, feet.current, segs);
    }
    const g = groundAt(doc, p, feet.current, height);
    feet.current += (g - feet.current) * Math.min(1, dt * 14);
    camera.position.set(p[0], feet.current + EYE, p[1]);
    // Pop up the card for a nearby anchor.
    let near: string | null = null, nd = 2.2;
    for (const a of Object.values(doc.anchors)) {
      const lv = doc.levels[a.level];
      if (!lv || Math.abs(lv.elevation - feet.current) > 1.2) continue;
      const d = Math.hypot(a.pos[0] - p[0], a.pos[2] - p[1]);
      if (d < nd) { nd = d; near = a.id; }
    }
    if (near !== lastCard.current) { lastCard.current = near; setUi({ openAnchor: near }); }
    const lv = levelAtHeight(doc, feet.current);
    if (lv && lv.id !== useStore.getState().ui.activeLevel) setUi({ activeLevel: lv.id });
  });

  return (
    <>
      <PerspectiveCamera ref={cam} makeDefault fov={70} near={0.05} far={3000} />
      <PointerLockControls selector="#walk-start" />
    </>
  );
}

function TourCamera() {
  const prevCamera = useThree((s) => s.camera);
  const [startPos] = useState(() => prevCamera.position.toArray() as V3);
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const doc = useStore((s) => s.doc);
  const idx = useStore((s) => s.ui.tourIndex);
  const segs = useColliders();
  const anim = useRef<{ curve: THREE.CatmullRomCurve3; t: number; dur: number; look: THREE.Vector3; startLook: THREE.Vector3 } | null>(null);
  const prevIdx = useRef<number | null>(null);
  const curLook = useRef(new THREE.Vector3());

  useEffect(() => {
    const id = doc.journey[idx];
    const camera = cam.current;
    if (!id || !camera) return;
    const vp = anchorViewpoint(doc, id, segs);
    if (!vp) return;
    const pts: THREE.Vector3[] = [camera.position.clone()];
    const from = prevIdx.current !== null && prevIdx.current !== idx ? doc.journey[prevIdx.current] : null;
    if (from) {
      const g = roomGraph(doc);
      const a = anchorNode(doc, from), b = anchorNode(doc, id);
      if (a !== OUT || b !== OUT) for (const w of routeBetween(g, a, b)) pts.push(new THREE.Vector3(w[0], w[1] + EYE, w[2]));
    }
    pts.push(new THREE.Vector3(...vp.eye));
    // Drop near-duplicate points (Catmull-Rom dislikes them).
    const clean = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.2);
    if (clean.length < 2) clean.push(new THREE.Vector3(...vp.eye).add(new THREE.Vector3(0, 0.01, 0)));
    const curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
    const dur = from ? Math.max(1.2, Math.min(7, curve.getLength() / 2.4)) : Math.max(1.5, Math.min(3.5, curve.getLength() / 12));
    const startLook = curLook.current.lengthSq() > 0 ? curLook.current.clone() : new THREE.Vector3(...vp.look);
    anim.current = { curve, t: 0, dur, look: new THREE.Vector3(...vp.look), startLook };
    prevIdx.current = idx;
     
  }, [idx, doc.journey]);

  useFrame((_, dt) => {
    const a = anim.current;
    const camera = cam.current;
    if (!a || !camera) return;
    a.t = Math.min(1, a.t + dt / a.dur);
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - (-2 * a.t + 2) ** 2 / 2;
    const p = a.curve.getPointAt(e);
    camera.position.copy(p);
    const ahead = a.curve.getPointAt(Math.min(1, e + 0.05));
    const dir = ahead.clone().sub(p).setY(0);
    const tangentLook = dir.lengthSq() > 1e-6 ? ahead.clone().add(dir.normalize().multiplyScalar(2)) : a.look.clone();
    const w = Math.min(1, Math.max(0, (e - 0.55) / 0.4));
    const base = a.t < 0.15 ? a.startLook.clone().lerp(tangentLook, a.t / 0.15) : tangentLook;
    curLook.current.copy(base.lerp(a.look, w));
    camera.lookAt(curLook.current);
  });

  return <PerspectiveCamera ref={cam} makeDefault fov={62} near={0.05} far={3000} position={startPos} />;
}

export function Cameras() {
  const mode = useStore((s) => s.ui.mode);
  if (mode === 'build') return <BuildCamera />;
  if (mode === 'walk') return <WalkCamera />;
  if (mode === 'tour') return <TourCamera />;
  return <ExploreCamera />;
}
