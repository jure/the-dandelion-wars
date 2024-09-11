import * as THREE from "three";
import vertexShader from "./shaders/grass.vertex.glsl";

export function createGrass(grassCount: number, terrainSize: number) {
  const grassGeometry = new THREE.PlaneGeometry(0.2, 1);
  const grassMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: `
varying vec2 vUv;
void main() { 
    vec3 gc = mix(vec3(0.1, 0.6, 0.1), vec3(0.8, 1.0, 0.2), vUv.y);
    gl_FragColor = vec4(gc, 1.0);
}
    `,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
    },
  });

  const grassInstances = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount);
  // Disable frustum culling for performance
  grassInstances.frustumCulled = false;
  const offsetAttribute = new Float32Array(grassCount * 2);
  const randomAttribute = new Float32Array(grassCount);

  for (let i = 0; i < grassCount; i++) {
    offsetAttribute[i * 2] = (Math.random() - 0.5) * terrainSize;
    offsetAttribute[i * 2 + 1] = (Math.random() - 0.5) * terrainSize;
    randomAttribute[i] = Math.random();
  }

  grassInstances.geometry.setAttribute(
    "offset",
    new THREE.InstancedBufferAttribute(offsetAttribute, 2),
  );
  grassInstances.geometry.setAttribute(
    "random",
    new THREE.InstancedBufferAttribute(randomAttribute, 1),
  );

  return { grassInstances, grassGeometry };
}
