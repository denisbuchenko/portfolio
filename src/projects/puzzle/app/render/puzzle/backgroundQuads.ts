import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../../../../fruits/types";
import type { PuzzleFallbackBgTextures } from "./fallbackTextures";

export type PuzzleBgQuad = THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>;

export function createPuzzleBackgroundQuads(opts: {
  scene: THREE.Scene;
  config: FruitBackgroundPresetsConfig;
  maskTex: THREE.Texture;
  fallbackTexByBits: PuzzleFallbackBgTextures;
  resolution: THREE.Vector2;
  shaders: { vert: string; bgFrag: string };
}): PuzzleBgQuad[] {
  const quads: PuzzleBgQuad[] = [];
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        tMask: { value: opts.maskTex },
        tBg: { value: opts.fallbackTexByBits[b] },
        uResolution: { value: opts.resolution.clone() },
        uThreshold: { value: opts.config.maskThreshold },
        uBits: { value: bits },
        uBgColor: { value: new THREE.Color(opts.config.layers[b].bg) }
      },
      vertexShader: opts.shaders.vert,
      fragmentShader: opts.shaders.bgFrag
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = -20 + bits;
    mesh.position.z = -9;
    opts.scene.add(mesh);
    quads.push(mesh);
  }
  return quads;
}

export function resizePuzzleBackgroundQuads(quads: PuzzleBgQuad[], w: number, h: number): void {
  for (const q of quads) {
    q.scale.set(w, h, 1);
    q.position.set(w * 0.5, h * 0.5, -9);
    (q.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }
}

export function syncPuzzleBackgroundQuadUniforms(quads: PuzzleBgQuad[], config: FruitBackgroundPresetsConfig): void {
  for (let i = 0; i < quads.length; i++) {
    const bits = (i + 1) as FruitLayerBits;
    const q = quads[i];
    (q.material.uniforms.uThreshold.value as number) = config.maskThreshold;
    (q.material.uniforms.uBgColor.value as THREE.Color).set(config.layers[bits].bg);
  }
}

export function setPuzzleBackgroundQuadVisibility(quads: PuzzleBgQuad[], active: Set<FruitLayerBits>): void {
  for (let i = 0; i < quads.length; i++) {
    const bits = (i + 1) as FruitLayerBits;
    quads[i].visible = active.has(bits);
  }
}

export function setPuzzleBackgroundQuadTexture(quads: PuzzleBgQuad[], bits: FruitLayerBits, tex: THREE.Texture): void {
  const q = quads[bits - 1];
  if (q.material.uniforms.tBg.value !== tex) {
    (q.material.uniforms.tBg.value as THREE.Texture) = tex;
  }
}

