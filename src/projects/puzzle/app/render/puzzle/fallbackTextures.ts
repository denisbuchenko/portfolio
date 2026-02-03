import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../../../../fruits/types";

export type PuzzleFallbackBgTextures = Record<FruitLayerBits, THREE.DataTexture>;

export function createPuzzleFallbackBgTextures(config: FruitBackgroundPresetsConfig): {
  textures: PuzzleFallbackBgTextures;
  syncFromConfig(): void;
} {
  const textures: PuzzleFallbackBgTextures = {
    1: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    2: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    3: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    4: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    5: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    6: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    7: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat)
  };

  function syncFromConfig(): void {
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const c = new THREE.Color(config.layers[b].bg);
      const r = Math.round(Math.max(0, Math.min(1, c.r)) * 255);
      const g = Math.round(Math.max(0, Math.min(1, c.g)) * 255);
      const bb = Math.round(Math.max(0, Math.min(1, c.b)) * 255);
      const t = textures[b];
      const d = t.image.data as Uint8Array;
      d[0] = r;
      d[1] = g;
      d[2] = bb;
      d[3] = 255;
      t.needsUpdate = true;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    }
  }

  syncFromConfig();
  return { textures, syncFromConfig };
}

