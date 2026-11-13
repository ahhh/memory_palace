import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Id, Level } from '../model/schema';
import { useStore } from '../editor/store';
import { buildLevelMeshes } from '../geom/levelMesh';
import { buildRoofs } from '../geom/roofMesh';
import { glassMat, roofMat, solidMat } from './materials';
import { useActiveLevel, useBounds, useLevels } from './hooks';
import { byLevel, roomsBesideWall, wallLength, wallNormal, wallPoint } from '../model/queries';

function LevelView({ level, cut, allCut }: { level: Level; cut?: Set<Id>; allCut?: boolean }) {
  const doc = useStore((s) => s.doc);
  const deps = [doc.walls, doc.openings, doc.rooms, doc.slabs, doc.stairs, doc.masses, doc.furniture, doc.levels, level];
  const cutKey = allCut ? 'all' : cut ? [...cut].sort().join(',') : '';
  const meshes = useMemo(
    () => buildLevelMeshes(useStore.getState().doc, level, { cut, allCut, cutHeight: 0.45 }),
     
    [...deps, cutKey],
  );
  useEffect(() => () => { meshes.solid.dispose(); meshes.glass.dispose(); }, [meshes]);
  return (
    <group>
      <mesh geometry={meshes.solid} material={solidMat} castShadow receiveShadow />
      <mesh geometry={meshes.glass} material={glassMat} renderOrder={2} />
    </group>
  );
}

/** Sims-style cutaway: walls between the camera and the interior drop to knee height. */
function useCutaway(level: Level | undefined, enabled: boolean) {
  const camera = useThree((s) => s.camera);
  const doc = useStore((s) => s.doc);
  const bounds = useBounds();
  const [key, setKey] = useState('');
  const last = useRef('');
  useFrame(() => {
    if (!enabled || !level) return;
    const ang = Math.atan2(camera.position.z - bounds.cz, camera.position.x - bounds.cx);
    const bucket = Math.round(ang / (Math.PI / 18)).toString();
    if (bucket !== last.current) { last.current = bucket; setKey(bucket); }
  });
  return useMemo(() => {
    if (!enabled || !level) return undefined;
    const ang = (Number(key) * Math.PI) / 18;
    const dir = [Math.cos(ang), Math.sin(ang)];
    const set = new Set<Id>();
    for (const w of byLevel(doc.walls, level.id)) {
      const mid = wallPoint(w, wallLength(w) / 2);
      const rel = (mid[0] - bounds.cx) * dir[0] + (mid[1] - bounds.cz) * dir[1];
      if (w.exterior) {
        const [pos, neg] = roomsBesideWall(doc, w, wallLength(w) / 2);
        const n = wallNormal(w);
        const s = pos && !neg ? -1 : neg && !pos ? 1 : 0;
        if (s !== 0 && (n[0] * dir[0] + n[1] * dir[1]) * s > 0.2) set.add(w.id);
        else if (s === 0 && rel > 0) set.add(w.id);
      } else if (rel > 0.5) set.add(w.id);
    }
    return set;
  }, [key, enabled, level, doc.walls, doc.rooms, bounds, doc]);
}

export function Building() {
  const mode = useStore((s) => s.ui.mode);
  const wallView = useStore((s) => s.ui.wallView);
  const showRoof = useStore((s) => s.ui.showRoof);
  const roofs = useStore((s) => s.doc.roofs);
  const levelsRec = useStore((s) => s.doc.levels);
  const levels = useLevels();
  const active = useActiveLevel();
  const explore = mode === 'explore';
  const visible = mode === 'walk' || mode === 'tour' ? levels : levels.filter((l) => !active || l.index <= active.index);
  const cut = useCutaway(active, explore && wallView === 'cutaway');
  const isTop = !active || active.index === (levels.at(-1)?.index ?? 0);
  const roofVisible = mode === 'walk' || mode === 'tour' || (explore && showRoof && isTop);
  const roofGeo = useMemo(() => buildRoofs(useStore.getState().doc), [roofs, levelsRec]);
  useEffect(() => () => roofGeo.dispose(), [roofGeo]);
  return (
    <group>
      {visible.map((l) => (
        <LevelView key={l.id} level={l}
          cut={l.id === active?.id && explore ? cut : undefined}
          allCut={explore && wallView === 'down' && l.id === active?.id} />
      ))}
      {roofVisible && <mesh geometry={roofGeo} material={roofMat} castShadow receiveShadow />}
    </group>
  );
}
