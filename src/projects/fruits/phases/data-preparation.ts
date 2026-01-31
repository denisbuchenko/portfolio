import type { PhaseContext, PhaseFunction } from "./orchestrator";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import { filterCatalogEntries, pickUnique, clamp } from "../utils";
import { buildTypeDefs, assignInstancesToTypes, createTypeLayersForBits, type TypeLayer } from "../instancing";
import type { FoodEntry } from "../foodCatalog";

/**
 * Главная функция фазы подготовки данных
 */
export const executeDataPreparation: PhaseFunction = (context, config) => {
  if (!config.enabled) {
    return context;
  }
  if (!context.entries) {
    throw new Error("Entries must be loaded before data preparation");
  }
  
  let ctx = context;
  ctx = _buildTypeDefinitions(ctx);
  
  if (!ctx.typeDefs) {
    throw new Error("Type definitions must be built");
  }
  
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
    if (!ctx.entries) {
      throw new Error("Entries must be loaded before data preparation");
    }
    const filtered = _filterCatalogForLayer(ctx.entries, layer);
    const takeTypes = Math.max(0, (layer.fruits?.countTypes ?? counts[bits - 1]) | 0);
    const pickedTypes = _pickUniqueTypes(filtered, takeTypes, (config.seed + bits * 131) | 0);
    
    // Вычисляем количество инстансов
    const countInstances = _calculateInstanceCount(layer, pickedTypes, config.instanceMul);
    
    // Распределяем инстансы по типам и создаём TypeLayer'ы
    const assigned = _assignInstancesToTypes(pickedTypes, countInstances, (config.seed + bits * 991) | 0);
    if (!ctx.typeDefs) {
      throw new Error("Type definitions must be built");
    }
    const layerTypeMap = _createTypeLayers(b, ctx.typeDefs, assigned.countByType);
    
    // Добавляем меши в сцену
    ctx = _addMeshesToScene(ctx, layerTypeMap);
  }
  
  return ctx;
};

/**
 * Фаза подготовки данных
 * Строит определения типов, применяет трансформации, фильтрует каталог,
 * выбирает уникальные типы, вычисляет количество инстансов, распределяет их,
 * создаёт TypeLayer'ы, настраивает layers и добавляет меши в сцену.
 */

/**
 * Построение определений типов
 * Применяет трансформации геометрий внутри buildTypeDefs
 */
function _buildTypeDefinitions(context: PhaseContext): PhaseContext {
  if (!context.entries) {
    throw new Error("Entries must be loaded before building type definitions");
  }
  
  context.typeDefs = buildTypeDefs(context.entries);
  return context;
}

/**
 * Фильтрация каталога для слоя
 */
function _filterCatalogForLayer(
  entries: FoodEntry[],
  layer: FruitBackgroundPresetsConfig["layers"][FruitLayerBits]
): FoodEntry[] {
  return filterCatalogEntries(entries, layer.fruits?.include, layer.fruits?.exclude);
}

/**
 * Выбор уникальных типов
 */
function _pickUniqueTypes(
  filtered: FoodEntry[],
  takeTypes: number,
  seed: number
): FoodEntry[] {
  return pickUnique(filtered, takeTypes, seed);
}

/**
 * Вычисление количества инстансов
 */
function _calculateInstanceCount(
  layer: FruitBackgroundPresetsConfig["layers"][FruitLayerBits],
  pickedTypes: FoodEntry[],
  instanceMul: number
): number {
  const baseInstances =
    (layer.fruits?.countInstances ?? Math.min(64, Math.max(pickedTypes.length, pickedTypes.length * 6))) | 0;
  return Math.max(0, Math.min(256, Math.round(baseInstances * clamp(instanceMul, 0.1, 8.0))));
}

/**
 * Распределение инстансов по типам
 */
function _assignInstancesToTypes(
  pickedTypes: FoodEntry[],
  countInstances: number,
  seed: number
) {
  return assignInstancesToTypes(pickedTypes, countInstances, seed);
}

/**
 * Создание TypeLayer'ов
 * Настройка layers для фильтрации выполняется внутри createTypeLayersForBits
 */
function _createTypeLayers(
  bits: FruitLayerBits,
  typeDefs: Map<string, any>,
  countByType: Map<string, number>
): Map<string, TypeLayer> {
  return createTypeLayersForBits(bits, typeDefs, countByType);
}

/**
 * Добавление мешей в сцену
 */
function _addMeshesToScene(
  context: PhaseContext,
  layerTypeMap: Map<string, TypeLayer>
): PhaseContext {
  if (!context.scene) {
    throw new Error("Scene must exist before adding meshes");
  }
  if (!context.typeLayers) {
    context.typeLayers = [];
  }
  
  for (const tl of layerTypeMap.values()) {
    context.typeLayers.push(tl);
    for (const m of tl.meshes) {
      context.scene.add(m);
    }
  }
  return context;
}


