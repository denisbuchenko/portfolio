import * as THREE from "three";
import type {
  FruitBackgroundPresetsConfig,
  FruitLayerBits,
  FruitBackgroundRenderer,
  Product
} from "../types";
import type { FruitsConfig } from "../config";
import { FruitsProject } from "../project";
import { selectUniqueLayerProducts } from "./productSelection";

const LAYER_BITS = [1, 2, 3, 4, 5, 6, 7] as const;
// Не ограничиваемся искусственным 2048 — используем аппаратный лимит (renderer.capabilities.maxTextureSize),
// а до первого render() держим “широкий” дефолт.
const DEFAULT_MAX_TEXTURE_SIZE = 16384;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

function _createLayerConfig(
  preset: FruitBackgroundPresetsConfig,
  layerBits: FruitLayerBits,
  selectedProductNames: string[]
): FruitsConfig {
  const layer = preset.layers[layerBits];
  const selectedProducts = selectedProductNames;

  const instancesPerProduct = layer.fruits?.countInstances
    ? Math.floor(layer.fruits.countInstances * preset.instanceMul)
    : Math.floor(10 * preset.instanceMul);

  const sizeMultiplier = preset.sizeMul * 0.01;

  return {
    gltfUrl: preset.gltfUrl,
    backgroundColor: layer.bg,
    motion: {
      direction: layer.dir,
      speedCssPxPerSec: layer.speedCssPxPerSec,
    },
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

function _createLayerRenderTarget(
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

async function _initializeBackgroundLayers(
  config: FruitBackgroundPresetsConfig,
  projects: Map<FruitLayerBits, FruitsProject>,
  targetWidth: number,
  targetHeight: number,
  products: Product[]
): Promise<void> {
  const selectedByBits = selectUniqueLayerProducts(config, products);
  await Promise.all(
    LAYER_BITS.map(async (bits) => {
      const selected = selectedByBits.get(bits) ?? [];
      const layerConfig = _createLayerConfig(config, bits, selected);

      const project = new FruitsProject();
      project.setup(layerConfig, products, targetWidth, targetHeight, 1);

      projects.set(bits, project);
    })
  );
}

export function createFruitBackgroundRenderer({
  config,
}: {
  config: FruitBackgroundPresetsConfig;
}): FruitBackgroundRenderer {
  const projects = new Map<FruitLayerBits, FruitsProject>();
  const renderTargets = new Map<FruitLayerBits, THREE.WebGLRenderTarget>();
  const activeLayers = { value: new Set<FruitLayerBits>(LAYER_BITS) }; // По умолчанию все слои активны
  let maxTextureSize = DEFAULT_MAX_TEXTURE_SIZE;

  const isLoaded = { value: false };
  let loadPromise: Promise<void> | null = null;
  let currentWidth = 0;
  let currentHeight = 0;
  let lastDpr = 1;

  // throttle: если updateFps=30, то целимся примерно в 1/30 сек обновления текстур
  const minFrameIntervalSec = config.updateFps > 0 ? 1 / config.updateFps : 0;
  let lastUpdateTimeSec = -1;
  let accumulatedSec = 0;
  let isRenderDue = true;

  // Инициализация загрузки
  loadPromise = (async () => {
    try {
      const rtWidth = Math.min(
        maxTextureSize,
        Math.max(1, Math.floor(DEFAULT_WIDTH * config.rtScale))
      );
      const rtHeight = Math.min(
        maxTextureSize,
        Math.max(1, Math.floor(DEFAULT_HEIGHT * config.rtScale))
      );

      currentWidth = rtWidth;
      currentHeight = rtHeight;

      const loaderProject = new FruitsProject();
      const products = await loaderProject.load(config.gltfUrl);

      await _initializeBackgroundLayers(
        config,
        projects,
        rtWidth,
        rtHeight,
        products
      );

      // RenderTargets создаём сразу, но реальный рендер делаем через main renderer пазла.
      for (const bits of LAYER_BITS) {
        renderTargets.set(bits, _createLayerRenderTarget(rtWidth, rtHeight));
      }
      isLoaded.value = true;
    } catch (err) {
      console.error("Background initialization failed:", err);
      dispose();
      throw err;
    }
  })();

  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    const rt = renderTargets.get(bits);
    const tex = rt?.texture;
    if (!tex) {
      const placeholder = new THREE.DataTexture(
        new Uint8Array([64, 64, 64, 255]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      );
      placeholder.needsUpdate = true;
      return placeholder;
    }

    return tex;
  }

  function dispose(): void {
    projects.forEach(p => p.dispose());
    renderTargets.forEach(rt => rt.dispose());
  }

  function setActiveLayers(activeBits: Set<FruitLayerBits>): void {
    activeLayers.value = activeBits;
  }

  async function load(): Promise<void> {
    if (loadPromise) {
      await loadPromise;
    }
  }

  function resize(w: number, h: number, dpr: number): void {
    if (!isLoaded.value) return;
    lastDpr = Math.max(0.1, dpr || 1);

    const rtWidth = Math.min(
      maxTextureSize,
      Math.max(1, Math.floor(w * config.rtScale))
    );
    const rtHeight = Math.min(
      maxTextureSize,
      Math.max(1, Math.floor(h * config.rtScale))
    );

    // Обновляем размеры только если они изменились
    if (rtWidth !== currentWidth || rtHeight !== currentHeight) {
      currentWidth = rtWidth;
      currentHeight = rtHeight;

      // Обновляем размеры render targets
      for (const renderTarget of renderTargets.values()) {
        if (renderTarget.width !== rtWidth || renderTarget.height !== rtHeight) {
          renderTarget.setSize(rtWidth, rtHeight);
        }
      }

      // Обновляем размеры проектов
      for (const project of projects.values()) {
        project.resize(rtWidth, rtHeight, lastDpr);
      }
    }
  }

  function update(timeSec: number, _dpr: number): void {
    if (!isLoaded.value) return;

    // Обновляем только активные проекты
    const activeLayersSet = activeLayers.value;
    for (const bits of activeLayersSet) {
      const project = projects.get(bits);
      if (project) {
        project.update(timeSec);
      }
    }

    // решаем, пора ли обновлять рендер-таргеты (throttle)
    if (minFrameIntervalSec <= 0) {
      isRenderDue = true;
      return;
    }

    if (lastUpdateTimeSec < 0) {
      lastUpdateTimeSec = timeSec;
      accumulatedSec = minFrameIntervalSec;
      isRenderDue = true;
      return;
    }

    const dt = Math.max(0, timeSec - lastUpdateTimeSec);
    lastUpdateTimeSec = timeSec;
    accumulatedSec += dt;
    if (accumulatedSec >= minFrameIntervalSec) {
      accumulatedSec = 0;
      isRenderDue = true;
    }
  }

  function renderTargetsFn(renderer: THREE.WebGLRenderer): Map<FruitLayerBits, THREE.WebGLRenderTarget> {
    if (!isLoaded.value) return renderTargets;
    if (!renderer) return renderTargets;

    // Узнаём реальный лимит GPU и (если надо) ужимаем RT/проекты один раз.
    maxTextureSize = Math.max(1, renderer.capabilities.maxTextureSize || maxTextureSize);
    if (currentWidth > maxTextureSize || currentHeight > maxTextureSize) {
      const clampedW = Math.min(currentWidth, maxTextureSize);
      const clampedH = Math.min(currentHeight, maxTextureSize);
      if (clampedW !== currentWidth || clampedH !== currentHeight) {
        currentWidth = clampedW;
        currentHeight = clampedH;
        for (const rt of renderTargets.values()) rt.setSize(clampedW, clampedH);
        for (const project of projects.values()) project.resize(clampedW, clampedH, lastDpr);
      }
    }

    // Доп. защита: не рендерим чаще, чем нужно (config.updateFps)
    if (!isRenderDue) return renderTargets;
    isRenderDue = false;

    const prevRt = renderer.getRenderTarget();
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevAutoClear = renderer.autoClear;

    renderer.autoClear = false;

    // Рендерим только активные слои
    const activeLayersSet = activeLayers.value;
    for (const bits of activeLayersSet) {
      const project = projects.get(bits);
      const rt = renderTargets.get(bits);
      if (!project || !rt) continue;

      renderer.setRenderTarget(rt);
      if (project.config?.backgroundColor) {
        renderer.setClearColor(new THREE.Color(project.config.backgroundColor), 1);
      } else {
        renderer.setClearColor(0x000000, 0);
      }
      renderer.clear(true, true, false);
      project.render(renderer);
    }

    renderer.setRenderTarget(prevRt);
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    renderer.autoClear = prevAutoClear;

    return renderTargets;
  }

  return {
    load,
    resize,
    update,
    renderTargets: renderTargetsFn,
    getLayerTexture,
    setActiveLayers,
  } as unknown as FruitBackgroundRenderer;
}

