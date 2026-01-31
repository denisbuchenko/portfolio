import * as THREE from "three";
import type { PhaseContext, PhaseFunction } from "./orchestrator";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import { clamp } from "../utils";

/**
 * Фаза настройки размеров
 * Вычисляет размеры canvas, обновляет RenderTarget'ы, настраивает PerspectiveCamera,
 * позиционирует камеру, очищает кэш размещения.
 */

/**
 * Главная функция фазы настройки размеров
 */
export const executeSizeConfiguration: PhaseFunction = (context) => {
  // Эта фаза вызывается из resize, поэтому размеры передаются отдельно
  // Здесь только инициализация структуры
  return context;
};

/**
 * Функция для выполнения фазы с размерами (вызывается из resize)
 */
export function executeSizeConfigurationWithDimensions(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  w: number,
  h: number,
  dpr: number
): PhaseContext {
  let ctx = context;
  ctx = _calculateCanvasSize(ctx, w, h);
  ctx = _updateRenderTargets(ctx, config, w, h);
  ctx = _configurePerspectiveCamera(ctx, config, w, h);
  ctx = _positionCamera(ctx, config, w, h, dpr);
  ctx = _clearPlacementCache(ctx);
  return ctx;
}


/**
 * Вычисление размеров canvas
 */
function _calculateCanvasSize(
  context: PhaseContext,
  w: number,
  h: number
): PhaseContext {
  context.viewW = w;
  context.viewH = h;
  return context;
}

/**
 * Обновление RenderTarget'ов
 */
function _updateRenderTargets(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  w: number,
  h: number
): PhaseContext {
  if (!context.rtByBits) {
    context.rtByBits = new Map();
  }
  
  const s = clamp(config.rtScale, 0.25, 1.0);
  const tw = Math.max(1, Math.floor(w * s));
  const th = Math.max(1, Math.floor(h * s));
  
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const rt = context.rtByBits.get(b);
    if (!rt) {
      const nrt = new THREE.WebGLRenderTarget(tw, th, {
        depthBuffer: true,
        stencilBuffer: false
      });
      nrt.texture.generateMipmaps = false;
      nrt.texture.minFilter = THREE.LinearFilter;
      nrt.texture.magFilter = THREE.LinearFilter;
      nrt.texture.wrapS = THREE.ClampToEdgeWrapping;
      nrt.texture.wrapT = THREE.ClampToEdgeWrapping;
      context.rtByBits.set(b, nrt);
    } else {
      if (rt.width !== tw || rt.height !== th) {
        rt.setSize(tw, th);
      }
    }
  }
  
  return context;
}

/**
 * Настройка PerspectiveCamera
 */
function _configurePerspectiveCamera(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  w: number,
  h: number
): PhaseContext {
  if (!context.camera) {
    throw new Error("Camera must exist before configuration");
  }
  
  context.camera = new THREE.PerspectiveCamera(
    clamp(config.camera.fovDeg, 12, 85),
    w / Math.max(1, h),
    0.1,
    8000
  );
  context.camera.up.set(0, -1, 0);
  return context;
}

/**
 * Позиционирование камеры
 */
function _positionCamera(
  context: PhaseContext,
  config: FruitBackgroundPresetsConfig,
  w: number,
  h: number,
  dpr: number
): PhaseContext {
  if (!context.camera) {
    throw new Error("Camera must exist before positioning");
  }
  
  const fovRad = (context.camera.fov * Math.PI) / 180;
  context.cameraZ = h / Math.max(1e-3, 2 * Math.tan(fovRad * 0.5));
  context.depthPx = Math.max(1, config.camera.depthCssPx * Math.max(0.5, dpr));
  
  context.camera.position.set(w * 0.5, h * 0.5, context.cameraZ);
  context.camera.lookAt(w * 0.5, h * 0.5, 0);
  context.camera.updateProjectionMatrix();
  
  return context;
}

/**
 * Очистка кэша размещения
 */
function _clearPlacementCache(context: PhaseContext): PhaseContext {
  if (context.placementByBits) {
    context.placementByBits.clear();
  }
  
  // Сбрасываем флаг инициализации для всех инстансов
  if (context.instances) {
    for (const it of context.instances) {
      it._inited = false;
    }
  }
  
  return context;
}

