import * as THREE from "three";
import type { PhaseContext, PhaseFunction, FruitInstance } from "./orchestrator";
import type { FruitBackgroundPresetsConfig } from "../types";
import { clamp, norm2, rand01 } from "../utils";
import { executeObjectPlacementForInstance } from "./object-placement";

/**
 * Фаза анимации
 * Вычисляет delta time, обновляет движение, применяет покачивание,
 * обрабатывает wrap, вычисляет масштаб, обновляет 3D-вращение,
 * обновляет матрицу инстанса, записывает матрицу в InstancedMesh,
 * помечает как "грязного".
 */

/**
 * Вычисление delta time
 */

/**
 * Главная функция фазы анимации
 */
export function executeAnimation(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  timeSec: number,
  dpr: number
): PhaseContext {
  if (!config.enabled) {
    return context;
  }
  if (!context.isReadyRef?.v) {
    return context;
  }
  if (!context.instances || !context._tmpDeltaQuat || !context._tmpMat || !context._tmpScale) {
    return context;
  }
  
  // Вычисляем delta time
  const { dt } = _calculateDeltaTime(context, timeSec);
  context._lastTimeSec = timeSec;
  
  const w = (context.viewW ?? 2) | 0;
  const h = (context.viewH ?? 2) | 0;
  const margin = config.motion.wrapMarginCssPx * dpr;
  const swayAmp = config.motion.swayAmpCssPx * dpr;
  const swaySpeed = config.motion.swaySpeed;
  const sizeMul = clamp(config.sizeMul, 0.2, 5.0);
  
  // Обновляем каждый инстанс
  for (const it of context.instances) {
    const layer = config.layers[it.bits];
    const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
    const velPx = dirV.clone().multiplyScalar(layer.speedCssPxPerSec * dpr);
    
    // Инициализация позиции (только один раз)
    if (!it._inited) {
      executeObjectPlacementForInstance(context, config, it, w, h, dpr);
    }
    
    // Движение по направлению
    _updateMovement(it, velPx, dt);
    
    // Покачивание (sway) перпендикулярно направлению
    _applySway(it, dirV, swayAmp, swaySpeed, timeSec, dt);
    
    // Wrap (зацикливание при выходе за границы)
    _handleWrap(it, dirV, w, h, margin);
    
    // Масштаб
    const scale = _calculateScale(it, layer, sizeMul, dpr);
    
    // 3D вращение вокруг случайной оси (tumble)
    _update3DRotation(it, context._tmpDeltaQuat, dt);
    
    // Обновляем матрицу инстанса
    _updateInstanceMatrix(it, context._tmpMat, context._tmpScale, scale);
  }
  
  // Управление частотой рендера (если updateFps > 0)
  if (config.updateFps <= 0) {
    context._shouldRenderThisFrame = true;
    return context;
  }
  const step = 1 / Math.max(1, config.updateFps);
  const lastRendered = context._lastRenderedSec ?? null;
  if (lastRendered === null || timeSec - lastRendered >= step) {
    context._shouldRenderThisFrame = true;
  }
  
  return context;
}

/**
 * Главная функция фазы анимации (для совместимости с PhaseFunction)
 */
export const executeAnimationPhase: PhaseFunction = (context) => {
  // Анимация вызывается динамически из update, поэтому здесь ничего не делаем
  return context;
};

function _calculateDeltaTime(
  context: PhaseContext,
  timeSec: number
): { dt: number; lastTimeSec: number | null } {
  const lastTime = context._lastTimeSec ?? null;
  const dt =
    lastTime === null
      ? 1 / 60
      : clamp(timeSec - lastTime, 1 / 240, 1 / 20); // 240fps..50fps
  return { dt, lastTimeSec: lastTime };
}

/**
 * Обновление движения
 */
function _updateMovement(
  instance: FruitInstance,
  velPx: THREE.Vector2,
  dt: number
): void {
  instance._pos.x += velPx.x * dt;
  instance._pos.y += velPx.y * dt;
}

/**
 * Применение покачивания
 */
function _applySway(
  instance: FruitInstance,
  dirV: THREE.Vector2,
  swayAmp: number,
  swaySpeed: number,
  timeSec: number,
  dt: number
): void {
  const sway =
    swayAmp *
    (0.5 +
      0.5 * Math.sin(timeSec * (swaySpeed + 0.3 * rand01(instance._seed + 7)) + 6.28318 * rand01(instance._seed + 11)));
  instance._pos.x += -dirV.y * sway * dt;
  instance._pos.y += dirV.x * sway * dt;
}

/**
 * Обработка wrap
 */
function _handleWrap(
  instance: FruitInstance,
  dirV: THREE.Vector2,
  w: number,
  h: number,
  margin: number
): void {
  if (dirV.x > 0.0 && instance._pos.x > w + margin) instance._pos.x = -margin;
  if (dirV.x < 0.0 && instance._pos.x < -margin) instance._pos.x = w + margin;
  if (dirV.y > 0.0 && instance._pos.y > h + margin) instance._pos.y = -margin;
  if (dirV.y < 0.0 && instance._pos.y < -margin) instance._pos.y = h + margin;
}

/**
 * Вычисление масштаба
 */
function _calculateScale(
  instance: FruitInstance,
  layer: FruitBackgroundPresetsConfig["layers"][typeof instance.bits],
  sizeMul: number,
  dpr: number
): number {
  const targetSizePx =
    (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * instance._sizeRand) * dpr * sizeMul;
  return instance._typeLayer.baseScale * targetSizePx;
}

/**
 * Обновление 3D-вращения
 */
function _update3DRotation(
  instance: FruitInstance,
  deltaQuat: THREE.Quaternion,
  dt: number
): void {
  const delta = instance._angVel * dt;
  deltaQuat.setFromAxisAngle(instance._axis, delta);
  instance._quat.multiply(deltaQuat).normalize();
}

/**
 * Обновление матрицы инстанса
 */
function _updateInstanceMatrix(
  instance: FruitInstance,
  tmpMat: THREE.Matrix4,
  tmpScale: THREE.Vector3,
  scale: number
): void {
  tmpScale.set(scale, scale, scale);
  tmpMat.compose(instance._pos, instance._quat, tmpScale);
  for (const mesh of instance._typeLayer.meshes) {
    mesh.setMatrixAt(instance._index, tmpMat);
  }
  instance._typeLayer._dirty = true;
}


