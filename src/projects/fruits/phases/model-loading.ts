import type { PhaseContext, PhaseFunction } from "./orchestrator";
import type { FruitBackgroundPresetsConfig } from "../types";
import { loadFoodCatalog } from "../foodCatalog";

/**
 * Фаза загрузки моделей
 * Загружает glTF-файл через loadFoodCatalog, который выполняет:
 * - Поиск базовых нод
 * - Фильтрацию служебных нод
 * - Клонирование объектов
 * - Настройку материалов
 * - Центрирование и нормализацию размеров
 */

/**
 * Главная функция фазы загрузки моделей
 */
export const executeModelLoading: PhaseFunction = async (context, config) => {
  let ctx = context;
  ctx = await _loadGLTF(ctx, config);
  return ctx;
};


async function _loadGLTF(context: PhaseContext, config: FruitBackgroundPresetsConfig): Promise<PhaseContext> {
  if (!config.enabled) {
    return context;
  }
  
  const { entries } = await loadFoodCatalog(config.gltfUrl);
  context.entries = entries;
  return context;
}

