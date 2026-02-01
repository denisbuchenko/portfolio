import * as THREE from "three";
import { FruitsProject } from "./products";
import { createFruitsUI } from "./ui";
import { createFruitsRenderer, resizeRenderer } from "./renderer";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";
import type { FruitsConfig } from "./config";
import type { 
  FruitBackgroundPresetsConfig, 
  FruitLayerBits, 
  FruitBackgroundRenderer 
} from "./types";
import { showTextureDebug } from "./utils";

export type { FruitBackgroundRenderer };
export { showTextureDebug };

// ─── КОНСТАНТЫ ──────────────────────────────────────────────────────────────────
const DEBUG_DELAY_MS = 5000; // Задержка для отладки текстур
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const MAX_FRAME_TIME = 0.033;
const MIN_FRAME_TIME = 0.001;

// ─── ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ────────────────────────────────────────────────────

/**
 * Формирует конфигурацию слоя фона
 */
function createLayerConfig(
  preset: FruitBackgroundPresetsConfig,
  layerBits: FruitLayerBits,
  allProducts: Array<{ name: string }>
): FruitsConfig {
  const layer = preset.layers[layerBits];
  const productNames = allProducts.map(p => p.name);
  
  // Фильтрация продуктов
  let filtered = productNames;
  if (layer.fruits?.include) {
    filtered = filtered.filter(name => layer.fruits!.include!.includes(name));
  }
  if (layer.fruits?.exclude) {
    filtered = filtered.filter(name => !layer.fruits!.exclude!.includes(name));
  }
  
  // Ограничение количества типов
  const maxTypes = layer.fruits?.countTypes ?? preset.counts.bits1to5;
  const selectedProducts = filtered.slice(0, maxTypes);
  
  // Расчёт параметров инстансов
  const instancesPerProduct = layer.fruits?.countInstances 
    ? Math.floor(layer.fruits.countInstances * preset.instanceMul) 
    : Math.floor(10 * preset.instanceMul);
  
  const sizeMultiplier = preset.sizeMul * 0.01;
  
  return {
    gltfUrl: preset.gltfUrl,
    backgroundColor: layer.bg,
    camera: { fov: preset.camera.fovDeg },
    products: selectedProducts.map(name => ({
      productName: name,
      count: instancesPerProduct,
      size: {
        min: layer.sizeCssPx.min * sizeMultiplier,
        max: layer.sizeCssPx.max * sizeMultiplier
      }
    })),
    seed: preset.seed
  };
}

/**
 * Создаёт рендер-таргет для слоя
 */
function createLayerRenderTarget(
  width: number,
  height: number
): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    colorSpace: THREE.SRGBColorSpace
  });
}

/**
 * Инициализирует все 7 слоёв фона
 */
async function initializeBackgroundLayers(
  config: FruitBackgroundPresetsConfig,
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  targetWidth: number,
  targetHeight: number
): Promise<void> {
  // Загрузка моделей один раз
  const loaderProject = new FruitsProject();
  const products = await loaderProject.load(config.gltfUrl);
  console.log(`✅ Загружено ${products.length} типов фруктов для фона`);
  
  // Создание проектов для всех 7 слоёв
  for (let bits = 1 as FruitLayerBits; bits <= 7; bits++) {
    const layerConfig = createLayerConfig(config, bits, products);
    
    const project = new FruitsProject();
    await project.load(config.gltfUrl);
    
    project.setup(layerConfig, targetWidth, targetHeight);
    projects.set(bits, project);
    
    // Создание рендер-таргета
    const renderTarget = createLayerRenderTarget(targetWidth, targetHeight);
    renderTargets.set(bits, renderTarget);
  }
}

/**
 * Внутренний рендер-цикл для фруктового фона
 */
function runBackgroundRenderLoop(
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  renderer: THREE.WebGLRenderer,
  isLoadedRef: { value: boolean }
): void {
  function loop(timestamp: number): void {
    requestAnimationFrame(loop);
    
    if (!isLoadedRef.value) return;
    
    const timeSec = timestamp * 0.001;
    
    // Обновление анимации всех слоёв
    for (const project of projects.values()) {
      project.update(timeSec);
    }
    
    // Рендеринг каждого слоя в свою текстуру
    for (let bits = 1 as FruitLayerBits; bits <= 7; bits++) {
      const project = projects.get(bits);
      const renderTarget = renderTargets.get(bits);
      
      if (!project || !renderTarget) continue;
      
      renderer.setRenderTarget(renderTarget);
      project.render(renderer);
    }
    
    renderer.setRenderTarget(null);
  }
  
  requestAnimationFrame(loop);
}

/**
 * Запускает отладку текстур через задержку
 */
function scheduleTextureDebug(
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  delayMs: number = DEBUG_DELAY_MS
): void {
  setTimeout(() => {
    console.log('🔍 Отладка текстур фона');
    
    for (let bits = 1 as FruitLayerBits; bits <= 7; bits++) {
      const renderTarget = renderTargets.get(bits);
      if (renderTarget) {
        showTextureDebug(renderTarget.texture, `Layer ${bits}`);
      }
    }
  }, delayMs);
}

// ─── ОСНОВНОЙ РЕНДЕРЕР ФОНА ─────────────────────────────────────────────────────

/**
 * Создаёт рендерер фруктового фона с автономным рендер-циклом
 * Возвращает только метод получения текстуры слоя
 */
export function createFruitBackgroundRenderer({
  config,
  debug = false
}: {
  config: FruitBackgroundPresetsConfig;
  debug?: boolean;
}): FruitBackgroundRenderer {
  
  // ─── СОСТОЯНИЕ ────────────────────────────────────────────────────────────────
  const projects = new Map<FruitLayerBits, FruitsProject>();
  const renderTargets = new Map<FruitLayerBits, THREE.WebGLRenderTarget>();
  
  const offscreenCanvas = document.createElement("canvas");
  const offscreenRenderer = new THREE.WebGLRenderer({
    canvas: offscreenCanvas,
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  
  offscreenRenderer.setPixelRatio(1);
  offscreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
  offscreenRenderer.autoClear = true;
  
  const isLoaded = { value: false };
  
  // ─── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────────────────────
  (async () => {
    // Расчёт размеров рендер-таргетов
    const rtWidth = Math.max(1, Math.floor(DEFAULT_WIDTH * config.rtScale));
    const rtHeight = Math.max(1, Math.floor(DEFAULT_HEIGHT * config.rtScale));
    
    // Инициализация слоёв
    await initializeBackgroundLayers(
      config,
      projects,
      renderTargets,
      rtWidth,
      rtHeight
    );
    
    offscreenRenderer.setSize(rtWidth, rtHeight, false);
    isLoaded.value = true;
    
    // Запуск рендер-цикла
    runBackgroundRenderLoop(projects, renderTargets, offscreenRenderer, isLoaded);
    
    // Отладка текстур
    if (debug) {
      scheduleTextureDebug(renderTargets);
    }
  })();
  
  // ─── ПОЛУЧЕНИЕ ТЕКСТУРЫ СЛОЯ ──────────────────────────────────────────────────
  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    const renderTarget = renderTargets.get(bits);
    
    if (!renderTarget) {
      // Заглушка
      const placeholder = new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 255]),
        1,
        1
      );
      placeholder.needsUpdate = true;
      return placeholder;
    }
    
    return renderTarget.texture;
  }
  
  // ─── ИНТЕРФЕЙС ────────────────────────────────────────────────────────────────
  return {
    load: async () => {},           // Заглушка
    resize: () => {},         // Заглушка
    update: () => {},         // Заглушка
    renderTargets: () => {},  // Заглушка
    getLayerTexture           // Единственный рабочий метод
  };
}

// ─── УТИЛИТА МОНТИРОВАНИЯ ───────────────────────────────────────────────────────

/**
 * Монтирует фруктовый проект в DOM (для автономного запуска)
 */
export async function mountFruitsProject(host: HTMLElement): Promise<void> {
  // UI и рендерер
  const ui = createFruitsUI(host);
  const renderer = createFruitsRenderer(ui.canvas);
  
  // Проект
  const project = new FruitsProject();
  
  // Ресайз
  function handleResize() {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    project.resize(w, h);
    return { w, h, dpr };
  }
  
  // Загрузка
  ui.statusEl.textContent = "Загрузка моделей фруктов...";
  const products = await project.load(CONFIG.puzzle.background3d.gltfUrl);
  console.log(`✅ Загружено ${products.length} типов фруктов`);
  
  // Конфигурация (слой 1)
  const fruitsConfig = createLayerConfig(
    CONFIG.puzzle.background3d as FruitBackgroundPresetsConfig,
    1,
    products
  );
  
  // Настройка
  const { w, h } = handleResize();
  project.setup(fruitsConfig, w, h);
  ui.statusEl.textContent = "Готово!";
  
  // Рендер-цикл
  let lastTimestamp = performance.now();
  
  function renderLoop(timestamp: number): void {
    requestAnimationFrame(renderLoop);
    
    const deltaSeconds = Math.min(
      MAX_FRAME_TIME,
      Math.max(MIN_FRAME_TIME, (timestamp - lastTimestamp) * 0.001)
    );
    lastTimestamp = timestamp;
    const timeSec = timestamp * 0.001;
    
    const { dpr } = handleResize();
    
    project.update(timeSec);
    project.render(renderer);
    
    ui.statusEl.textContent = 
      `Фрукты • Δt=${(deltaSeconds * 1000).toFixed(1)}мс • DPR=${dpr.toFixed(2)}`;
  }
  
  requestAnimationFrame(renderLoop);
  window.addEventListener("resize", () => handleResize());
}