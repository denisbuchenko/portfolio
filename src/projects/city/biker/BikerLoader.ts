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
    return { root, clips: gltf.animations ?? [] };
  }
}

