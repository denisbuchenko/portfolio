
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
export { showTextureDebug }; // Утилита отладки текстур (вызывается вручную при необходимости)


/**
 * Формирует конфигурацию слоя фона на основе пресета и битовой маски
 * @param preset - Глобальный пресет фона
 * @param layerBits - Битовая маска слоя (1-7)
 * @param allProducts - Список всех доступных продуктов
 */
function createLayerConfig(
  preset: FruitBackgroundPresetsConfig,
  layerBits: FruitLayerBits,
  allProducts: Array<{ name: string }>
): FruitsConfig {
  const layer = preset.layers[layerBits];
  const productNames = allProducts.map(p => p.name);
  
  // ─── ФИЛЬТРАЦИЯ ПРОДУКТОВ ────────────────────────────────────────────────────
  let filtered = productNames;
  
  if (layer.fruits?.include) {
    filtered = filtered.filter(name => layer.fruits!.include!.includes(name));
  }
  if (layer.fruits?.exclude) {
    filtered = filtered.filter(name => !layer.fruits!.exclude!.includes(name));
  }
  
  // ─── ОГРАНИЧЕНИЕ КОЛИЧЕСТВА ТИПОВ ─────────────────────────────────────────────
  const maxTypes = layer.fruits?.countTypes ?? preset.counts.bits1to5;
  const selectedProducts = filtered.slice(0, maxTypes);
  
  // ─── РАСЧЁТ ПАРАМЕТРОВ ИНСТАНСОВ ──────────────────────────────────────────────
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

// ─── ОСНОВНОЙ РЕНДЕРЕР ФОНА ─────────────────────────────────────────────────────

/**
 * Создаёт рендерер многослойного фруктового фона
 * Рендерит 7 независимых слоёв (битовые маски 1-7) в отдельные текстуры
 * @param config - Конфигурация пресетов фона
 * @param ui - Опциональный UI-контейнер (для отладки)
 */
export function createFruitBackgroundRenderer({
  config,
  ui
}: {
  config: FruitBackgroundPresetsConfig;
  ui?: { canvas: HTMLCanvasElement; statusEl: HTMLDivElement };
}): FruitBackgroundRenderer {
  
  // ─── ВНУТРЕННЕЕ СОСТОЯНИЕ ─────────────────────────────────────────────────────
  const projects = new Map<FruitLayerBits, FruitsProject>();
  const renderTargets = new Map<FruitLayerBits, THREE.WebGLRenderTarget>();
  let width = 0;
  let height = 0;
  let lastUpdateTime = 0;
  let isLoaded = false;
  
  // ─── OFFSCREEN РЕНДЕРЕР ───────────────────────────────────────────────────────
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
  
  // ─── ЗАГРУЗКА РЕСУРСОВ ────────────────────────────────────────────────────────
  async function load(): Promise<void> {
    if (isLoaded) return;
    
    // Устанавливаем дефолтные размеры при первой загрузке
    if (width === 0 || height === 0) {
      width = 1920;
      height = 1080;
    }
    
    // Загружаем модели один раз для всех слоёв
    const loaderProject = new FruitsProject();
    const products = await loaderProject.load(config.gltfUrl);
    console.log(`✅ Загружено ${products.length} типов фруктов для фона`);
    
    // Создаём проект и рендер-таргет для каждого слоя (1-7)
    for (let bits = 1 as FruitLayerBits; bits <= 7; bits++) {
      const layerConfig = createLayerConfig(config, bits, products);
      
      // Инициализация проекта слоя
      const project = new FruitsProject();
      await project.load(config.gltfUrl); // Повторная загрузка оптимизируется кэшем
      
      // Расчёт размеров рендер-таргета
      const rtWidth = Math.max(1, Math.floor(width * config.rtScale));
      const rtHeight = Math.max(1, Math.floor(height * config.rtScale));
      
      project.setup(layerConfig, rtWidth, rtHeight);
      projects.set(bits, project);
      
      // Создание текстуры для слоя
      const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        colorSpace: THREE.SRGBColorSpace
      });
      renderTargets.set(bits, renderTarget);
    }
    
    isLoaded = true;
    if (ui?.statusEl) {
      ui.statusEl.textContent = "Фон загружен";
    }
  }
  
  // ─── ОБРАБОТКА ИЗМЕНЕНИЯ РАЗМЕРОВ ─────────────────────────────────────────────
  function resize(w: number, h: number, _dpr: number): void {
    width = w;
    height = h;
    
    const rtWidth = Math.floor(w * config.rtScale);
    const rtHeight = Math.floor(h * config.rtScale);
    
    // Обновляем все рендер-таргеты
    for (const rt of renderTargets.values()) {
      rt.setSize(rtWidth, rtHeight);
    }
    
    // Обновляем размеры всех проектов-слоёв
    for (const project of projects.values()) {
      project.resize(rtWidth, rtHeight);
    }
    
    offscreenRenderer.setSize(rtWidth, rtHeight, false);
  }
  
  // ─── ОБНОВЛЕНИЕ АНИМАЦИИ ──────────────────────────────────────────────────────
  function update(timeSec: number, _dpr: number): void {
    if (!isLoaded) return;
    
    const targetFrameTime = config.updateFps > 0 
      ? 1.0 / config.updateFps 
      : 1.0 / 60;
    
    if (timeSec - lastUpdateTime >= targetFrameTime) {
      lastUpdateTime = timeSec;
      
      // Обновляем анимацию всех слоёв
      for (const project of projects.values()) {
        project.update(timeSec);
      }
    }
  }
  
  // ─── РЕНДЕРИНГ СЛОЁВ В ТЕКСТУРЫ ───────────────────────────────────────────────
  function renderTargetsToTextures(): void {
    if (!isLoaded) return;
    
    // Рендерим каждый слой в свою текстуру
    for (let bits = 1 as FruitLayerBits; bits <= 7; bits++) {
      const project = projects.get(bits);
      const renderTarget = renderTargets.get(bits);
      
      if (!project || !renderTarget) continue;
      
      offscreenRenderer.setRenderTarget(renderTarget);
      project.render(offscreenRenderer);
    }
    
    // Возвращаем рендерер в основной буфер
    offscreenRenderer.setRenderTarget(null);
  }
  
  // ─── ПОЛУЧЕНИЕ ТЕКСТУРЫ СЛОЯ ──────────────────────────────────────────────────
  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    const renderTarget = renderTargets.get(bits);
    
    if (!renderTarget) {
      // Возвращаем чёрную заглушку при отсутствии текстуры
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
  
  // ─── ПУБЛИЧНЫЙ ИНТЕРФЕЙС ──────────────────────────────────────────────────────
  return {
    load,
    resize,
    update,
    renderTargets: renderTargetsToTextures,
    getLayerTexture
  };
}

// ─── УТИЛИТА МОНТИРОВАНИЯ ───────────────────────────────────────────────────────

/**
 * Монтирует интерактивный фруктовый проект в DOM-элемент
 * (Используется для автономного запуска, не через пазл)
 * @param host - Контейнер для встраивания проекта
 */
export async function mountFruitsProject(host: HTMLElement): Promise<void> {
  // ─── КОНСТАНТЫ ────────────────────────────────────────────────────────────────
  const MAX_FRAME_TIME = 0.033; // ~30 FPS (максимальный шаг)
  const MIN_FRAME_TIME = 0.001; // ~1000 FPS (минимальный шаг)
  
  // ─── ИНИЦИАЛИЗАЦИЯ UI И РЕНДЕРЕРА ─────────────────────────────────────────────
  const ui = createFruitsUI(host);
  const renderer = createFruitsRenderer(ui.canvas);
  
  // ─── НАСТРОЙКА ПРОЕКТА ────────────────────────────────────────────────────────
  const project = new FruitsProject();
  
  // Функция обработки ресайза
  function handleResize() {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    project.resize(w, h);
    return { w, h, dpr };
  }
  
  // Загрузка моделей
  ui.statusEl.textContent = "Загрузка моделей фруктов...";
  const products = await project.load(CONFIG.puzzle.background3d.gltfUrl);
  console.log(`✅ Загружено ${products.length} типов фруктов`);
  
  // Формирование конфигурации (используем слой 1 как пример)
  const fruitsConfig = createLayerConfig(
    CONFIG.puzzle.background3d as FruitBackgroundPresetsConfig,
    1,
    products
  );
  
  // Применение конфигурации
  const { w, h } = handleResize();
  project.setup(fruitsConfig, w, h);
  ui.statusEl.textContent = "Готово!";
  
  // ─── РЕНДЕР-ЦИКЛ ──────────────────────────────────────────────────────────────
  let lastTimestamp = performance.now();
  
  function renderLoop(timestamp: number): void {
    requestAnimationFrame(renderLoop);
    
    // Расчёт дельты с ограничениями
    const deltaSeconds = Math.min(
      MAX_FRAME_TIME,
      Math.max(MIN_FRAME_TIME, (timestamp - lastTimestamp) * 0.001)
    );
    lastTimestamp = timestamp;
    const timeSec = timestamp * 0.001;
    
    // Обработка ресайза
    const { dpr } = handleResize();
    
    // Обновление и рендер
    project.update(timeSec);
    project.render(renderer);
    
    // Обновление статуса
    ui.statusEl.textContent = 
      `Фрукты • Δt=${(deltaSeconds * 1000).toFixed(1)}мс • DPR=${dpr.toFixed(2)}`;
  }
  
  // Запуск цикла
  requestAnimationFrame(renderLoop);
  
  // Слушатель ресайза окна
  window.addEventListener("resize", () => handleResize());
}
