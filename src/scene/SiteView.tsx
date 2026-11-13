import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../editor/store';
import { buildPlants, buildTerrain, buildWater } from '../geom/site';
import { foamMat, solidMat, terrainMat, waterMat } from './materials';
import { useHeightFn } from './hooks';

export function SiteView() {
  const height = useHeightFn();
  const plants = useStore((s) => s.doc.plants);
  const rivers = useStore((s) => s.doc.rivers);
  const ponds = useStore((s) => s.doc.ponds);
  const terrain = useMemo(() => buildTerrain(useStore.getState().doc, height), [height]);
  const water = useMemo(() => buildWater(useStore.getState().doc), [rivers, ponds]);
  const trees = useMemo(() => buildPlants(useStore.getState().doc, height), [plants, height]);
  useEffect(() => () => { terrain.dispose(); trees.dispose(); water.surface.dispose(); water.foam.dispose(); }, [terrain, trees, water]);
  useFrame((_, dt) => { waterMat.uniforms.uTime.value += dt; });
  return (
    <group>
      <mesh geometry={terrain} material={terrainMat} receiveShadow />
      <mesh geometry={water.surface} material={waterMat} renderOrder={1} />
      <mesh geometry={water.foam} material={foamMat} />
      <mesh geometry={trees} material={solidMat} castShadow />
    </group>
  );
}
