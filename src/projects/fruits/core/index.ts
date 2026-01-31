/**
 * Совместимость со старой системой для puzzleRenderer.
 * Временная заглушка для обратной совместимости.
 */

import * as THREE from "three";
import type { FruitBackgroundPresetsConfig } from "../types";

export type FruitBackgroundRenderer = {
  load(): Promise<void>;
  resize(w: number, h: number, dpr: number): void;
  update(timeSec: number, dpr: number): void;
  renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: 1 | 2 | 3 | 4 | 5 | 6 | 7): void;
  renderTargets(renderer: THREE.WebGLRenderer): void;
  getLayerTexture(bits: 1 | 2 | 3 | 4 | 5 | 6 | 7): THREE.Texture;
};

/**
 * Заглушка для обратной совместимости.
 * TODO: Реализовать или удалить puzzleRenderer зависимость от старой системы.
 */
export function createFruitBackgroundRenderer(_opts: {
  config: FruitBackgroundPresetsConfig;
  ui?: { canvas: HTMLCanvasElement; statusEl: HTMLDivElement } | undefined;
}): FruitBackgroundRenderer {
  // Временная заглушка - возвращает объект с методами-заглушками
  return {
    async load(): Promise<void> {
      // Заглушка
    },
    resize(_w: number, _h: number, _dpr: number): void {
      // Заглушка
    },
    update(_timeSec: number, _dpr: number): void {
      // Заглушка
    },
    renderLayerToScreen(_renderer: THREE.WebGLRenderer, _bits: 1 | 2 | 3 | 4 | 5 | 6 | 7): void {
      // Заглушка
    },
    renderTargets(_renderer: THREE.WebGLRenderer): void {
      // Заглушка
    },
    getLayerTexture(_bits: 1 | 2 | 3 | 4 | 5 | 6 | 7): THREE.Texture {
      // Возвращаем пустую текстуру как заглушку
      const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
  };
}
