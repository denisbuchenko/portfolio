import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "./types";

// Реэкспорт типов для удобства
export type { FruitBackgroundPresetsConfig, FruitLayerBits } from "./types";
import { createOrchestrator } from "./phases/orchestrator";

/**
 * Главный рендерер фруктов.
 * Управляет загрузкой, анимацией и рендером всех фруктов в 7 слоях (bits=1..7).
 *
 * Технические детали:
 * - Использует InstancedMesh для оптимизации (общая геометрия, отдельные матрицы)
 * - Рендерит в 7 отдельных RenderTarget для каждого bits-слоя
 * - Поддерживает PerspectiveCamera для объёмного вида
 * - Использует spatial hash для размещения без пересечений
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
 * Создаёт рендерер фруктов с заданной конфигурацией.
 * Внутри использует фазированный подход через orchestrator.
 */
export function createFruitBackgroundRenderer(opts: { config: FruitBackgroundPresetsConfig }): FruitBackgroundRenderer {
  const { config } = opts;
  
  // Создаём orchestrator без UI (UI нужен только для FruitsProject.ts)
  const orchestrator = createOrchestrator(config);
  
  // Возвращаем обёртку, которая соответствует публичному API
  return {
    isReady: () => orchestrator.isReady(),
    load: () => orchestrator.load(),
    resize: (w, h, dpr) => orchestrator.resize(w, h, dpr),
    update: (timeSec, dpr) => orchestrator.update(timeSec, dpr),
    renderTargets: (renderer) => orchestrator.renderTargets(renderer),
    renderLayerToScreen: (renderer, bits) => orchestrator.renderLayerToScreen(renderer, bits),
    getLayerTexture: (bits) => orchestrator.getLayerTexture(bits),
    getFallbackTexture: (bits) => orchestrator.getFallbackTexture(bits),
    dispose: () => orchestrator.dispose()
  };
}
