import * as THREE from "three";
import type { PhaseContext, PhaseFunction } from "./orchestrator";
import type { FruitBackgroundPresetsConfig } from "../types";
import { createSolidTexture } from "../utils";

/**
 * Фаза инициализации
 * Создаёт базовую структуру: UI, WebGL-рендерер, сцену, камеру, освещение, RenderTarget'ы, fallback-текстуры.
 */

/**
 * Главная функция фазы инициализации
 */
export const executeInitialization: PhaseFunction = (context, config) => {
  let ctx = context;
  ctx = _createUIStructure(ctx);
  ctx = _createWebGLRenderer(ctx);
  ctx = _createScene(ctx);
  ctx = _createCamera(ctx);
  ctx = _createLighting(ctx, config);
  ctx = _createRenderTargets(ctx);
  ctx = _createFallbackTextures(ctx, config);
  
  // Инициализация состояния
  ctx.instances = [];
  ctx.typeLayers = [];
  ctx.isReadyRef = { v: false };
  ctx.placementByBits = new Map();
  ctx._tmpDeltaQuat = new THREE.Quaternion();
  ctx._tmpMat = new THREE.Matrix4();
  ctx._tmpScale = new THREE.Vector3(1, 1, 1);
  ctx._lastTimeSec = null;
  ctx._lastRenderedSec = null;
  ctx._shouldRenderThisFrame = true;
  
  return ctx;
};

/**
 * Создание UI-структуры
 */
function _createUIStructure(context: PhaseContext): PhaseContext {
  // UI опционален - может быть создан позже или не использоваться
  return context;
}

/**
 * Создание WebGL-рендерера
 */
function _createWebGLRenderer(context: PhaseContext): PhaseContext {
  // WebGL-рендерер создаётся извне и передаётся через методы renderTargets/renderLayerToScreen
  // Здесь не создаём, только инициализируем структуру
  return context;
}

/**
 * Создание сцены Three.js
 */
function _createScene(context: PhaseContext): PhaseContext {
  context.scene = new THREE.Scene();
  return context;
}

/**
 * Создание камеры
 */
function _createCamera(context: PhaseContext): PhaseContext {
  context.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  context.camera.up.set(0, -1, 0); // y вниз, как в пазле
  return context;
}

/**
 * Создание освещения
 */
function _createLighting(context: PhaseContext, config: FruitBackgroundPresetsConfig): PhaseContext {
  if (!context.scene) {
    throw new Error("Scene must exist before creating lighting");
  }
  
  const lightGroup = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff, config.lighting.ambientIntensity);
  const dir = new THREE.DirectionalLight(0xffffff, config.lighting.dirIntensity);
  dir.position.set(config.lighting.dirDirection.x, config.lighting.dirDirection.y, config.lighting.dirDirection.z).normalize();
  ambient.layers.enableAll();
  dir.layers.enableAll();
  lightGroup.add(ambient);
  lightGroup.add(dir);
  context.scene.add(lightGroup);
  context.lightGroup = lightGroup;
  return context;
}

/**
 * Создание RenderTarget'ов для всех слоёв
 */
function _createRenderTargets(context: PhaseContext): PhaseContext {
  context.rtByBits = new Map();
  // RenderTarget'ы будут созданы/обновлены в фазе настройки размеров
  return context;
}

/**
 * Создание fallback-текстур
 */
function _createFallbackTextures(context: PhaseContext, config: FruitBackgroundPresetsConfig): PhaseContext {
  context.fallbackTexByBits = {
    1: createSolidTexture(config.layers[1].bg),
    2: createSolidTexture(config.layers[2].bg),
    3: createSolidTexture(config.layers[3].bg),
    4: createSolidTexture(config.layers[4].bg),
    5: createSolidTexture(config.layers[5].bg),
    6: createSolidTexture(config.layers[6].bg),
    7: createSolidTexture(config.layers[7].bg)
  };
  return context;
}


