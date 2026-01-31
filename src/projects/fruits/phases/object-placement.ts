import type { PhaseContext, PhaseFunction, FruitInstance } from "./orchestrator";
import type { FruitBackgroundPresetsConfig } from "../types";
import { rand01, clamp } from "../utils";
import { getPlacementState, tryPlace, clearPlacementCache } from "../placement";

/**
 * Фаза размещения объектов
 * Создаёт состояние размещения через getPlacementState (вычисляет сетку клеток,
 * перемешивает, настраивает spatial hash), размещает объекты через tryPlace
 * (jitter, проверка границ, коллизии, fallback), инициализирует Z-координату,
 * помечает как инициализированного.
 */

/**
 * Главная функция фазы размещения объектов
 * Вызывается для каждого инстанса при первом обновлении
 */
export function executeObjectPlacementForInstance(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  instance: FruitInstance,
  w: number,
  h: number,
  dpr: number
): void {
  if (!context.placementByBits) {
    context.placementByBits = new Map();
  }
  
  const layer = config.layers[instance.bits];
  const targetSizePx =
    (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * instance._sizeRand) *
    dpr *
    clamp(config.sizeMul, 0.2, 5.0);
  const radius = targetSizePx * 0.55;
  const margin = config.motion.wrapMarginCssPx * dpr;
  
  // Получаем состояние размещения для этого bits-слоя
  const st = getPlacementState(
    instance.bits,
    instance._typeLayer.count,
    layer.sizeCssPx.max * dpr * clamp(config.sizeMul, 0.2, 5.0),
    w,
    h,
    margin,
    dpr,
    config.seed
  );
  
  // Сохраняем состояние в контексте (для переиспользования)
  context.placementByBits.set(instance.bits, st);
  
  // Пытаемся разместить без пересечений
  const chaos = clamp(config.positionChaos, 0.0, 1.0);
  const p = tryPlace(st, instance._seed, radius, chaos);
  instance._pos.x = p.x;
  instance._pos.y = p.y;
  
  // Инициализируем Z-координату
  if (context.depthPx !== undefined) {
    _initializeZCoordinate(instance, instance._seed, context.depthPx);
  }
  
  // Помечаем как инициализированного
  _markAsInitialized(instance);
}

/**
 * Главная функция фазы размещения объектов (для инициализации)
 */
export const executeObjectPlacement: PhaseFunction = (context) => {
  // Размещение выполняется динамически в фазе анимации при первом обновлении
  // Здесь только очистка кэша при необходимости
  clearPlacementCache();
  return context;
};


/**
 * Инициализация Z-координаты
 */
function _initializeZCoordinate(
  instance: FruitInstance,
  seed: number,
  depthPx: number
): void {
  instance._pos.z = (rand01(seed + 77) - 0.5) * depthPx;
}

/**
 * Помечение как инициализированного
 */
function _markAsInitialized(instance: FruitInstance): void {
  instance._inited = true;
}

