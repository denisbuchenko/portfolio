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
const DEBUG_DELAY_MS = 5000;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const MAX_FRAME_TIME = 0.033;
const MIN_FRAME_TIME = 0.001;
const MAX_TEXTURE_SIZE = 2048; // Максимальный размер текстуры для совместимости

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
    colorSpace: THREE.SRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false
  });
}

/**
 * Создаёт DataTexture для обмена между контекстами
 */
function createSharedTexture(
  width: number,
  height: number
): THREE.DataTexture {
  // Инициализируем черной текстурой
  const data = new Uint8Array(width * height * 4);
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
    undefined,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    THREE.LinearFilter,
    THREE.LinearFilter,
    0,
    THREE.SRGBColorSpace
  );
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Копирует данные из рендер-таргета в DataTexture
 */
function copyRenderTargetToTexture(
  renderTarget: THREE.WebGLRenderTarget,
  targetTexture: THREE.DataTexture,
  renderer: THREE.WebGLRenderer
): void {
  const gl = renderer.getContext() as WebGLRenderingContext;
  const width = renderTarget.width;
  const height = renderTarget.height;
  
  // Буфер для чтения пикселей
  const pixelBuffer = new Uint8Array(width * height * 4);
  
  // Читаем из рендер-таргета
  renderer.setRenderTarget(renderTarget);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
  renderer.setRenderTarget(null);
  
  // Копируем данные в текстуру (с переворотом по Y)
  const targetData = targetTexture.image.data;
  if (!targetData) {
    console.error('❌ targetData is null');
    return;
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - 1 - y) * width + x) * 4; // Переворачиваем Y
      const dstIdx = (y * width + x) * 4;
      
      targetData[dstIdx + 0] = pixelBuffer[srcIdx + 0]; // R
      targetData[dstIdx + 1] = pixelBuffer[srcIdx + 1]; // G
      targetData[dstIdx + 2] = pixelBuffer[srcIdx + 2]; // B
      targetData[dstIdx + 3] = pixelBuffer[srcIdx + 3]; // A
    }
  }
  
  targetTexture.needsUpdate = true;
}

/**
 * Инициализирует все 7 слоёв фона
 */
async function initializeBackgroundLayers(
  config: FruitBackgroundPresetsConfig,
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
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
    
    // Создание общей текстуры для обмена
    const sharedTexture = createSharedTexture(targetWidth, targetHeight);
    sharedTextures.set(bits, sharedTexture);
    
    console.log(`📊 Layer ${bits} initialized:`, {
      products: layerConfig.products.length,
      instances: layerConfig.products[0]?.count || 0,
      size: `${targetWidth}x${targetHeight}`
    });
  }
}

/**
 * Внутренний рендер-цикл для фруктового фона
 */
function runBackgroundRenderLoop(
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  renderer: THREE.WebGLRenderer,
  isLoadedRef: { value: boolean },
  debugMode: boolean = false
): void {
  let frameCount = 0;
  
  function loop(timestamp: number): void {
    requestAnimationFrame(loop);
    
    if (!isLoadedRef.value) return;
    
    const timeSec = timestamp * 0.001;
    
    // Обновление анимации всех слоёв
    for (const project of projects.values()) {
      project.update(timeSec);
    }
    
    // Рендеринг каждого слоя в свой рендер-таргет и копирование в общую текстуру
    for (let bits = 1 as FruitLayerBits; bits <= 7; bits++) {
      const project = projects.get(bits);
      const renderTarget = renderTargets.get(bits);
      const sharedTexture = sharedTextures.get(bits);
      
      if (!project || !renderTarget || !sharedTexture) continue;
      
      // Рендеринг в рендер-таргет
      renderer.setRenderTarget(renderTarget);
      
      // Установка цвета фона из конфига
      if (project.config?.backgroundColor) {
        const bgColor = new THREE.Color(project.config.backgroundColor);
        renderer.setClearColor(bgColor, 1);
      } else {
        renderer.setClearColor(0x000000, 0);
      }
      
      renderer.clear();
      project.render(renderer);
      
      // Копирование в общую текстуру для обмена
      copyRenderTargetToTexture(renderTarget, sharedTexture, renderer);
    }
    
    renderer.setRenderTarget(null);
    
    // Лог каждые 60 кадров для отладки
    if (debugMode && frameCount % 60 === 0) {
      const layer1Texture = sharedTextures.get(1);
      if (layer1Texture) {
        const width = layer1Texture.image.width;
        const height = layer1Texture.image.height;
        const data = layer1Texture.image.data;
        
        if (data) {
          // Проверяем центральный пиксель
          const centerIdx = ((height / 2) * width + width / 2) * 4;
          const isBlack = data[centerIdx] === 0 && data[centerIdx + 1] === 0 && data[centerIdx + 2] === 0;
          
          console.log(`🎬 Background render loop - Frame ${frameCount}`, {
            active: true,
            layer1CenterPixel: {
              r: data[centerIdx],
              g: data[centerIdx + 1],
              b: data[centerIdx + 2],
              a: data[centerIdx + 3],
              isBlack
            }
          });
        }
      }
    }
    
    frameCount++;
  }
  
  requestAnimationFrame(loop);
}

/**
 * Запускает отладку текстур через задержку
 */
function scheduleTextureDebug(
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  delayMs: number = DEBUG_DELAY_MS
): void {
  setTimeout(() => {
    console.log('🔍 Отладка текстур фона');
    
    const sharedTexture = sharedTextures.get(1);
    if (!sharedTexture) {
      console.error('❌ Shared texture для слоя 1 не найдена!');
      return;
    }
    
    const width = sharedTexture.image.width;
    const height = sharedTexture.image.height;
    const data = sharedTexture.image.data;
    
    if (!data) {
      console.error('❌ Shared texture data is null!');
      return;
    }
    
    // Проверяем центральный пиксель
    const centerIdx = ((height / 2) * width + width / 2) * 4;
    console.log('📊 Shared texture info:', {
      width,
      height,
      centerPixel: {
        r: data[centerIdx],
        g: data[centerIdx + 1],
        b: data[centerIdx + 2],
        a: data[centerIdx + 3]
      },
      isBlack: data[centerIdx] === 0 && data[centerIdx + 1] === 0 && data[centerIdx + 2] === 0
    });
    
    // Показываем в отладчике
    showTextureDebug(sharedTexture, `Layer 1 (Shared)`);
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
  const sharedTextures = new Map<FruitLayerBits, THREE.DataTexture>(); // Для обмена между контекстами

  const offscreenCanvas = document.createElement("canvas");
  const offscreenRenderer = new THREE.WebGLRenderer({
    canvas: offscreenCanvas,
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false // Не нужно для production
  });
  
  offscreenRenderer.setPixelRatio(1);
  offscreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
  offscreenRenderer.autoClear = false;
  offscreenRenderer.setClearColor(0x000000, 0);
  
  const isLoaded = { value: false };
  
  // ─── ИНИЦИАЛИЗАЦИЯ ────────────────────────────────────────────────────────────
  (async () => {
    // Расчёт размеров рендер-таргетов с ограничением
    const rtWidth = Math.min(
      MAX_TEXTURE_SIZE,
      Math.max(1, Math.floor(DEFAULT_WIDTH * config.rtScale))
    );
    const rtHeight = Math.min(
      MAX_TEXTURE_SIZE,
      Math.max(1, Math.floor(DEFAULT_HEIGHT * config.rtScale))
    );
    
    console.log(`📐 RenderTarget size: ${rtWidth}x${rtHeight}`);
    
    // Инициализация слоёв
    await initializeBackgroundLayers(
      config,
      projects,
      renderTargets,
      sharedTextures,
      rtWidth,
      rtHeight
    );
    
    offscreenRenderer.setSize(rtWidth, rtHeight, false);
    console.log(`✅ Offscreen renderer initialized: ${offscreenCanvas.width}x${offscreenCanvas.height}`);
    
    isLoaded.value = true;
    
    // Запуск рендер-цикла
    runBackgroundRenderLoop(projects, renderTargets, sharedTextures, offscreenRenderer, isLoaded, debug);
    
    // Запуск отладки если включен режим
    if (debug) {
      scheduleTextureDebug(sharedTextures);
    }
  })();
  
  // ─── ПОЛУЧЕНИЕ ТЕКСТУРЫ СЛОЯ ──────────────────────────────────────────────────
  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    const sharedTexture = sharedTextures.get(bits);
    
    if (!sharedTexture) {
      // Заглушка для ещё не инициализированных слоёв
      const placeholder = new THREE.DataTexture(
        new Uint8Array([64, 64, 64, 255]), // Серый для видимости
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      );
      placeholder.needsUpdate = true;
      return placeholder;
    }
    
    return sharedTexture;
  }
  
  // ─── ИНТЕРФЕЙС ────────────────────────────────────────────────────────────────
  return {
    load: async () => {
      // Совместимость с интерфейсом, ничего не делаем
    },
    resize: () => {
      // Ресайз не поддерживается, размер фиксированный
    },
    update: () => {
      // Обновление происходит в рендер-цикле
    },
    renderTargets: () => {
      // Возвращаем карту рендер-таргетов для отладки
      return renderTargets;
    },
    getLayerTexture
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