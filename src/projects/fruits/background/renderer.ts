import * as THREE from "three";
import type {
  FruitBackgroundPresetsConfig,
  FruitLayerBits,
  FruitBackgroundRenderer,
  Product
} from "../types";
import type { FruitsConfig } from "../config";
import { FruitsProject } from "../project";
import { showTextureDebug } from "../debug/texture";

const LAYER_BITS = [1, 2, 3, 4, 5, 6, 7] as const;
const MAX_TEXTURE_SIZE = 2048;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEBUG_DELAY_MS = 5000;

function _createLayerConfig(
  preset: FruitBackgroundPresetsConfig,
  layerBits: FruitLayerBits,
  allProducts: Array<{ name: string }>
): FruitsConfig {
  const layer = preset.layers[layerBits];
  let productNames = allProducts.map(p => p.name);

  if (layer.fruits?.include) {
    productNames = productNames.filter(name => layer.fruits!.include!.includes(name));
  }
  if (layer.fruits?.exclude) {
    productNames = productNames.filter(name => !layer.fruits!.exclude!.includes(name));
  }

  const maxTypes = layer.fruits?.countTypes ?? preset.counts.bits1to5;
  const selectedProducts = productNames.slice(0, maxTypes);

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

function _createSharedTexture(
  width: number,
  height: number
): THREE.DataTexture {
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

function _copyRenderTargetToTexture(
  renderTarget: THREE.WebGLRenderTarget,
  targetTexture: THREE.DataTexture,
  renderer: THREE.WebGLRenderer
): void {
  const gl = renderer.getContext() as WebGLRenderingContext;
  const width = renderTarget.width;
  const height = renderTarget.height;

  const pixelBuffer = new Uint8Array(width * height * 4);

  renderer.setRenderTarget(renderTarget);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
  renderer.setRenderTarget(null);

  const targetData = (targetTexture.image as any).data as Uint8Array | undefined;
  if (!targetData) return;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - 1 - y) * width + x) * 4;
      const dstIdx = (y * width + x) * 4;

      targetData[dstIdx + 0] = pixelBuffer[srcIdx + 0];
      targetData[dstIdx + 1] = pixelBuffer[srcIdx + 1];
      targetData[dstIdx + 2] = pixelBuffer[srcIdx + 2];
      targetData[dstIdx + 3] = pixelBuffer[srcIdx + 3];
    }
  }

  targetTexture.needsUpdate = true;
}

async function _initializeBackgroundLayers(
  config: FruitBackgroundPresetsConfig,
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  targetWidth: number,
  targetHeight: number,
  products: Product[]
): Promise<void> {
  await Promise.all(
    LAYER_BITS.map(async (bits) => {
      const layerConfig = _createLayerConfig(config, bits, products);

      const project = new FruitsProject();
      project.setup(layerConfig, products, targetWidth, targetHeight);

      projects.set(bits, project);

      const renderTarget = _createLayerRenderTarget(targetWidth, targetHeight);
      renderTargets.set(bits, renderTarget);

      const sharedTexture = _createSharedTexture(targetWidth, targetHeight);
      sharedTextures.set(bits, sharedTexture);
    })
  );
}

function _runBackgroundRenderLoop(
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  renderer: THREE.WebGLRenderer,
  isLoadedRef: { value: boolean },
  debugMode: boolean = false
): () => void {
  let frameCount = 0;
  let animationFrame: number;

  const loop = (timestamp: number): void => {
    animationFrame = requestAnimationFrame(loop);

    if (!isLoadedRef.value) return;

    const timeSec = timestamp * 0.001;

    for (const project of projects.values()) {
      project.update(timeSec);
    }

    for (const bits of LAYER_BITS) {
      const project = projects.get(bits);
      const renderTarget = renderTargets.get(bits);
      const sharedTexture = sharedTextures.get(bits);

      if (!project || !renderTarget || !sharedTexture) continue;

      renderer.setRenderTarget(renderTarget);

      if (project.config?.backgroundColor) {
        const bgColor = new THREE.Color(project.config.backgroundColor);
        renderer.setClearColor(bgColor, 1);
      } else {
        renderer.setClearColor(0x000000, 0);
      }

      renderer.clear();
      project.render(renderer);

      _copyRenderTargetToTexture(renderTarget, sharedTexture, renderer);
    }

    renderer.setRenderTarget(null);

    if (debugMode && frameCount % 60 === 0) {
      const layer1Texture = sharedTextures.get(1);
      const image = layer1Texture?.image as any;
      if (image?.data) {
        const width = image.width as number;
        const height = image.height as number;
        const data = image.data as Uint8Array;
        const centerIdx = ((height / 2) * width + width / 2) * 4;

        console.log(`🎬 Background frame ${frameCount}`, {
          centerPixel: {
            r: data[centerIdx],
            g: data[centerIdx + 1],
            b: data[centerIdx + 2],
            a: data[centerIdx + 3]
          }
        });
      }
    }

    frameCount++;
  };

  animationFrame = requestAnimationFrame(loop);

  return () => cancelAnimationFrame(animationFrame);
}

function _scheduleTextureDebug(
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  delayMs: number = DEBUG_DELAY_MS
): void {
  setTimeout(() => {
    const sharedTexture = sharedTextures.get(1);
    if (!sharedTexture) return;

    const image = sharedTexture.image as any;
    const width = image.width as number;
    const height = image.height as number;
    const data = image.data as Uint8Array | undefined;

    if (!data) return;

    const centerIdx = ((height / 2) * width + width / 2) * 4;
    console.log("📊 Shared texture:", {
      width,
      height,
      centerPixel: {
        r: data[centerIdx],
        g: data[centerIdx + 1],
        b: data[centerIdx + 2],
        a: data[centerIdx + 3]
      }
    });

    showTextureDebug(sharedTexture, "Layer 1 (Shared)");
  }, delayMs);
}

export function createFruitBackgroundRenderer({
  config,
  debug = false
}: {
  config: FruitBackgroundPresetsConfig;
  debug?: boolean;
}): FruitBackgroundRenderer {
  const projects = new Map<FruitLayerBits, FruitsProject>();
  const renderTargets = new Map<FruitLayerBits, THREE.WebGLRenderTarget>();
  const sharedTextures = new Map<FruitLayerBits, THREE.DataTexture>();
  const stopAnimation = { fn: () => {} };

  const offscreenCanvas = document.createElement("canvas");
  const offscreenRenderer = new THREE.WebGLRenderer({
    canvas: offscreenCanvas,
    alpha: true,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });

  offscreenRenderer.setPixelRatio(1);
  offscreenRenderer.outputColorSpace = THREE.SRGBColorSpace;
  offscreenRenderer.autoClear = false;
  offscreenRenderer.setClearColor(0x000000, 0);

  const isLoaded = { value: false };

  (async () => {
    try {
      const rtWidth = Math.min(
        MAX_TEXTURE_SIZE,
        Math.max(1, Math.floor(DEFAULT_WIDTH * config.rtScale))
      );
      const rtHeight = Math.min(
        MAX_TEXTURE_SIZE,
        Math.max(1, Math.floor(DEFAULT_HEIGHT * config.rtScale))
      );

      const loaderProject = new FruitsProject();
      const products = await loaderProject.load(config.gltfUrl);

      await _initializeBackgroundLayers(
        config,
        projects,
        renderTargets,
        sharedTextures,
        rtWidth,
        rtHeight,
        products
      );

      offscreenRenderer.setSize(rtWidth, rtHeight, false);
      isLoaded.value = true;

      stopAnimation.fn = _runBackgroundRenderLoop(
        projects,
        renderTargets,
        sharedTextures,
        offscreenRenderer,
        isLoaded,
        debug
      );

      if (debug) _scheduleTextureDebug(sharedTextures);
    } catch (err) {
      console.error("Background initialization failed:", err);
      dispose();
    }
  })();

  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    const sharedTexture = sharedTextures.get(bits);

    if (!sharedTexture) {
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

    return sharedTexture;
  }

  function dispose(): void {
    stopAnimation.fn();

    projects.forEach(p => p.dispose());
    renderTargets.forEach(rt => rt.dispose());
    sharedTextures.forEach(t => t.dispose());
    offscreenRenderer.dispose();
  }

  return {
    load: async () => {},
    resize: () => {},
    update: () => {},
    // оригинальный тип ожидает renderTargets(renderer), но здесь мы возвращаем сами таргеты
    // чтобы не ломать существующий код, оставляем сигнатуру, но renderer не используется
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    renderTargets: (_renderer?: THREE.WebGLRenderer) => renderTargets,
    getLayerTexture,
  } as unknown as FruitBackgroundRenderer;
}

