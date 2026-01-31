import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import type { FoodEntry } from "../foodCatalog";
import type { TypeDef, TypeLayer } from "../instancing";
import type { PlacementState } from "../placement";
import type { FruitsUI } from "../ui";
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
 * Результат работы orchestrator.
 * Содержит методы для обновления и рендеринга.
 */
export type OrchestratorResult = {
  isReady(): boolean;
  load(): Promise<void>;
  resize(w: number, h: number, dpr: number): void;
  update(timeSec: number, dpr: number): void;
  renderTargets(renderer: THREE.WebGLRenderer): void;
  renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: FruitLayerBits): void;
  getLayerTexture(bits: FruitLayerBits): THREE.Texture;
  getFallbackTexture(bits: FruitLayerBits): THREE.Texture;
  dispose(): void;
};

/**
 * Создаёт orchestrator с заданной конфигурацией и опциональным UI.
 */
export function createOrchestrator(
  config: FruitBackgroundPresetsConfig,
  ui?: FruitsUI
): OrchestratorResult {
  // Создаём начальный контекст
  let context: PhaseContext = { ui };
  
  // Выполняем фазу инициализации (синхронная)
  context = executeInitialization(context, config) as PhaseContext;
  
  // Методы для работы с рендерером
  return {
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
}
