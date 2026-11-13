import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls, OrbitControls, OrthographicCamera, PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import type { PalaceDoc, V2, V3 } from '../model/schema';
import { useStore } from '../editor/store';
import { useActiveLevel, useBounds, useHeightFn } from './hooks';
import { buildColliders, groundAt, levelAtHeight, resolve, type Seg } from '../walk/collision';
import { anchorNode, OUT, roomGraph, routeBetween } from '../journey/graph';
import { camBus, isTouchDevice } from './bus';
import { doorLinks } from '../model/queries';

const EYE = 1.6;

const CAM_KEYS = new Set(['Home', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract', 'ShiftLeft', 'ShiftRight']);

/** Held camera keys, ignoring typing in fields and open dialogs. */
function useCameraKeys() {
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.('input,textarea,select') || !!useStore.getState().ui.dialog;
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || !CAM_KEYS.has(e.code)) return;
      keys.current[e.code] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const clear = () => { keys.current = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  return keys;
}

/** Ground-plane pan vector from arrow keys, relative to where the camera looks. */
function arrowPan(k: Record<string, boolean>, cam: THREE.Camera, target: THREE.Vector3, dist: number): THREE.Vector3 | null {
  const f = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
  const r = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
  if (!f && !r) return null;
  const fwd = target.clone().sub(cam.position).setY(0);
  if (fwd.lengthSq() < 1e-6) cam.getWorldDirection(fwd).setY(0);
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  return fwd.multiplyScalar(f).add(right.multiplyScalar(r)).normalize().multiplyScalar(dist);
}

function BuildCamera() {
  const bounds = useBounds();
  const level = useActiveLevel();
  const size = useThree((s) => s.size);
  // Frame the house once when entering Build; edits must not move the camera.
  const [init] = useState(() => ({ b: bounds, zoom: Math.min(size.width, size.height) / (bounds.size * 1.35) }));
  const controls = useRef<React.ComponentRef<typeof MapControls>>(null);
  const keys = useCameraKeys();
  const y = level?.elevation ?? 0;
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || useStore.getState().ui.multi.length) return; // arrows nudge the selection instead
    const cam = c.object as THREE.OrthographicCamera;
    const k = keys.current;
    // Screen-up is -z in the plan view; pan speed is constant on screen.
    const dx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), dz = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    if (!dx && !dz) return;
    const sp = (600 / cam.zoom) * Math.min(dt, 0.05) * (k.ShiftLeft || k.ShiftRight ? 2.5 : 1);
    c.target.x += dx * sp; c.target.z += dz * sp;
    cam.position.x += dx * sp; cam.position.z += dz * sp;
    c.update();
  });
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
        touches={{ ONE: -1 as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN }}
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
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  // Portrait phones see less width, so start further back.
  const [d] = useState(() => b.size * Math.max(1, Math.min(2.2, 1.25 / aspect)));
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const home = useMemo(() => ({ pos: new THREE.Vector3(b.cx + d * 1.15, b.top + d * 1.05, b.cz + d * 1.55), target: new THREE.Vector3(b.cx, ty, b.cz) }), [b, d, ty]);
  // Pending tap-button orbit changes, eased in over a few frames.
  const pending = useRef({ theta: 0, phi: 0, zoom: 1, reset: false });
  useEffect(() => camBus.on((e) => {
    if (e.type !== 'orbit') return;
    const p = pending.current;
    if (e.reset) p.reset = true;
    p.theta += e.dTheta ?? 0;
    p.phi += e.dPhi ?? 0;
    p.zoom *= e.zoom ?? 1;
  }), []);
  const keys = useCameraKeys();
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const p = pending.current;
    const cam = c.object;
    // Keyboard: arrows pan, Shift+arrows orbit/tilt, Q/E rotate, +/− zoom.
    const k = keys.current;
    const step = Math.min(dt, 0.05);
    const shift = k.ShiftLeft || k.ShiftRight;
    if (shift) {
      p.theta += ((k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)) * 1.6 * step;
      p.phi += ((k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0)) * 1.0 * step;
    } else {
      const radius = cam.position.distanceTo(c.target);
      const pan = arrowPan(k, cam, c.target, Math.max(4, radius) * 0.8 * step);
      if (pan) { c.target.add(pan); cam.position.add(pan); c.update(); }
    }
    p.theta += ((k.KeyQ ? 1 : 0) - (k.KeyE ? 1 : 0)) * 1.6 * step;
    if (k.Equal || k.NumpadAdd) p.zoom *= Math.pow(0.35, step);
    if (k.Minus || k.NumpadSubtract) p.zoom *= Math.pow(1 / 0.35, step);
    if (k.Home) { k.Home = false; p.reset = true; }
    if (p.reset) {
      p.reset = false; p.theta = 0; p.phi = 0; p.zoom = 1;
      cam.position.copy(home.pos); c.target.copy(home.target); c.update();
      return;
    }
    if (Math.abs(p.theta) < 1e-4 && Math.abs(p.phi) < 1e-4 && Math.abs(p.zoom - 1) < 1e-4) return;
    const ease = Math.min(1, dt * 8);
    const off = cam.position.clone().sub(c.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    const dth = p.theta * ease, dph = p.phi * ease;
    const z = Math.pow(p.zoom, ease);
    sph.theta += dth;
    sph.phi = Math.min(1.5, Math.max(0.08, sph.phi + dph));
    sph.radius = Math.min(d * 6, Math.max(2, sph.radius * z));
    p.theta -= dth; p.phi -= dph; p.zoom /= z;
    cam.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
    c.update();
  });
  return (
    <>
      <PerspectiveCamera makeDefault fov={40} position={home.pos.toArray()} near={0.1} far={3000} />
      <OrbitControls ref={controls} makeDefault target={home.target.toArray()} maxPolarAngle={1.5} enableDamping dampingFactor={0.12} minDistance={2} maxDistance={Math.max(60, d * 6)} />
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
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const segs = useColliders();
  const height = useHeightFn();
  const keys = useRef<Record<string, boolean>>({});
  const feet = useRef(0);
  const lastCard = useRef<string | null>(null);
  const [touch] = useState(isTouchDevice);
  // Touch mode keeps its own yaw/pitch; targets are set by taps and buttons (no holding needed).
  const look = useRef({ yaw: 0, pitch: 0, yawTarget: 0 });
  const goal = useRef<{ p: V2; stuck: number } | null>(null);

  useEffect(() => {
    const camera = cam.current!;
    const sp = spawnPoint(useStore.getState().doc, segs);
    camera.position.set(...sp.eye);
    camera.lookAt(...sp.look);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    look.current = { yaw: e.y, pitch: e.x, yawTarget: e.y };
    feet.current = sp.eye[1] - EYE;
    const down = (ev: KeyboardEvent) => { keys.current[ev.code] = true; };
    const up = (ev: KeyboardEvent) => { keys.current[ev.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const off = camBus.on((ev) => {
      const camera = cam.current;
      if (!camera) return;
      if (ev.type === 'turn') look.current.yawTarget += (ev.deg * Math.PI) / 180;
      if (ev.type === 'step') {
        const yaw = look.current.yawTarget;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        goal.current = { p: [camera.position.x + fx * ev.dist, camera.position.z + fz * ev.dist], stuck: 0 };
      }
    });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); off(); };
     
  }, []);

  // Touch: swipe to look around, tap the floor to walk there.
  useEffect(() => {
    if (!touch) return;
    const el = gl.domElement;
    let start: { x: number; y: number; t: number; lx: number; ly: number } | null = null;
    const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => { start = { x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY }; };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.lx, dy = e.clientY - start.ly;
      start.lx = e.clientX; start.ly = e.clientY;
      look.current.yaw += dx * 0.005;
      look.current.yawTarget = look.current.yaw;
      look.current.pitch = Math.max(-1.2, Math.min(1.2, look.current.pitch + dy * 0.005));
    };
    const onUp = (e: PointerEvent) => {
      const s = start;
      start = null;
      const camera = cam.current;
      if (!s || !camera) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10 || performance.now() - s.t > 600) return;
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.distance > 0.3 && h.face && h.object.type === 'Mesh');
      if (!hit || hit.distance > 40) return;
      const n = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
      // Floors: walk to the spot. Walls/furniture: stop half a meter in front of them.
      const p: V2 = n.y > 0.6 ? [hit.point.x, hit.point.z] : [hit.point.x + n.x * 0.5, hit.point.z + n.z * 0.5];
      goal.current = { p, stuck: 0 };
      look.current.yawTarget = Math.atan2(-(p[0] - camera.position.x), -(p[1] - camera.position.z));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { start = null; });
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); };
  }, [touch, gl, scene]);

  const fwd = new THREE.Vector3();
  useFrame((_, dtRaw) => {
    const camera = cam.current;
    if (!camera) return;
    const dt = Math.min(dtRaw, 0.05);
    // Ease the touch view toward its yaw target, then apply yaw/pitch.
    if (touch || goal.current || Math.abs(look.current.yawTarget - look.current.yaw) > 1e-3) {
      const L = look.current;
      L.yaw += (L.yawTarget - L.yaw) * Math.min(1, dt * 6);
      if (touch || Math.abs(L.yawTarget - L.yaw) > 1e-3) camera.quaternion.setFromEuler(new THREE.Euler(L.pitch, L.yaw, 0, 'YXZ'));
    }
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
    let p: V2 = [camera.position.x, camera.position.z];
    const g0 = goal.current;
    if (g0 && !mx && !mz) {
      const dx = g0.p[0] - p[0], dz = g0.p[1] - p[1];
      const dd = Math.hypot(dx, dz);
      if (dd < 0.15) goal.current = null;
      else { mx = dx / dd; mz = dz / dd; }
    } else if (mx || mz) goal.current = null;
    const l = Math.hypot(mx, mz);
    if (l > 0) {
      const before = p;
      p = [p[0] + (mx / l) * speed, p[1] + (mz / l) * speed];
      p = resolve(p, 0.25, feet.current, segs);
      if (goal.current) {
        const moved = Math.hypot(p[0] - before[0], p[1] - before[1]);
        goal.current.stuck = moved < speed * 0.25 ? goal.current.stuck + dt : 0;
        if (goal.current.stuck > 0.35) goal.current = null;
      }
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
      {!touch && <PointerLockControls selector="#walk-start" />}
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
