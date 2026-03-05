import * as THREE from "three";
import { enableShadowsAndSrgb, loadGltf } from "../three/loadGltf";

export type BikerRig = Readonly<{
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}>;

export class BikerLoader {
  async load(glbUrl: string): Promise<BikerRig> {
    const gltf = await loadGltf(glbUrl);
    const root = gltf.scene as THREE.Group;
    enableShadowsAndSrgb(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    });
    return { root, clips: gltf.animations ?? [] };
  }
}

