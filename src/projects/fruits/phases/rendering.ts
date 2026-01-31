import * as THREE from "three";
import type { PhaseContext, PhaseFunction } from "./orchestrator";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";

/**
 * Фаза рендеринга
 * Проверяет необходимость рендера, устанавливает RenderTarget,
 * очищает буфер, настраивает camera layers, обновляет матрицы на GPU,
 * рендерит сцену, восстанавливает состояние рендерера.
 */

/**
 * Главная функция фазы рендеринга всех слоёв в RenderTarget'ы
 */
export function executeRenderingTargets(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  renderer: THREE.WebGLRenderer
): PhaseContext {
  if (!config.enabled) {
    return context;
  }
  if (!context.isReadyRef?.v) {
    return context;
  }
  if (!_shouldRender(context)) {
    return context;
  }
  if (!context.scene || !context.camera || !context.rtByBits) {
    return context;
  }
  
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevClearA = renderer.getClearAlpha();
  
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const rt = context.rtByBits.get(b);
    if (!rt) continue;
    
    _setRenderTarget(renderer, rt);
    _clearBuffer(renderer, new THREE.Color(config.layers[b].bg), 1);
    _setCameraLayers(context.camera, b);
    _flushInstanceMatrices(context, b);
    _renderScene(renderer, context.scene, context.camera);
  }
  
  _restoreRendererState(renderer, prevTarget, prevClear, prevClearA);
  
  context._lastRenderedSec = context._lastTimeSec ?? context._lastRenderedSec;
  context._shouldRenderThisFrame = false;
  
  return context;
}

/**
 * Главная функция фазы рендеринга одного слоя на экран
 */
export function executeRenderingLayerToScreen(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  renderer: THREE.WebGLRenderer,
  bits: FruitLayerBits
): void {
  if (!config.enabled) {
    return;
  }
  if (!context.isReadyRef?.v) {
    return;
  }
  if (!context.scene || !context.camera) {
    return;
  }
  
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevClearA = renderer.getClearAlpha();
  
  _setRenderTarget(renderer, null);
  _clearBuffer(renderer, new THREE.Color(config.layers[bits].bg), 1);
  _setCameraLayers(context.camera, bits);
  _flushInstanceMatrices(context, bits);
  _renderScene(renderer, context.scene, context.camera);
  
  _restoreRendererState(renderer, prevTarget, prevClear, prevClearA);
}

/**
 * Главная функция фазы рендеринга (для совместимости с PhaseFunction)
 */
export const executeRendering: PhaseFunction = (context) => {
  // Рендеринг вызывается динамически из renderTargets/renderLayerToScreen
  return context;
};

/**
 * Проверка необходимости рендера
 */
function _shouldRender(context: PhaseContext): boolean {
  return context._shouldRenderThisFrame === true;
}

/**
 * Установка RenderTarget
 */
function _setRenderTarget(
  renderer: THREE.WebGLRenderer,
  rt: THREE.WebGLRenderTarget | null
): void {
  renderer.setRenderTarget(rt);
}

/**
 * Очистка буфера
 */
function _clearBuffer(
  renderer: THREE.WebGLRenderer,
  color: THREE.Color,
  alpha: number
): void {
  renderer.setClearColor(color, alpha);
  renderer.clear(true, true, true);
}

/**
 * Настройка camera layers
 */
function _setCameraLayers(
  camera: THREE.PerspectiveCamera,
  bits: FruitLayerBits
): void {
  camera.layers.set(bits);
}

/**
 * Обновление матриц на GPU
 */
function _flushInstanceMatrices(
  context: PhaseContext,
  bits: FruitLayerBits
): void {
  if (!context.typeLayers) {
    return;
  }
  
  for (const tl of context.typeLayers) {
    if (tl.bits !== bits) continue;
    if (!tl._dirty) continue;
    for (const m of tl.meshes) {
      m.instanceMatrix.needsUpdate = true;
    }
    tl._dirty = false;
  }
}

/**
 * Рендер сцены
 */
function _renderScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): void {
  renderer.render(scene, camera);
}

/**
 * Восстановление состояния рендерера
 */
function _restoreRendererState(
  renderer: THREE.WebGLRenderer,
  prevTarget: THREE.WebGLRenderTarget | null,
  prevClear: THREE.Color,
  prevClearA: number
): void {
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevClearA);
}


