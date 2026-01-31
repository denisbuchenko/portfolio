import * as THREE from "three";
import type { FruitBackgroundPresetsConfig } from "./types";
import type { FruitBackgroundRenderer } from "./fruitRenderer";
import { createFruitBackgroundRenderer } from "./fruitRenderer";

/**
 * Компоновщик сцены фруктов.
 * Управляет загрузкой, настройкой и обновлением всех объектов для отображения.
 *
 * Предоставляет удобные методы для:
 * - Загрузки 3D моделей
 * - Настройки отображения (какие фрукты, сколько, размеры, движение)
 * - Обновления анимации
 * - Рендера конкретного слоя (bits=1..7)
 */
export type SceneComposer = {
  /** Загружены ли модели и готов ли к рендеру */
  isReady(): boolean;
  /** Асинхронная загрузка всех 3D моделей */
  load(): Promise<void>;
  /** Обновление размеров сцены (вызывать при resize) */
  resize(w: number, h: number, dpr: number): void;
  /** Обновление анимации (вызывать каждый кадр) */
  update(timeSec: number, dpr: number): void;
  /** Рендер конкретного слоя (bits=1..7) на экран */
  renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: 1 | 2 | 3 | 4 | 5 | 6 | 7): void;
  /** Получить текстуру фона для слоя (для использования в других рендерах) */
  getLayerTexture(bits: 1 | 2 | 3 | 4 | 5 | 6 | 7): THREE.Texture;
};

/**
 * Создаёт компоновщик сцены с заданной конфигурацией.
 *
 * @param config - Конфигурация пресетов (из CONFIG.puzzle.background3d)
 */
export function createSceneComposer(config: FruitBackgroundPresetsConfig): SceneComposer {
  const fruitBg: FruitBackgroundRenderer = createFruitBackgroundRenderer({ config });

  return {
    isReady: () => fruitBg.isReady(),
    load: async () => {
      await fruitBg.load();
    },
    resize: (w, h, dpr) => {
      fruitBg.resize(w, h, dpr);
    },
    update: (timeSec, dpr) => {
      fruitBg.update(timeSec, dpr);
    },
    renderLayerToScreen: (renderer, bits) => {
      fruitBg.renderLayerToScreen(renderer, bits);
    },
    getLayerTexture: (bits) => {
      return fruitBg.getLayerTexture(bits);
    }
  };
}
