import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export async function loadGltf(url: string): Promise<GLTF> {
  const loader = new GLTFLoader();
  return await loader.loadAsync(url);
}

export function enableShadowsAndSrgb(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const material = mesh.material as unknown;
    const mats = Array.isArray(material) ? material : [material];
    for (const m of mats) {
      const anyMat = m as Record<string, unknown>;
      const map = anyMat.map as THREE.Texture | undefined;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
    }
  });
}

