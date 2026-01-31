import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import type { FruitsUI } from "../ui";
import { initializeRenderer } from "./initialization";
import { loadModelsAndCreateInstances } from "./loading";
import { resizeRenderer } from "./resize";
import { updateAnimation } from "./animation";
import { renderTargets, renderLayerToScreen } from "./rendering";
import { disposeRenderer } from "./disposal";

// Реэкспорт типов для удобства
export type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
export type { FruitInstance, RendererState } from "./state";

/**
 * Главный рендерер фруктов.
 * Управляет загрузкой, анимацией и рендером всех фруктов в 7 слоях (bits=1..7).
 */
export type FruitBackgroundRenderer = {
  /** Загружены ли модели и готов ли к рендеру */
  isReady(): boolean;
  /** Асинхронная загрузка всех 3D моделей и создание инстансов */
  load(): Promise<void>;
  /** Обновление размеров сцены (вызывать при resize) */
  resize(w: number, h: number, dpr: number): void;
  /** Обновление анимации (вызывать каждый кадр) */
  update(timeSec: number, dpr: number): void;
  /** Рендер всех слоёв в offscreen RenderTarget'ы (для пазлов) */
  renderTargets(renderer: THREE.WebGLRenderer): void;
  /** Рендер конкретного слоя на экран (для превью) */
  renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: FruitLayerBits): void;
  /** Получить текстуру фона для слоя */
  getLayerTexture(bits: FruitLayerBits): THREE.Texture;
  /** Получить fallback текстуру (если слой ещё не загружен) */
  getFallbackTexture(bits: FruitLayerBits): THREE.Texture;
  /** Освободить ресурсы */
  dispose(): void;
};

/**
 * Создаёт рендерер фруктов с заданной конфигурацией и опциональным UI.
 */
export function createFruitBackgroundRenderer(
  opts: { config: FruitBackgroundPresetsConfig; ui?: FruitsUI }
): FruitBackgroundRenderer {
  const { config, ui } = opts;
  
  // Инициализация состояния
  const state = initializeRenderer(config, ui);
  
  return {
    isReady: () => state.isReady,
    
    load: async () => {
      await loadModelsAndCreateInstances(state, config);
    },
    
    resize: (w: number, h: number, dpr: number) => {
      resizeRenderer(state, config, w, h, dpr);
    },
    
    update: (timeSec: number, dpr: number) => {
      updateAnimation(state, config, timeSec, dpr);
    },
    
    renderTargets: (renderer: THREE.WebGLRenderer) => {
      renderTargets(state, config, renderer);
    },
    
    renderLayerToScreen: (renderer: THREE.WebGLRenderer, bits: FruitLayerBits) => {
      renderLayerToScreen(state, config, renderer, bits);
    },
    
    getLayerTexture: (bits: FruitLayerBits) => {
      return state.rtByBits.get(bits)?.texture ?? state.fallbackTexByBits[bits];
    },
    
    getFallbackTexture: (bits: FruitLayerBits) => {
      return state.fallbackTexByBits[bits];
    },
    
    dispose: () => {
      disposeRenderer(state);
    }
  };
}
