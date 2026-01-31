import * as THREE from "three";
import type { FruitBackgroundPresetsConfig } from "../types";
import type { FruitsUI } from "../ui";
import type { RendererState } from "./index";
import { createSolidTexture } from "../utils";

/**
 * Инициализирует базовую структуру рендерера: сцену, камеру, освещение, fallback-текстуры.
 */
export function initializeRenderer(
  config: FruitBackgroundPresetsConfig,
  ui?: FruitsUI
): RendererState {
  const scene = new THREE.Scene();
  
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, -1, 0);
  
  // Настройка освещения
  const lightGroup = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff, config.lighting.ambientIntensity);
  const dir = new THREE.DirectionalLight(0xffffff, config.lighting.dirIntensity);
  dir.position.set(config.lighting.dirDirection.x, config.lighting.dirDirection.y, config.lighting.dirDirection.z).normalize();
  ambient.layers.enableAll();
  dir.layers.enableAll();
  lightGroup.add(ambient);
  lightGroup.add(dir);
  scene.add(lightGroup);
  
  // Создание fallback-текстур
  const fallbackTexByBits: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, THREE.DataTexture> = {
    1: createSolidTexture(config.layers[1].bg),
    2: createSolidTexture(config.layers[2].bg),
    3: createSolidTexture(config.layers[3].bg),
    4: createSolidTexture(config.layers[4].bg),
    5: createSolidTexture(config.layers[5].bg),
    6: createSolidTexture(config.layers[6].bg),
    7: createSolidTexture(config.layers[7].bg)
  };
  
  return {
    ui,
    scene,
    camera,
    lightGroup,
    entries: [],
    typeDefs: new Map(),
    instances: [],
    typeLayers: [],
    viewW: 2,
    viewH: 2,
    dpr: 1,
    cameraZ: 0,
    depthPx: 0,
    rtByBits: new Map(),
    fallbackTexByBits,
    placementByBits: new Map(),
    isReady: false,
    lastTimeSec: null,
    lastRenderedSec: null,
    shouldRenderThisFrame: true
  };
}
