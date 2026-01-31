/**
 * Главный модуль проекта фруктов.
 * Экспортирует функции для создания рендерера фона и монтирования проекта.
 */

import * as THREE from "three";
import { FruitsProject } from "./products";
import { createFruitsUI } from "./ui";
import { createFruitsRenderer, resizeRenderer } from "./renderer";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";
import type { FruitsConfig } from "./config";
import type { FruitBackgroundPresetsConfig, FruitLayerBits, FruitBackgroundRenderer } from "./types";

// Экспортируем тип для использования в других модулях
export type { FruitBackgroundRenderer };

/**
 * Создает конфигурацию для проекта фруктов на основе глобального конфига.
 */
function createFruitsConfig(products: Array<{ name: string }>): FruitsConfig {
  const sampleProducts = products.slice(0, Math.min(5, products.length));
  console.log(`Используем продуктов: ${sampleProducts.length}`, sampleProducts.map(p => p.name));

  return {
    gltfUrl: CONFIG.puzzle.background3d.gltfUrl,
    backgroundColor: "#00506f",
    camera: {
      fov: CONFIG.puzzle.background3d.camera.fovDeg
    },
    products: sampleProducts.map((p, i) => ({
      productName: p.name,
      count: 3 + i * 2,
      size: { min: 2.0, max: 4.0 }
    })),
    seed: CONFIG.puzzle.background3d.seed
  };
}

/**
 * Создает конфигурацию для слоя фона на основе пресетов.
 */
function createLayerConfig(
  preset: FruitBackgroundPresetsConfig,
  bits: FruitLayerBits,
  products: Array<{ name: string }>
): FruitsConfig {
  const layer = preset.layers[bits];
  const allProductNames = products.map(p => p.name);
  
  // Фильтруем продукты согласно конфигу слоя
  let filteredProducts = allProductNames;
  if (layer.fruits?.include) {
    filteredProducts = filteredProducts.filter(name => layer.fruits!.include!.includes(name));
  }
  if (layer.fruits?.exclude) {
    filteredProducts = filteredProducts.filter(name => !layer.fruits!.exclude!.includes(name));
  }
  
  // Ограничиваем количество типов продуктов
  const countTypes = layer.fruits?.countTypes ?? preset.counts.bits1to5;
  const selectedProducts = filteredProducts.slice(0, countTypes);
  
  // Количество инстансов на продукт
  const countInstances = layer.fruits?.countInstances ?? Math.floor(10 * preset.instanceMul);
  
  return {
    gltfUrl: preset.gltfUrl,
    backgroundColor: layer.bg,
    camera: {
      fov: preset.camera.fovDeg
    },
    products: selectedProducts.map(name => ({
      productName: name,
      count: countInstances,
      size: {
        min: layer.sizeCssPx.min * preset.sizeMul * 0.01,
        max: layer.sizeCssPx.max * preset.sizeMul * 0.01
      }
    })),
    seed: preset.seed
  };
}

/**
 * Создает рендерер фона для проекта пазлов.
 * Рендерит отдельные сцены для каждого слоя (bits 1-7) в RenderTarget.
 */
export function createFruitBackgroundRenderer(opts: {
  config: FruitBackgroundPresetsConfig;
  ui?: { canvas: HTMLCanvasElement; statusEl: HTMLDivElement } | undefined;
}): FruitBackgroundRenderer {
  const { config } = opts;
  let projects: Map<FruitLayerBits, FruitsProject> = new Map();
  let renderTargetsMap: Map<FruitLayerBits, THREE.WebGLRenderTarget> = new Map();
  let width = 0;
  let height = 0;
  let lastUpdateTime = 0;
  let isLoaded = false;

  // Создаем offscreen renderer для рендеринга в текстуры
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

  async function load(): Promise<void> {
    if (isLoaded) return;

    // Инициализируем размеры если еще не установлены
    if (width === 0 || height === 0) {
      width = 1920; // Дефолтные размеры
      height = 1080;
    }

    // Загружаем продукты один раз
    const tempProject = new FruitsProject();
    const products = await tempProject.load(config.gltfUrl);
    console.log(`Загружено продуктов для фона: ${products.length}`);

    // Создаем проекты для каждого слоя
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const layerConfig = createLayerConfig(config, b, products);
      
      const project = new FruitsProject();
      // Загружаем продукты в проект
      await project.load(config.gltfUrl);
      
      // Настраиваем проект с размером на основе rtScale
      const rtWidth = Math.max(1, Math.floor(width * config.rtScale));
      const rtHeight = Math.max(1, Math.floor(height * config.rtScale));
      project.setup(layerConfig, rtWidth, rtHeight);
      
      projects.set(b, project);
      
      // Создаем RenderTarget для этого слоя
      const rt = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        colorSpace: THREE.SRGBColorSpace
      });
      renderTargetsMap.set(b, rt);
    }

    isLoaded = true;
  }

  function resize(w: number, h: number, _dprValue: number): void {
    width = w;
    height = h;

    const rtWidth = Math.floor(w * config.rtScale);
    const rtHeight = Math.floor(h * config.rtScale);

    // Обновляем размеры RenderTarget
    for (const rt of renderTargetsMap.values()) {
      rt.setSize(rtWidth, rtHeight);
    }

    // Обновляем размеры проектов
    for (const project of projects.values()) {
      project.resize(rtWidth, rtHeight);
    }

    offscreenRenderer.setSize(rtWidth, rtHeight, false);
  }

  function update(timeSec: number, _dprValue: number): void {
    if (!isLoaded) return;

    // Обновляем анимацию с учетом updateFps
    const targetFps = config.updateFps > 0 ? config.updateFps : 60;
    const frameTime = 1.0 / targetFps;
    const now = timeSec;
    
    if (now - lastUpdateTime >= frameTime) {
      lastUpdateTime = now;
      
      for (const project of projects.values()) {
        project.update(now);
      }
    }
  }

  function renderTargets(_rendererInstance: THREE.WebGLRenderer): void {
    if (!isLoaded) return;

    // Рендерим каждый слой в свой RenderTarget
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const project = projects.get(b);
      const rt = renderTargetsMap.get(b);
      
      if (!project || !rt) continue;

      // Рендерим в RenderTarget
      offscreenRenderer.setRenderTarget(rt);
      project.render(offscreenRenderer);
    }

    offscreenRenderer.setRenderTarget(null);
  }

  function renderLayerToScreen(_rendererInstance: THREE.WebGLRenderer, _bits: FruitLayerBits): void {
    // Заглушка - не используется в puzzleRenderer
  }

  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    const rt = renderTargetsMap.get(bits);
    if (!rt) {
      // Возвращаем пустую текстуру как заглушку
      const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    return rt.texture;
  }

  return {
    load,
    resize,
    update,
    renderTargets,
    renderLayerToScreen,
    getLayerTexture
  };
}

/**
 * Монтирует проект фруктов в указанный элемент.
 * Используется для прямого запуска проекта фруктов (не через puzzle).
 *
 * @param host - Родительский элемент для монтирования
 */
export async function mountFruitsProject(host: HTMLElement): Promise<void> {
  // UI
  const ui = createFruitsUI(host);

  // Рендер
  const renderer = createFruitsRenderer(ui.canvas);

  // Создаем проект
  const project = new FruitsProject();

  // Функция resize
  function resize(): { w: number; h: number; dpr: number } {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    project.resize(w, h);
    return { w, h, dpr };
  }

  // Загрузка моделей
  ui.statusEl.textContent = "Загружаю модели фруктов…";
  const products = await project.load(CONFIG.puzzle.background3d.gltfUrl);
  console.log(`Загружено продуктов: ${products.length}`);

  // Создаем конфиг
  const config = createFruitsConfig(products);

  // Настройка
  const { w, h } = resize();
  project.setup(config, w, h);

  ui.statusEl.textContent = "Готово!";

  // Рендер-луп
  let lastT = performance.now();
  function frame(tNow: number): void {
    requestAnimationFrame(frame);

    const dt = Math.min(0.033, Math.max(0.001, (tNow - lastT) * 0.001));
    lastT = tNow;
    const timeSec = tNow * 0.001;

    // Resize при изменении размеров
    const { dpr } = resize();

    // Обновление анимации и рендер
    project.update(timeSec);
    project.render(renderer);

    // Обновление статуса
    ui.statusEl.textContent = `Фрукты • dt=${(dt * 1000).toFixed(1)}ms • DPR=${dpr.toFixed(2)}`;
  }

  // Запуск рендер-лупа
  requestAnimationFrame(frame);

  // Обработка resize окна
  window.addEventListener("resize", () => resize());
}
