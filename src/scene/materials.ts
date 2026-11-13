import * as THREE from 'three';

export const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 });
export const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
export const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
export const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
export const foamMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.4, side: THREE.DoubleSide });
export const ghostMat = new THREE.MeshStandardMaterial({ color: '#5aa9e6', transparent: true, opacity: 0.45, depthWrite: false });
export const badGhostMat = new THREE.MeshStandardMaterial({ color: '#e65a5a', transparent: true, opacity: 0.45, depthWrite: false });
export const ghostVertexMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });

export const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#1f5670') }, uShallow: { value: new THREE.Color('#5fa3b8') }, uSky: { value: new THREE.Color('#cfe6f0') } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
    varying vec3 vWorld;
    void main() {
      vec2 p = vWorld.xz;
      float r = sin(p.x * 1.7 + uTime * 1.3) * 0.5 + sin(p.y * 2.3 - uTime * 1.1) * 0.5
              + sin((p.x + p.y) * 3.1 + uTime * 2.0) * 0.25;
      vec3 n = normalize(vec3(0.08 * cos(p.x * 1.7 + uTime), 1.0, 0.08 * cos(p.y * 2.3 - uTime)));
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      vec3 col = mix(uDeep, uShallow, 0.45 + 0.15 * r);
      col = mix(col, uSky, fres * 0.6);
      float spec = pow(max(dot(reflect(-v, n), normalize(vec3(0.4, 1.0, 0.3))), 0.0), 60.0);
      gl_FragColor = vec4(col + spec * 0.6, 0.86);
      #include <colorspace_fragment>
    }`,
});
