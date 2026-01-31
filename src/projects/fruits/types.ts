/**
 * Типы для системы фруктов.
 */

import * as THREE from "three";

/**
 * Продукт - загруженный и обработанный объект из GLTF.
 */
export type Product = {
  /** Имя продукта */
  name: string;
  /** Геометрия продукта */
  geometry: THREE.BufferGeometry;
  /** Материалы продукта */
  materials: THREE.MeshBasicMaterial[];
  /** Нормализованный масштаб (1 / maxDim) */
  normalizedScale: number;
};

/**
 * Опции для размещения продукта в сцене.
 */
export type RenderProductOptions = {
  /** Позиция */
  position?: { x: number; y: number; z: number };
  /** Масштаб */
  scale?: number;
  /** Вращение (в радианах) */
  rotation?: { x: number; y: number; z: number };
  /** Кватернион (альтернатива rotation) */
  quaternion?: { x: number; y: number; z: number; w: number };
};

/**
 * Параметры анимации для инстанса.
 */
export type AnimationParams = {
  /** Скорость вращения */
  rotationSpeed: number;
  /** Амплитуда движения по X */
  amplitudeX: number;
  /** Амплитуда движения по Y */
  amplitudeY: number;
  /** Скорость движения */
  movementSpeed: number;
  /** Фаза анимации (смещение) */
  phase: number;
};

// Совместимость со старой системой для puzzleRenderer
export type FruitLayerBits = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type FruitLayerPreset = {
  bg: string;
  dir: { x: number; y: number };
  speedCssPxPerSec: number;
  sizeCssPx: { min: number; max: number };
  fruits?: {
    include?: string[];
    exclude?: string[];
    countTypes?: number;
    countInstances?: number;
  };
};

export type FruitBackgroundPresetsConfig = {
  enabled: boolean;
  gltfUrl: string;
  maskThreshold: number;
  instanceMul: number;
  sizeMul: number;
  positionChaos: number;
  camera: {
    fovDeg: number;
    depthCssPx: number;
  };
  rtScale: number;
  updateFps: number;
  seed: number;
  lighting: {
    ambientIntensity: number;
    dirIntensity: number;
    dirDirection: { x: number; y: number; z: number };
  };
  counts: { bits1to5: number; bits6to7: number };
  motion: {
    wrapMarginCssPx: number;
    swayAmpCssPx: number;
    swaySpeed: number;
    spinSpeed: number;
    axisSpinSpeed: number;
  };
  layers: Record<FruitLayerBits, FruitLayerPreset>;
};
