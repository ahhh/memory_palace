import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Id, V2 } from '../model/schema';
import type { Selection } from '../editor/store';
import { useStore } from '../editor/store';
import { useActiveLevel } from './hooks';
import { snapPoint, type Snap } from '../editor/snap';
import { endpointNear, furnitureContains, nearestWall, pickAt, pickInRect } from '../editor/pick';
import {
  addAnchor, addOpening, addRoomRect, addWall, deleteEntity, isMovable, moveVertex, openingFits, placeFurniture, translateSelection,
} from '../editor/commands';
import { byLevel, wallDir, wallPoint } from '../model/queries';
import { centroid, dist, polygonArea } from '../model/geometry2d';
import { OPENING_DEFAULTS } from '../model/defaults';
import { q } from '../model/units';
import { CATALOG } from '../catalog/furniture';
import { MeshBuilder } from '../geom/meshBuilder';
import { addFurnitureItem } from '../geom/levelMesh';
import { badGhostMat, ghostMat, ghostVertexMat } from './materials';

const SEL = '#2f80ed';

type Gesture =
  | { type: 'move'; start: V2; delta: V2 }
  | { type: 'vertex'; from: V2; to: V2 }
  | { type: 'marquee'; a: V2; b: V2; add: boolean };

/** Furniture placement helper: rotate to back onto a nearby wall and sit flush against it. */
function alignToWall(doc: ReturnType<typeof useStore.getState>['doc'], level: Id, cat: string, p: V2, rot: number): { p: V2; rot: number } {
  const item = CATALOG[cat];
  if (!item) return { p, rot };
  const depth = item.dims[1] / 100;
  const w = nearestWall(doc, level, p, depth / 2 + 0.35);
  if (!w) return { p, rot };
  const wall = doc.walls[w.id];
  const [ux, uz] = wallDir(wall);
  const on = wallPoint(wall, w.offset);
  let nx = uz, nz = -ux;
  if ((p[0] - on[0]) * nx + (p[1] - on[1]) * nz < 0) { nx = -nx; nz = -nz; }
  const off = wall.thickness / 2 + depth / 2 + 0.01;
  // Front (+z local) must face along (nx, nz): rot2([0,1], r) = (-sin r, cos r).
  const r = Math.round((Math.atan2(-nx, nz) * 180) / Math.PI);
  return { p: [q(on[0] + nx * off), q(on[1] + nz * off)], rot: ((r % 360) + 360) % 360 };
}

export function BuildLayer() {
  const level = useActiveLevel();
  const tool = useStore((s) => s.ui.tool);
  const doc = useStore((s) => s.doc);
  const ui = useStore((s) => s.ui);
  const commit = useStore((s) => s.commit);
  const setUi = useStore((s) => s.setUi);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [chain, setChain] = useState<V2 | null>(null);
  const [rectStart, setRectStart] = useState<V2 | null>(null);
  const rot = ui.placeRot;
  const gRef = useRef<Gesture | null>(null);
  const [gesture, setGestureState] = useState<Gesture | null>(null);
  const setGesture = (g: Gesture | null) => { gRef.current = g; setGestureState(g); };
  const y = (level?.elevation ?? 0) + 0.02;

  useEffect(() => { setChain(null); setRectStart(null); }, [tool, level?.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return;
      if (e.key === 'Escape') { setChain(null); setRectStart(null); }
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
        const st = useStore.getState();
        st.setUi({ placeRot: (st.ui.placeRot + (e.shiftKey ? 15 : 90)) % 360 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!level) return null;
  const L = level.id;

  const toPlan = (e: ThreeEvent<PointerEvent>): V2 => [e.point.x, e.point.z];
  const doSnap = (raw: V2, e: ThreeEvent<PointerEvent>, from?: V2 | null) =>
    snapPoint(doc, L, raw, { from, grid: ui.grid, free: !ui.snap || e.nativeEvent.altKey });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const raw = toPlan(e);
    setUi({ cursor: raw });
    const g = gRef.current;
    if (g && tool === 'select') {
      const free = !ui.snap || e.nativeEvent.altKey;
      if (g.type === 'move') {
        const step = free ? 0.01 : ui.grid;
        setGesture({ ...g, delta: [q(Math.round((raw[0] - g.start[0]) / step) * step), q(Math.round((raw[1] - g.start[1]) / step) * step)] });
      } else if (g.type === 'vertex') {
        setGesture({ ...g, to: snapPoint(doc, L, raw, { grid: ui.grid, free }).p });
      } else setGesture({ ...g, b: raw });
      return;
    }
    setSnap(doSnap(raw, e, tool === 'wall' ? chain : null));
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) {
      if (e.button === 2) { setChain(null); setRectStart(null); }
      return;
    }
    e.stopPropagation();
    const raw = toPlan(e);
    const s = doSnap(raw, e, tool === 'wall' ? chain : null);
    switch (tool) {
      case 'select': {
        const shift = e.nativeEvent.shiftKey;
        // 1. Corner handles of selected walls.
        const wallIds = ui.multi.filter((m) => m.kind === 'walls').map((m) => m.id);
        const corner = !shift && endpointNear(doc, wallIds, raw, 0.3);
        if (corner) { setGesture({ type: 'vertex', from: corner, to: corner }); break; }
        const hit = pickAt(doc, L, raw);
        if (!hit) {
          // 2. Empty space: box-select.
          if (!shift) setUi({ selection: null });
          setGesture({ type: 'marquee', a: raw, b: raw, add: shift });
          break;
        }
        const has = ui.multi.some((m) => m.id === hit.id);
        if (shift) {
          // 3. Shift-click toggles membership.
          const multi = has ? ui.multi.filter((m) => m.id !== hit.id) : [...ui.multi, hit];
          setUi({ selection: multi.at(-1) ?? null, multi });
          break;
        }
        // 4. Click (and drag) the whole selection, or a new single item.
        if (has) setUi({ selection: hit, multi: ui.multi });
        else setUi({ selection: hit });
        const multi = has ? ui.multi : [hit];
        if (multi.some((m) => isMovable(m.kind))) setGesture({ type: 'move', start: raw, delta: [0, 0] });
        break;
      }
      case 'wall': {
        if (chain) {
          if (dist(chain, s.p) > 0.05) {
            commit('Wall', (d) => { addWall(d, L, chain, s.p, { material: ui.wallMaterial, height: level.height }); });
            if (e.nativeEvent.detail >= 2) setChain(null); else setChain(s.p);
          } else setChain(null);
        } else setChain(s.p);
        break;
      }
      case 'room':
        setRectStart(s.p);
        break;
      case 'door': case 'window': case 'arch': {
        const w = nearestWall(doc, L, raw);
        if (!w) break;
        const def = OPENING_DEFAULTS[tool];
        const offset = Math.round(w.offset * 20) / 20;
        commit('Opening', (d) => { addOpening(d, w.id, tool, offset, def); });
        break;
      }
      case 'furniture': {
        const a = alignToWall(doc, L, ui.furnitureCat, s.p, rot);
        const aligned = e.nativeEvent.shiftKey ? { p: s.p, rot } : a;
        let id: Id = '';
        commit('Furniture', (d) => { id = placeFurniture(d, L, ui.furnitureCat, aligned.p, aligned.rot); });
        setUi({ selection: { kind: 'furniture', id } });
        void rot;
        break;
      }
      case 'anchor': {
        const hit = byLevel(doc.furniture, L).find((f) => furnitureContains(f.cat, f.pos, f.rot, raw));
        const h = hit ? Math.min((CATALOG[hit.cat]?.dims[2] ?? 80) / 100 + 0.35, level.height - 0.3) : 1.2;
        const p = hit ? hit.pos : s.p;
        let id: Id = '';
        const n = doc.journey.length + 1;
        commit('Anchor', (d) => { id = addAnchor(d, L, [p[0], h, p[1]], `Locus ${n}`); });
        setUi({ selection: { kind: 'anchors', id } });
        break;
      }
      case 'erase': {
        const hit = pickAt(doc, L, raw);
        if (hit && hit.kind !== 'levels') commit('Erase', (d) => deleteEntity(d, hit.kind, hit.id));
        break;
      }
    }
  };

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (tool === 'room' && rectStart && snap) {
      const p1 = snap.p;
      commit('Room', (d) => {
        addRoomRect(d, L, rectStart, p1, { material: ui.wallMaterial, height: level.height, label: 'Room' });
      });
      setRectStart(null);
    }
    const g = gRef.current;
    if (g?.type === 'move' && (g.delta[0] || g.delta[1])) {
      const sels = useStore.getState().ui.multi.filter((m) => isMovable(m.kind));
      commit('Move', (d) => translateSelection(d, sels, g.delta[0], g.delta[1]));
    } else if (g?.type === 'vertex' && dist(g.from, g.to) > 0.005) {
      commit('Move corner', (d) => moveVertex(d, L, g.from, g.to));
    } else if (g?.type === 'marquee' && dist(g.a, g.b) > 0.1) {
      const found = pickInRect(doc, L, g.a, g.b);
      const base = g.add ? ui.multi : [];
      const multi = [...base, ...found.filter((f) => !base.some((m) => m.id === f.id))];
      setUi({ selection: multi.at(-1) ?? null, multi });
    }
    setGesture(null);
    void e;
  };

  return (
    <group>
      <mesh
        position={[0, y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={() => { setSnap(null); setUi({ cursor: null }); }}
        onDoubleClick={() => setChain(null)}
        onContextMenu={(e) => { e.nativeEvent.preventDefault(); setChain(null); }}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {ui.showLabels && <RoomLabels levelId={L} y={y} />}
      <SelectionLayer y={level.elevation} gesture={gesture} levelId={L} h={level.height} />
      {snap && tool !== 'select' && tool !== 'erase' && <SnapMarker p={snap.p} kind={snap.kind} y={y + 0.01} />}
      {tool === 'wall' && chain && snap && <WallPreview a={chain} b={snap.p} y={level.elevation} h={level.height} />}
      {tool === 'room' && rectStart && snap && <RectPreview a={rectStart} b={snap.p} y={level.elevation} h={level.height} />}
      {(tool === 'door' || tool === 'window' || tool === 'arch') && ui.cursor && <OpeningGhost kind={tool} p={ui.cursor} levelId={L} y={level.elevation} />}
      {tool === 'furniture' && snap && <FurnitureGhost cat={ui.furnitureCat} p={snap.p} rot={rot} levelId={L} y={level.elevation} />}
    </group>
  );
}

function SnapMarker({ p, kind, y }: { p: V2; kind: string; y: number }) {
  const color = kind === 'endpoint' ? '#ff7a00' : kind === 'wall' ? '#d63384' : kind === 'angle' ? '#2a9d8f' : '#2f80ed';
  return (
    <mesh position={[p[0], y, p[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.08, 0.14, 20]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function Dim({ a, b, y }: { a: V2; b: V2; y: number }) {
  const L = dist(a, b);
  return (
    <Html position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} center style={{ pointerEvents: 'none' }}>
      <div className="dim">{L.toFixed(2)} m</div>
    </Html>
  );
}

function WallPreview({ a, b, y, h }: { a: V2; b: V2; y: number; h: number }) {
  const L = dist(a, b);
  if (L < 0.01) return null;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return (
    <group>
      <mesh position={[(a[0] + b[0]) / 2, y + h / 2, (a[1] + b[1]) / 2]} rotation={[0, -ang, 0]} material={ghostMat}>
        <boxGeometry args={[L, h, 0.2]} />
      </mesh>
      <Dim a={a} b={b} y={y + h + 0.3} />
    </group>
  );
}

function RectPreview({ a, b, y, h }: { a: V2; b: V2; y: number; h: number }) {
  const w = Math.abs(b[0] - a[0]), d = Math.abs(b[1] - a[1]);
  const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
  return (
    <group>
      <mesh position={[cx, y + 0.05, cz]} material={ghostMat}>
        <boxGeometry args={[w, 0.1, d]} />
      </mesh>
      <mesh position={[cx, y + h / 2, cz]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial color="#5aa9e6" wireframe />
      </mesh>
      <Html position={[cx, y + h + 0.3, cz]} center style={{ pointerEvents: 'none' }}>
        <div className="dim">{w.toFixed(2)} × {d.toFixed(2)} m · {(w * d).toFixed(1)} m²</div>
      </Html>
    </group>
  );
}

function OpeningGhost({ kind, p, levelId, y }: { kind: 'door' | 'window' | 'arch'; p: V2; levelId: Id; y: number }) {
  const doc = useStore((s) => s.doc);
  const w = nearestWall(doc, levelId, p);
  if (!w) return null;
  const wall = doc.walls[w.id];
  const def = OPENING_DEFAULTS[kind];
  const offset = Math.round(w.offset * 20) / 20;
  const ok = openingFits(doc, wall, offset, def.width);
  const c = wallPoint(wall, offset);
  const ang = Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
  return (
    <mesh position={[c[0], y + def.sill + def.height / 2, c[1]]} rotation={[0, -ang, 0]} material={ok ? ghostMat : badGhostMat}>
      <boxGeometry args={[def.width, def.height, wall.thickness + 0.06]} />
    </mesh>
  );
}

function FurnitureGhost({ cat, p, rot, levelId, y }: { cat: string; p: V2; rot: number; levelId: Id; y: number }) {
  const doc = useStore((s) => s.doc);
  const a = alignToWall(doc, levelId, cat, p, rot);
  const geo = useMemo(() => {
    const mb = new MeshBuilder();
    addFurnitureItem(mb, cat, 0, 0, 0, 0);
    return mb.build();
  }, [cat]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={ghostVertexMat} position={[a.p[0], y, a.p[1]]} rotation={[0, (-a.rot * Math.PI) / 180, 0]} />;
}

function RoomLabels({ levelId, y }: { levelId: Id; y: number }) {
  const rooms = useStore((s) => s.doc.rooms);
  const list = useMemo(() => byLevel(rooms, levelId), [rooms, levelId]);
  return (
    <group>
      {list.map((r) => {
        const c = centroid(r.polygon);
        const area = Math.abs(polygonArea(r.polygon));
        return (
          <Html key={r.id} position={[c[0], y + 3.2, c[1]]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
            <div className="room-label">{r.label}<span>{area.toFixed(0)} m²</span></div>
          </Html>
        );
      })}
    </group>
  );
}

function Highlight({ sel, y, off }: { sel: Selection; y: number; off: V2 }) {
  const doc = useStore((s) => s.doc);
  const ox = off[0], oz = off[1];
  if (sel.kind === 'furniture') {
    const f = doc.furniture[sel.id];
    const item = f && CATALOG[f.cat];
    if (!f || !item) return null;
    return (
      <mesh position={[f.pos[0] + ox, y + item.dims[2] / 200, f.pos[1] + oz]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
        <boxGeometry args={[item.dims[0] / 100 + 0.06, item.dims[2] / 100 + 0.06, item.dims[1] / 100 + 0.06]} />
        <meshBasicMaterial color={SEL} wireframe />
      </mesh>
    );
  }
  if (sel.kind === 'walls' || sel.kind === 'openings') {
    const w = sel.kind === 'walls' ? doc.walls[sel.id] : doc.walls[doc.openings[sel.id]?.wall];
    if (!w) return null;
    let a = w.a, b = w.b;
    if (sel.kind === 'openings') {
      const o = doc.openings[sel.id];
      a = wallPoint(w, o.offset - o.width / 2); b = wallPoint(w, o.offset + o.width / 2);
    }
    a = [a[0] + ox, a[1] + oz]; b = [b[0] + ox, b[1] + oz];
    const L = dist(a, b);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return (
      <group>
        <mesh position={[(a[0] + b[0]) / 2, y + w.height / 2, (a[1] + b[1]) / 2]} rotation={[0, -ang, 0]}>
          <boxGeometry args={[L + 0.04, w.height + 0.04, w.thickness + 0.06]} />
          <meshBasicMaterial color={SEL} wireframe />
        </mesh>
        {sel.kind === 'walls' && [a, b].map((p, i) => (
          <mesh key={i} position={[p[0], y + w.height + 0.05, p[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.22, 20]} />
            <meshBasicMaterial color="#ff7a00" depthTest={false} />
          </mesh>
        ))}
      </group>
    );
  }
  const poly = sel.kind === 'rooms' ? doc.rooms[sel.id]?.polygon : sel.kind === 'slabs' ? doc.slabs[sel.id]?.polygon : null;
  if (poly) {
    const pts = poly.map(([x, z]) => new THREE.Vector3(x + ox, y + 0.08, z + oz));
    pts.push(pts[0]);
    return <Line points={pts} color={SEL} lineWidth={3} />;
  }
  const point: V2 | null = sel.kind === 'anchors' && doc.anchors[sel.id] ? [doc.anchors[sel.id].pos[0], doc.anchors[sel.id].pos[2]]
    : sel.kind === 'masses' && doc.masses[sel.id] ? doc.masses[sel.id].center
      : sel.kind === 'stairs' && doc.stairs[sel.id] ? doc.stairs[sel.id].start : null;
  if (!point) return null;
  return (
    <mesh position={[point[0] + ox, y + 0.06, point[1] + oz]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.25, 0.34, 24]} />
      <meshBasicMaterial color={SEL} depthTest={false} />
    </mesh>
  );
}

function SelectionLayer({ y, gesture, levelId, h }: { y: number; gesture: Gesture | null; levelId: Id; h: number }) {
  const multi = useStore((s) => s.ui.multi);
  const doc = useStore((s) => s.doc);
  const off: V2 = gesture?.type === 'move' ? gesture.delta : [0, 0];
  return (
    <group>
      {multi.map((m) => <Highlight key={m.kind + m.id} sel={m} y={y} off={isMovable(m.kind) ? off : [0, 0]} />)}
      {gesture?.type === 'move' && (gesture.delta[0] || gesture.delta[1]) ? (
        <Html position={[gesture.start[0] + off[0], y + h + 0.6, gesture.start[1] + off[1]]} center style={{ pointerEvents: 'none' }}>
          <div className="dim">Δ {off[0].toFixed(2)}, {off[1].toFixed(2)} m</div>
        </Html>
      ) : null}
      {gesture?.type === 'vertex' && byLevel(doc.walls, levelId).filter((w) => dist(w.a, gesture.from) < 0.011 || dist(w.b, gesture.from) < 0.011).map((w) => {
        const other = dist(w.a, gesture.from) < 0.011 ? w.b : w.a;
        return <WallPreview key={w.id} a={other} b={gesture.to} y={y} h={w.height} />;
      })}
      {gesture?.type === 'marquee' && (
        <Line
          points={[[gesture.a[0], y + 0.1, gesture.a[1]], [gesture.b[0], y + 0.1, gesture.a[1]], [gesture.b[0], y + 0.1, gesture.b[1]], [gesture.a[0], y + 0.1, gesture.b[1]], [gesture.a[0], y + 0.1, gesture.a[1]]]}
          color={SEL} lineWidth={1.5} dashed dashSize={0.2} gapSize={0.12}
        />
      )}
    </group>
  );
}
