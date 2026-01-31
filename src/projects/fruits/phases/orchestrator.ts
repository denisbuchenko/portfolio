import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import type { FoodEntry } from "../foodCatalog";
import type { TypeDef, TypeLayer } from "../instancing";
import type { PlacementState } from "../placement";
import type { FruitsUI } from "../ui";

// Реэкспорт типов для удобства
export type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import { executeInitialization } from "./initialization";
import { executeModelLoading } from "./model-loading";
import { executeDataPreparation } from "./data-preparation";
import { executeInstanceCreation } from "./instance-creation";
import { executeSizeConfigurationWithDimensions } from "./size-configuration";
import { executeAnimation } from "./animation";
import { executeRenderingTargets, executeRenderingLayerToScreen } from "./rendering";
import { executeDisposal } from "./disposal";

/**
 * Контекст, передаваемый между фазами.
 * Содержит все данные, необходимые для работы рендерера.
 */
export type PhaseContext = {
  // UI
  ui?: FruitsUI;
  renderer?: THREE.WebGLRenderer;
  
  // Сцена
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  lightGroup?: THREE.Group;
  
  // Модели
  entries?: FoodEntry[];
  typeDefs?: Map<string, TypeDef>;
  
  // Инстансы
  instances?: FruitInstance[];
  typeLayers?: TypeLayer[];
  
  // Размеры
  viewW?: number;
  viewH?: number;
  dpr?: number;
  cameraZ?: number;
  depthPx?: number;
  
  // RenderTarget'ы
  rtByBits?: Map<FruitLayerBits, THREE.WebGLRenderTarget>;
  fallbackTexByBits?: Record<FruitLayerBits, THREE.DataTexture>;
  
  // Состояние размещения
  placementByBits?: Map<FruitLayerBits, PlacementState>;
  
  // Состояние готовности
  isReadyRef?: { v: boolean };
  
  // Временные объекты для обновления матриц
  _tmpDeltaQuat?: THREE.Quaternion;
  _tmpMat?: THREE.Matrix4;
  _tmpScale?: THREE.Vector3;
  
  // Состояние для управления частотой рендера
  _lastTimeSec?: number | null;
  _lastRenderedSec?: number | null;
  _shouldRenderThisFrame?: boolean;
};

/**
 * Инстанс фрукта: данные для одного объекта на экране.
 */
export type FruitInstance = {
  bits: FruitLayerBits;
  _typeLayer: TypeLayer;
  _index: number;
  _seed: number;
  _sizeRand: number;
  _zRand: number;
  _axis: THREE.Vector3;
  _angVel: number;
  _quat: THREE.Quaternion;
  _pos: THREE.Vector3;
  _velDir: THREE.Vector2;
  _inited: boolean;
};

/**
 * Тип функции фазы.
 * Каждая фаза принимает контекст и конфигурацию, возвращает обновлённый контекст.
 */
export type PhaseFunction = (
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig
) => PhaseContext | Promise<PhaseContext>;

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
 * Создаёт рендерер фруктов с заданной конфигурацией и опциональным UI.
 * Внутри использует фазированный подход через orchestrator.
 */
export function createFruitBackgroundRenderer(
  opts: { config: FruitBackgroundPresetsConfig; ui?: FruitsUI }
): FruitBackgroundRenderer {
  const { config, ui } = opts;
  // Создаём начальный контекст
  let context: PhaseContext = { ui };
  
  // Выполняем фазу инициализации (синхронная)
  context = executeInitialization(context, config) as PhaseContext;
  
  // Методы для работы с рендерером
  const result: FruitBackgroundRenderer = {
    isReady: () => context.isReadyRef?.v ?? false,
    
    load: async () => {
      context = await executeModelLoading(context, config);
      context = executeDataPreparation(context, config) as PhaseContext;
      context = executeInstanceCreation(context, config) as PhaseContext;
      if (context.isReadyRef) {
        context.isReadyRef.v = true;
      }
    },
    
    resize: (w: number, h: number, dpr: number) => {
      context = executeSizeConfigurationWithDimensions(context, config, w, h, dpr);
    },
    
    update: (timeSec: number, dpr: number) => {
      context.dpr = dpr;
      context = executeAnimation(context, config, timeSec, dpr);
    },
    
    renderTargets: (renderer: THREE.WebGLRenderer) => {
      context.renderer = renderer;
      context = executeRenderingTargets(context, config, renderer);
    },
    
    renderLayerToScreen: (renderer: THREE.WebGLRenderer, bits: FruitLayerBits) => {
      context.renderer = renderer;
      executeRenderingLayerToScreen(context, config, renderer, bits);
    },
    
    getLayerTexture: (bits: FruitLayerBits) => {
      return context.rtByBits?.get(bits)?.texture ?? context.fallbackTexByBits?.[bits]!;
    },
    
    getFallbackTexture: (bits: FruitLayerBits) => {
      return context.fallbackTexByBits?.[bits]!;
    },
    
    dispose: () => {
      context = executeDisposal(context, config) as PhaseContext;
    }
  };
  
  return result;
}
