import * as THREE from "three";
import type { PhaseFunction, FruitInstance } from "./orchestrator";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import { rand01, norm2 } from "../utils";
import type { TypeLayer } from "../instancing";

/**
 * Фаза создания инстансов
 * Генерирует параметры инстансов, создаёт объекты инстансов, инициализирует флаги.
 */

/**
 * Главная функция фазы создания инстансов
 */
export const executeInstanceCreation: PhaseFunction = (context, config) => {
  if (!config.enabled) {
    return context;
  }
  if (!context.typeLayers) {
    throw new Error("Type layers must be created before instance creation");
  }
  
  if (!context.instances) {
    context.instances = [];
  }
  
  // Создаём инстансы для каждого bits-слоя
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const layer = config.layers[b];
    
    // Находим все TypeLayer'ы для этого bits-слоя
    const layerTypeMap = new Map<string, TypeLayer>();
    for (const tl of context.typeLayers) {
      if (tl.bits === b) {
        layerTypeMap.set(tl.typeName, tl);
      }
    }
    
    // Подсчитываем инстансы по типам (из количества в TypeLayer)
    const perTypeCursor = new Map<string, number>();
    
    // Проходим по всем TypeLayer'ам и создаём инстансы
    for (const [typeName, typeLayer] of layerTypeMap) {
      for (let i = 0; i < typeLayer.count; i++) {
        const localIdx = perTypeCursor.get(typeName) ?? 0;
        perTypeCursor.set(typeName, localIdx + 1);
        
        // Используем общий индекс для генерации seed (как в оригинале)
        const globalIndex = context.instances.length;
        const params = _generateInstanceParams(config, b, globalIndex, typeName, layer);
        const instance = _createInstanceObject(b, typeLayer, localIdx, params);
        
        context.instances.push(instance);
      }
    }
  }
  
  return context;
};


/**
 * Генерация параметров инстанса
 */
function _generateInstanceParams(
  config: FruitBackgroundPresetsConfig,
  bits: FruitLayerBits,
  index: number,
  typeName: string,
  layer: FruitBackgroundPresetsConfig["layers"][FruitLayerBits]
): {
  seed: number;
  axis: THREE.Vector3;
  angVel: number;
  sizeRand: number;
  zRand: number;
  velDir: THREE.Vector2;
} {
  const seed = (config.seed + bits * 1000 + index * 17 + typeName.length * 13) | 0;
  
  const axis = new THREE.Vector3(rand01(seed + 21) - 0.5, rand01(seed + 22) - 0.5, rand01(seed + 23) - 0.5);
  if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
  axis.normalize();
  
  const angVel = (0.15 + 0.55 * rand01(seed + 5)) * config.motion.axisSpinSpeed;
  const sizeRand = rand01(seed + 3);
  const zRand = rand01(seed + 9);
  
  const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
  
  return {
    seed,
    axis,
    angVel,
    sizeRand,
    zRand,
    velDir: dirV
  };
}

/**
 * Создание объекта инстанса
 */
function _createInstanceObject(
  bits: FruitLayerBits,
  typeLayer: TypeLayer,
  localIdx: number,
  params: ReturnType<typeof _generateInstanceParams>
): FruitInstance {
  return {
    bits,
    _typeLayer: typeLayer,
    _index: localIdx,
    _seed: params.seed,
    _sizeRand: params.sizeRand,
    _zRand: params.zRand,
    _axis: params.axis,
    _angVel: params.angVel,
    _quat: new THREE.Quaternion(),
    _pos: new THREE.Vector3(0, 0, 0),
    _velDir: params.velDir,
    _inited: false
  };
}

/**
 * Инициализация флагов
 * (флаг _inited устанавливается в false при создании, инициализируется в фазе размещения)
 */

