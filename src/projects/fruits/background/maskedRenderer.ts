import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits, Product } from "../types";
import type { FruitsConfig } from "../config";
import { rand01, DEFAULT_COLOR } from "../core/utils";
import {
  createAnimationAttributes,
  createInstancedProduct,
  markInstancesDirty,
  setInstanceTransform,
} from "../core/instancing";
import { disposeMaterials, setupCamera, updateCameraSize } from "../core/scene";

import fullscreenVert from "../../../shaders/fullscreenQuad.vert.glsl?raw";
import fruitBgMaskedFrag from "../../../shaders/fruitBgMasked.frag.glsl?raw";
import maskedVert from "../shaders/animatedProductMasked.vert.glsl?raw";
import maskedFrag from "../shaders/animatedProductMasked.frag.glsl?raw";

const LAYER_BITS = [1, 2, 3, 4, 5, 6, 7] as const;

type _Bounds = { width: number; height: number };

function _calculateVisibleBounds(
  fovDeg: number,
  width: number,
  height: number,
  distance = 25,
  wrapFactor = 1.5
): _Bounds {
  const fovRad = (fovDeg * Math.PI) / 180;
  const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
  const visibleWidth = visibleHeight * (width / height);
  return { width: visibleWidth * wrapFactor, height: visibleHeight * wrapFactor };
}

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

function _createMaskedAnimatedMaterial(opts: {
  product: Product;
  bounds: _Bounds;
  layerBits: FruitLayerBits;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: maskedVert,
    fragmentShader: maskedFrag,
    uniforms: {
      uTime: { value: 0 },
      map: { value: opts.product.materials[0]?.map ?? null },
      color: { value: new THREE.Color(DEFAULT_COLOR) },
      uBounds: { value: new THREE.Vector2(opts.bounds.width, opts.bounds.height) },

      tMask: { value: null },
      uMaskResolution: { value: new THREE.Vector2(2, 2) },
      uMaskThreshold: { value: 0.06 },
      uLayerBits: { value: opts.layerBits },
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
}

export type FruitMaskedBackgroundRenderer = {
  load(): Promise<void>;
  resize(w: number, h: number, dpr: number): void;
  update(timeSec: number, dpr: number): void;
  render(opts: {
    renderer: THREE.WebGLRenderer;
    maskTex: THREE.Texture;
    width: number;
    height: number;
    threshold: number;
  }): void;
  dispose(): void;
};

export function createFruitMaskedBackgroundRenderer({
  config,
}: {
  config: FruitBackgroundPresetsConfig;
}): FruitMaskedBackgroundRenderer {
  const isLoaded = { value: false };
  let loadPromise: Promise<void> | null = null;

  let _products: Product[] = [];
  let _w = 1;
  let _h = 1;

  const _bgScene = new THREE.Scene();
  const _bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const _maskRes = new THREE.Vector2(2, 2);
  const _bgQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: {
        tMask: { value: null },
        uResolution: { value: new THREE.Vector2(2, 2) },
        uThreshold: { value: config.maskThreshold },
        uClearColor: { value: new THREE.Color(0x070a10) },
        uBgColors: {
          value: LAYER_BITS.map(bits => new THREE.Color(config.layers[bits].bg)) // vec3[7]
        }
      },
      vertexShader: fullscreenVert,
      fragmentShader: fruitBgMaskedFrag
    })
  );
  _bgScene.add(_bgQuad);

  const _scene = new THREE.Scene();
  const _camera = setupCamera(1, 1, config.camera.fovDeg).camera;
  const _layerMeshes: Array<{ bits: FruitLayerBits; instanced: ReturnType<typeof createInstancedProduct>; material: THREE.ShaderMaterial }> = [];

  function _rebuildBoundsAndCamera(): _Bounds {
    updateCameraSize(_camera, _w, _h);
    return _calculateVisibleBounds(config.camera.fovDeg, _w, _h);
  }

  async function load(): Promise<void> {
    if (isLoaded.value) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const { parseGLTF } = await import("../gltfParser");
      _products = await parseGLTF(config.gltfUrl);

      // Стартовый размер, будет перезаписан resize().
      _w = 1;
      _h = 1;
      const bounds = _rebuildBoundsAndCamera();

      // Создаём инстансы по bits=1..7 в одном scene.
      for (const bits of LAYER_BITS) {
        const layerCfg = _createLayerConfig(config, bits, _products);
        const seed = (layerCfg.seed ?? config.seed) | 0;

        let instanceCounter = 0;
        for (const productCfg of layerCfg.products) {
          const product = _products.find(p => p.name === productCfg.productName);
          if (!product) continue;

          const instanced = createInstancedProduct(product, productCfg.count);
          const material = _createMaskedAnimatedMaterial({ product, bounds, layerBits: bits });
          instanced.mesh.material = material;

          // Атрибуты анимации + позиции.
          const startIdx = instanceCounter;
          const attrs = createAnimationAttributes(productCfg.count, seed, bounds, startIdx);
          instanceCounter += productCfg.count;
          const { geometry } = instanced.mesh;
          geometry.setAttribute("aRotationSpeed", attrs.rotationSpeed);
          geometry.setAttribute("aRotationAxis", attrs.rotationAxis);
          geometry.setAttribute("aPhase", attrs.phase);
          geometry.setAttribute("aMovementDirection", attrs.movementDirection);
          geometry.setAttribute("aMovementSpeed", attrs.movementSpeed);
          geometry.setAttribute("aInitialPosition", attrs.initialPosition);

          // Масштабы (детерминированно, как в ProductPlacement.getRandomScale()).
          for (let i = 0; i < productCfg.count; i++) {
            const s = (seed + i * 31 + 100) | 0;
            const r = rand01(s);
            const size = productCfg.size;
            let scale = 1.0;
            if (typeof size === "number") scale = size;
            else if (size) scale = size.min + (size.max - size.min) * r;
            setInstanceTransform(instanced, i, new THREE.Vector3(0, 0, 0), scale);
          }
          markInstancesDirty(instanced);

          instanced.mesh.frustumCulled = false;
          _scene.add(instanced.mesh);
          _layerMeshes.push({ bits, instanced, material });
        }
      }

      isLoaded.value = true;
    })();

    return loadPromise;
  }

  function resize(w: number, h: number, _dpr: number): void {
    _w = Math.max(1, w);
    _h = Math.max(1, h);

    const bounds = _rebuildBoundsAndCamera();

    // uBounds завязан на размер видимой области.
    for (const { material } of _layerMeshes) {
      (material.uniforms.uBounds.value as THREE.Vector2).set(bounds.width, bounds.height);
    }
  }

  function update(timeSec: number, _dpr: number): void {
    if (!isLoaded.value) return;
    for (const { material } of _layerMeshes) {
      if ("uTime" in material.uniforms) material.uniforms.uTime.value = timeSec;
    }
  }

  function render(opts: {
    renderer: THREE.WebGLRenderer;
    maskTex: THREE.Texture;
    width: number;
    height: number;
    threshold: number;
  }): void {
    if (!isLoaded.value) return;

    // Обновляем uniforms маски.
    _maskRes.set(Math.max(1, opts.width), Math.max(1, opts.height));
    const bgMat = _bgQuad.material as THREE.ShaderMaterial;
    (bgMat.uniforms.tMask.value as THREE.Texture | null) = opts.maskTex;
    (bgMat.uniforms.uResolution.value as THREE.Vector2).copy(_maskRes);
    (bgMat.uniforms.uThreshold.value as number) = opts.threshold;
    // bg colors могут меняться, если config редактится в рантайме — синхронизируем.
    (bgMat.uniforms.uBgColors.value as THREE.Color[]) = LAYER_BITS.map(bits => new THREE.Color(config.layers[bits].bg));

    for (const { material, bits } of _layerMeshes) {
      (material.uniforms.tMask.value as THREE.Texture | null) = opts.maskTex;
      (material.uniforms.uMaskResolution.value as THREE.Vector2).copy(_maskRes);
      (material.uniforms.uMaskThreshold.value as number) = opts.threshold;
      (material.uniforms.uLayerBits.value as number) = bits;
    }

    const prevRT = opts.renderer.getRenderTarget();
    const prevAutoClear = opts.renderer.autoClear;
    opts.renderer.setRenderTarget(null);

    // 1) Пер-пиксельный фон по маске.
    opts.renderer.autoClear = true;
    opts.renderer.render(_bgScene, _bgCam);

    // 2) Фрукты поверх (с depth), но без очистки.
    opts.renderer.autoClear = false;
    opts.renderer.render(_scene, _camera);

    opts.renderer.autoClear = prevAutoClear;
    opts.renderer.setRenderTarget(prevRT);
  }

  function dispose(): void {
    for (const { instanced, material } of _layerMeshes) {
      instanced.mesh.geometry.dispose();
      disposeMaterials(material);
    }
    _layerMeshes.length = 0;
    (_bgQuad.material as THREE.Material).dispose();
    (_bgQuad.geometry as THREE.BufferGeometry).dispose();
    isLoaded.value = false;
  }

  return { load, resize, update, render, dispose };
}

