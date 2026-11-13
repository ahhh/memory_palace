import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { V3 } from '../model/schema';
import { useStore } from '../editor/store';
import { useActiveLevel } from './hooks';
import { anchorNode, roomGraph, routeBetween } from '../journey/graph';

const ORB = '#ffcf4a';

export function Anchors() {
  const anchors = useStore((s) => s.doc.anchors);
  const journey = useStore((s) => s.doc.journey);
  const levels = useStore((s) => s.doc.levels);
  const mode = useStore((s) => s.ui.mode);
  const sel = useStore((s) => s.ui.selection);
  const openAnchor = useStore((s) => s.ui.openAnchor);
  const tourIndex = useStore((s) => s.ui.tourIndex);
  const setUi = useStore((s) => s.setUi);
  const active = useActiveLevel();
  const tourLevel = anchors[journey[tourIndex]]?.level;
  const order = useMemo(() => new Map(journey.map((id, i) => [id, i + 1])), [journey]);
  const visible = Object.values(anchors).filter((a) => {
    const lv = levels[a.level];
    if (!lv) return false;
    if (mode === 'build') return a.level === active?.id;
    if (mode === 'explore') return !active || lv.index <= active.index;
    return true;
  });
  return (
    <group>
      {visible.map((a) => {
        const lv = levels[a.level];
        const pos: V3 = [a.pos[0], lv.elevation + a.pos[1], a.pos[2]];
        const n = order.get(a.id);
        const isSel = sel?.id === a.id || openAnchor === a.id || (mode === 'tour' && journey[tourIndex] === a.id);
        return (
          <group key={a.id} position={pos}>
            <mesh
              onClick={(e) => {
                if (mode !== 'explore') return;
                e.stopPropagation();
                setUi({ openAnchor: a.id });
              }}
            >
              <icosahedronGeometry args={[isSel ? 0.22 : 0.16, 1]} />
              <meshStandardMaterial color={ORB} emissive={ORB} emissiveIntensity={isSel ? 1.6 : 0.8} toneMapped={false} />
            </mesh>
            <mesh position={[0, -a.pos[1] / 2, 0]}>
              <cylinderGeometry args={[0.01, 0.01, a.pos[1], 4]} />
              <meshBasicMaterial color={ORB} transparent opacity={0.5} />
            </mesh>
            {(mode === 'build' || mode === 'explore' || (mode === 'tour' && a.level === tourLevel)) && (
              <Html center position={[0, 0.38, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
                <div className={`anchor-badge${isSel ? ' sel' : ''}`}>{n ?? '•'}</div>
              </Html>
            )}
          </group>
        );
      })}
      {mode === 'explore' && <RouteLine />}
    </group>
  );
}

function RouteLine() {
  const doc = useStore((s) => s.doc);
  const show = useStore((s) => s.ui.showRoute);
  const pts = useMemo(() => {
    if (!show || doc.journey.length < 2) return null;
    const g = roomGraph(doc);
    const out: V3[] = [];
    const posOf = (id: string): V3 | null => {
      const a = doc.anchors[id];
      const lv = a && doc.levels[a.level];
      return a && lv ? [a.pos[0], lv.elevation + 0.15, a.pos[2]] : null;
    };
    for (let i = 0; i < doc.journey.length; i++) {
      const p = posOf(doc.journey[i]);
      if (!p) continue;
      if (i > 0) {
        const via = routeBetween(g, anchorNode(doc, doc.journey[i - 1]), anchorNode(doc, doc.journey[i]));
        for (const v of via) out.push([v[0], v[1] + 0.15, v[2]]);
      }
      out.push(p);
    }
    return out.length >= 2 ? out : null;
  }, [doc, show]);
  if (!pts) return null;
  return <Line points={pts} color="#ffb703" lineWidth={2.5} dashed dashSize={0.4} gapSize={0.25} />;
}
