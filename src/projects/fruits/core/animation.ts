import * as THREE from "three";
import type { FruitBackgroundPresetsConfig } from "../types";
import type { RendererState } from "./index";
import { clamp, rand01, norm2 } from "../utils";
import { createPlacementState, tryPlaceObject } from "../placement";

/**
 * Обновляет анимацию всех инстансов.
 */
export function updateAnimation(
  state: RendererState,
  config: FruitBackgroundPresetsConfig,
  timeSec: number,
  dpr: number
): void {
  if (!config.enabled || !state.isReady) return;
  
  state.dpr = dpr;
  
  // Вычисляем delta time
  const dt = state.lastTimeSec === null
    ? 1 / 60
    : clamp(timeSec - state.lastTimeSec, 1 / 240, 1 / 20);
  state.lastTimeSec = timeSec;
  
  const w = state.viewW | 0;
  const h = state.viewH | 0;
  const margin = config.motion.wrapMarginCssPx * dpr;
  const swayAmp = config.motion.swayAmpCssPx * dpr;
  const swaySpeed = config.motion.swaySpeed;
  const sizeMul = clamp(config.sizeMul, 0.2, 5.0);
  
  // Временные объекты для обновления матриц
  const tmpDeltaQuat = new THREE.Quaternion();
  const tmpMat = new THREE.Matrix4();
  const tmpScale = new THREE.Vector3(1, 1, 1);
  
  // Обновляем каждый инстанс
  for (const it of state.instances) {
    const layer = config.layers[it.bits];
    const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
    const velPx = dirV.clone().multiplyScalar(layer.speedCssPxPerSec * dpr);
    
    // Инициализация позиции (только один раз)
    if (!it._inited) {
      const targetSizePx = (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * it._sizeRand) * dpr * sizeMul;
      const radius = targetSizePx * 0.55;
      
      // Получаем состояние размещения для этого bits-слоя
      let st = state.placementByBits.get(it.bits);
      if (!st) {
        st = createPlacementState(
          it.bits,
          it._typeLayer.count,
          layer.sizeCssPx.max * dpr * sizeMul,
          w,
          h,
          margin,
          dpr,
          config.seed
        );
        state.placementByBits.set(it.bits, st);
      }
      
      // Пытаемся разместить без пересечений
      const chaos = clamp(config.positionChaos, 0.0, 1.0);
      const p = tryPlaceObject(st, it._seed, radius, chaos);
      it._pos.x = p.x;
      it._pos.y = p.y;
      
      // Инициализируем Z-координату
      it._pos.z = (rand01(it._seed + 77) - 0.5) * state.depthPx;
      
      // Помечаем как инициализированного
      it._inited = true;
    }
    
    // Движение по направлению
    it._pos.x += velPx.x * dt;
    it._pos.y += velPx.y * dt;
    
    // Покачивание (sway) перпендикулярно направлению
    const sway = swayAmp * (0.5 + 0.5 * Math.sin(timeSec * (swaySpeed + 0.3 * rand01(it._seed + 7)) + 6.28318 * rand01(it._seed + 11)));
    it._pos.x += -dirV.y * sway * dt;
    it._pos.y += dirV.x * sway * dt;
    
    // Wrap (зацикливание при выходе за границы)
    if (dirV.x > 0.0 && it._pos.x > w + margin) it._pos.x = -margin;
    if (dirV.x < 0.0 && it._pos.x < -margin) it._pos.x = w + margin;
    if (dirV.y > 0.0 && it._pos.y > h + margin) it._pos.y = -margin;
    if (dirV.y < 0.0 && it._pos.y < -margin) it._pos.y = h + margin;
    
    // Масштаб
    const targetSizePx = (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * it._sizeRand) * dpr * sizeMul;
    const scale = it._typeLayer.baseScale * targetSizePx;
    
    // 3D вращение вокруг случайной оси (tumble)
    const delta = it._angVel * dt;
    tmpDeltaQuat.setFromAxisAngle(it._axis, delta);
    it._quat.multiply(tmpDeltaQuat).normalize();
    
    // Обновляем матрицу инстанса
    tmpScale.set(scale, scale, scale);
    tmpMat.compose(it._pos, it._quat, tmpScale);
    for (const mesh of it._typeLayer.meshes) {
      mesh.setMatrixAt(it._index, tmpMat);
    }
    it._typeLayer._dirty = true;
  }
  
  // Управление частотой рендера (если updateFps > 0)
  if (config.updateFps <= 0) {
    state.shouldRenderThisFrame = true;
  } else {
    const step = 1 / Math.max(1, config.updateFps);
    const lastRendered = state.lastRenderedSec ?? null;
    if (lastRendered === null || timeSec - lastRendered >= step) {
      state.shouldRenderThisFrame = true;
    }
  }
}
