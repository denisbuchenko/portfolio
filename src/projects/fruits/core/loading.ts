import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import type { RendererState, FruitInstance } from "./index";
import { loadFoodCatalog } from "../foodCatalog";
import { buildTypeDefs, assignInstancesToTypes, createTypeLayersForBits } from "../instancing";
import { filterCatalogEntries, pickUnique, clamp, rand01, norm2 } from "../utils";

/**
 * Загружает модели и создаёт инстансы.
 */
export async function loadModelsAndCreateInstances(
  state: RendererState,
  config: FruitBackgroundPresetsConfig
): Promise<void> {
  if (!config.enabled) return;
  
  // Загрузка моделей
  const { entries } = await loadFoodCatalog(config.gltfUrl);
  state.entries = entries;
  
  // Построение определений типов
  state.typeDefs = buildTypeDefs(entries);
  
  // Количество типов фруктов для каждого bits-слоя
  const counts: number[] = [
    config.counts.bits1to5,
    config.counts.bits1to5,
    config.counts.bits1to5,
    config.counts.bits1to5,
    config.counts.bits1to5,
    config.counts.bits6to7,
    config.counts.bits6to7
  ];
  
  // Создаём TypeLayer'ы для каждого bits-слоя
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const layer = config.layers[b];
    
    // Фильтруем и выбираем типы фруктов для этого слоя
    const filtered = filterCatalogEntries(entries, layer.fruits?.include, layer.fruits?.exclude);
    const takeTypes = Math.max(0, (layer.fruits?.countTypes ?? counts[bits - 1]) | 0);
    const pickedTypes = pickUnique(filtered, takeTypes, (config.seed + bits * 131) | 0);
    
    // Вычисляем количество инстансов
    const baseInstances = (layer.fruits?.countInstances ?? Math.min(64, Math.max(pickedTypes.length, pickedTypes.length * 6))) | 0;
    const countInstances = Math.max(0, Math.min(256, Math.round(baseInstances * clamp(config.instanceMul, 0.1, 8.0))));
    
    // Распределяем инстансы по типам и создаём TypeLayer'ы
    const assigned = assignInstancesToTypes(pickedTypes, countInstances, (config.seed + bits * 991) | 0);
    const layerTypeMap = createTypeLayersForBits(b, state.typeDefs, assigned.countByType);
    
    // Добавляем меши в сцену
    for (const tl of layerTypeMap.values()) {
      state.typeLayers.push(tl);
      for (const m of tl.meshes) {
        state.scene.add(m);
      }
    }
  }
  
  // Создаём инстансы для каждого bits-слоя
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const layer = config.layers[b];
    
    // Находим все TypeLayer'ы для этого bits-слоя
    const layerTypeMap = new Map<string, typeof state.typeLayers[0]>();
    for (const tl of state.typeLayers) {
      if (tl.bits === b) {
        layerTypeMap.set(tl.typeName, tl);
      }
    }
    
    // Подсчитываем инстансы по типам
    const perTypeCursor = new Map<string, number>();
    
    // Проходим по всем TypeLayer'ам и создаём инстансы
    for (const [typeName, typeLayer] of layerTypeMap) {
      for (let i = 0; i < typeLayer.count; i++) {
        const localIdx = perTypeCursor.get(typeName) ?? 0;
        perTypeCursor.set(typeName, localIdx + 1);
        
        // Генерируем параметры инстанса
        const globalIndex = state.instances.length;
        const seed = (config.seed + b * 1000 + globalIndex * 17 + typeName.length * 13) | 0;
        
        const axis = new THREE.Vector3(rand01(seed + 21) - 0.5, rand01(seed + 22) - 0.5, rand01(seed + 23) - 0.5);
        if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
        axis.normalize();
        
        const angVel = (0.15 + 0.55 * rand01(seed + 5)) * config.motion.axisSpinSpeed;
        const sizeRand = rand01(seed + 3);
        const zRand = rand01(seed + 9);
        
        const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
        
        const instance: FruitInstance = {
          bits: b,
          _typeLayer: typeLayer,
          _index: localIdx,
          _seed: seed,
          _sizeRand: sizeRand,
          _zRand: zRand,
          _axis: axis,
          _angVel: angVel,
          _quat: new THREE.Quaternion(),
          _pos: new THREE.Vector3(0, 0, 0),
          _velDir: dirV,
          _inited: false
        };
        
        state.instances.push(instance);
      }
    }
  }
  
  state.isReady = true;
}
