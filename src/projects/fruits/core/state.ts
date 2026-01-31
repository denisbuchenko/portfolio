import * as THREE from "three";
import type { FruitLayerBits } from "../types";
import type { FoodEntry } from "../foodCatalog";
import type { TypeDef, TypeLayer } from "../instancing";
import type { PlacementState } from "../placement";
import type { FruitsUI } from "../ui";

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
 * Внутреннее состояние рендерера фруктов.
 */
export type RendererState = {
  // UI
  ui?: FruitsUI;
  
  // Сцена
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lightGroup: THREE.Group;
  
  // Модели
  entries: FoodEntry[];
  typeDefs: Map<string, TypeDef>;
  
  // Инстансы
  instances: FruitInstance[];
  typeLayers: TypeLayer[];
  
  // Размеры
  viewW: number;
  viewH: number;
  dpr: number;
  cameraZ: number;
  depthPx: number;
  
  // RenderTarget'ы
  rtByBits: Map<FruitLayerBits, THREE.WebGLRenderTarget>;
  fallbackTexByBits: Record<FruitLayerBits, THREE.DataTexture>;
  
  // Состояние размещения
  placementByBits: Map<FruitLayerBits, PlacementState>;
  
  // Состояние готовности
  isReady: boolean;
  
  // Состояние для управления частотой рендера
  lastTimeSec: number | null;
  lastRenderedSec: number | null;
  shouldRenderThisFrame: boolean;
};
