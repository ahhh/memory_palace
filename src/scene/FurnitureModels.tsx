import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { Furniture, Level } from '../model/schema';
import { useStore } from '../editor/store';
import { byLevel } from '../model/queries';
import { CATALOG, MODELS, modelUrl, type ModelSpec } from '../catalog/furniture';

interface Fit { scale: THREE.Vector3; offset: THREE.Vector3; rotY: number }

const fitCache = new Map<string, Fit>();

/** Uniformly fit a model inside the item's frozen footprint (w × d × h), feet on the floor. */
function computeFit(cat: string, spec: ModelSpec, scene: THREE.Object3D): Fit {
  const key = cat;
  const hit = fitCache.get(key);
  if (hit) return hit;
  const [wcm, dcm, hcm] = CATALOG[cat].dims;
  const rotY = ((spec.rot ?? 0) * Math.PI) / 180;
  const probe = new THREE.Group();
  const inner = scene.clone(true);
  inner.rotation.y = rotY;
  probe.add(inner);
  probe.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(probe);
  const size = box.getSize(new THREE.Vector3());
  const w = wcm / 100, d = dcm / 100;
  const h = hcm / 100 - (spec.pedestal ?? 0) - (spec.lift ?? 0);
  const sxz = Math.min(w / Math.max(size.x, 1e-3), d / Math.max(size.z, 1e-3));
  const syRaw = h / Math.max(size.y, 1e-3);
  const sy = spec.stretch ? syRaw : Math.min(Math.max(syRaw, sxz * 0.75), sxz * 1.35, syRaw);
  const s = spec.pedestal || spec.lift ? Math.min(sxz, syRaw) : sxz;
  const scale = spec.pedestal || spec.lift ? new THREE.Vector3(s, s, s) : new THREE.Vector3(sxz, sy, sxz);
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x * scale.x, -box.min.y * scale.y + (spec.pedestal ?? 0) + (spec.lift ?? 0), -center.z * scale.z);
  const fit = { scale, offset, rotY };
  fitCache.set(key, fit);
  return fit;
}

function ModelItem({ f, level, spec }: { f: Furniture; level: Level; spec: ModelSpec }) {
  const { scene } = useGLTF(modelUrl(spec.file), false, true);
  const fit = computeFit(f.cat, spec, scene);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  const [w, d] = CATALOG[f.cat].dims;
  return (
    <group position={[f.pos[0], level.elevation + (f.dy ?? 0), f.pos[1]]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
      {spec.pedestal ? (
        <mesh position={[0, spec.pedestal / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[(w / 100) * 0.8, spec.pedestal, (d / 100) * 0.8]} />
          <meshStandardMaterial color="#e6e0d4" roughness={0.6} />
        </mesh>
      ) : null}
      <group position={fit.offset} scale={fit.scale}>
        <primitive object={obj} rotation={[0, fit.rotY, 0]} />
      </group>
    </group>
  );
}

/** If a model fails to load, quietly render nothing (the catalog primitives stay off). */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function FurnitureModels({ level }: { level: Level }) {
  const furniture = useStore((s) => s.doc.furniture);
  const items = useMemo(() => byLevel(furniture, level.id).filter((f) => MODELS[f.cat]), [furniture, level.id]);
  return (
    <group>
      {items.map((f) => (
        <Guard key={f.id}>
          <Suspense fallback={null}>
            <ModelItem f={f} level={level} spec={MODELS[f.cat]} />
          </Suspense>
        </Guard>
      ))}
    </group>
  );
}

export const hasModel = (cat: string) => !!MODELS[cat];
