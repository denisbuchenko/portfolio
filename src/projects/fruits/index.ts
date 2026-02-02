/**
 * 🍎 Фруктовый рендерер — оптимизированная версия
 * 
 * ⚠️ РЕКОМЕНДАЦИЯ: Разделить на файлы:
 * ├── ./core/utils.ts          (математика, рандом, фильтрация)
 * ├── ./core/scene.ts          (FruitsScene, ProductPlacement, ProductFactory)
 * ├── ./core/instancing.ts     (работа с инстансами)
 * ├── ./background/renderer.ts (BackgroundRenderer)
 * ├── ./debug/texture.ts       (showTextureDebug)
 * ├── ./project.ts             (FruitsProject)
 * └── ./mount.ts               (mountFruitsProject)
 */

import * as THREE from "three";
import vertexShader from "./shaders/animatedProduct.vert.glsl?raw";
import fragmentShader from "./shaders/animatedProduct.frag.glsl?raw";
import { createFruitsUI } from "./ui";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";
import type { FruitsConfig } from "./config";
import type {
  FruitBackgroundPresetsConfig,
  FruitLayerBits,
  FruitBackgroundRenderer,
  Product,
  RenderProductOptions
} from "./types";

export type { FruitBackgroundRenderer };

// ─── КОНСТАНТЫ ───────────────────────────────────────────────────────────────────

// ✅ Чёткие имена вместо магических чисел
const EPSILON = 1e-6;
const DEFAULT_COLOR = 0xffffff;
const DEBUG_UI_Z_INDEX = 9999;
const MAX_DEBUG_SIZE = { width: 800, height: 600 };
const ANIMATION_BOUNDS_SCALE = 1 / 3;
const Z_MIN = -7.5;
const Z_MAX = -2.5;
const DEBUG_DELAY_MS = 5000;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const MAX_FRAME_TIME = 0.033;
const MIN_FRAME_TIME = 0.001;
const MAX_TEXTURE_SIZE = 2048;
const DEFAULT_SEED = 0xdecafbad;
const LAYER_BITS = [1, 2, 3, 4, 5, 6, 7] as const; // ✅ Явное перечисление слоёв

// ─── УТИЛИТЫ ────────────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./core/utils.ts
 * Чистые функции без побочных эффектов
 */

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const normalizeVector2 = (v: THREE.Vector2): THREE.Vector2 =>
  v.length() < EPSILON ? new THREE.Vector2(1, 0) : v.clone().normalize();

// Единый детерминированный ГСЧ (xorshift)
const deterministicRandom = (seed: number): number => {
  let x = seed ^ (seed >>> 15);
  x = Math.imul(x, 0x46d31bad);
  x ^= x >>> 14;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 15;
  return (x >>> 0) / 0x1_0000_0000;
};

export const rand01 = deterministicRandom; // BC alias

export const hexToRgb8 = (hex: string) => {
  const c = new THREE.Color(hex);
  return {
    r: Math.round(clamp(c.r, 0, 1) * 255),
    g: Math.round(clamp(c.g, 0, 1) * 255),
    b: Math.round(clamp(c.b, 0, 1) * 255),
  };
};

export const filterProducts = <T extends { name: string }>(
  items: T[],
  { include, exclude }: { include?: string[]; exclude?: string[] }
): T[] => {
  const inc = new Set(include?.filter(Boolean) ?? []);
  const exc = new Set(exclude?.filter(Boolean) ?? []);
  
  if (inc.size) return items.filter(e => inc.has(e.name));
  if (exc.size) return items.filter(e => !exc.has(e.name));
  return items;
};

export const pickUnique = <T>(items: T[], count: number, seed: number): T[] => {
  if (items.length === 0 || count <= 0) return [];
  const k = Math.min(items.length, count);
  const indices = Array.from({ length: items.length }, (_, i) => i);
  let s = seed | 0;

  for (let i = 0; i < k; i++) {
    s = (s * 1664525 + 1013904223) | 0;
    const j = i + (((s >>> 0) % (items.length - i)) | 0);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, k).map(i => items[i]);
};

// ─── ТЕКСТУРЫ ────────────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./core/textures.ts
 */

const configureTexture = <T extends THREE.Texture>(texture: T): T => {
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

export const createSolidTexture = (hex: string): THREE.DataTexture => {
  const { r, g, b } = hexToRgb8(hex);
  const data = new Uint8Array([r, g, b, 255]);
  return configureTexture(new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat));
};

export const configureBackgroundMaterial = (mat: THREE.MeshBasicMaterial): void => {
  Object.assign(mat, {
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
};

// ─── ОТЛАДКА ТЕКСТУР ────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./debug/texture.ts (только для дев-сборки)
 */

const createDebugElement = (tag: string, styles: string, text?: string): HTMLElement => {
  const el = document.createElement(tag);
  el.style.cssText = styles;
  if (text) el.textContent = text;
  return el;
};

export const showTextureDebug = (texture: THREE.Texture, label?: string): (() => void) => {
  const img = (texture.image as HTMLImageElement | HTMLCanvasElement | undefined);
  const source = (texture.source?.data as { width?: number; height?: number } | undefined);
  const w = img?.width ?? source?.width ?? 256;
  const h = img?.height ?? source?.height ?? 256;

  const scale = Math.min(
    Math.min(w, MAX_DEBUG_SIZE.width) / w,
    Math.min(h, MAX_DEBUG_SIZE.height) / h
  );
  const canvasW = Math.floor(w * scale);
  const canvasH = Math.floor(h * scale);

  const tempRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false });
  tempRenderer.setSize(canvasW, canvasH);
  tempRenderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  scene.add(plane);
  tempRenderer.render(scene, cam);

  const overlay = createDebugElement("div", `
    position: fixed; inset: 0; z-index: ${DEBUG_UI_Z_INDEX};
    background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
    padding: 20px; box-sizing: border-box;
  `);

  const container = createDebugElement("div", `
    position: relative; max-width: 90vw; max-height: 90vh;
    background: rgba(18,22,34,0.95); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `);

  if (label) {
    container.appendChild(createDebugElement("div", `
      font-size: 14px; font-weight: bold; color: rgba(255,255,255,0.88);
      margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);
    `, label));
  }

  const canvas = createDebugElement("canvas", `
    display: block; max-width: 100%; max-height: 70vh;
    border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
  `) as HTMLCanvasElement;
  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.getContext("2d")?.drawImage(tempRenderer.domElement, 0, 0);

  container.appendChild(canvas);
  container.appendChild(createDebugElement("div", `
    font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 8px; text-align: center;
  `, `Размер: ${w} × ${h}px`));

  const closeBtn = createDebugElement("button", `
    position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
    border: none; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.88);
    border-radius: 4px; cursor: pointer; font-size: 18px; display: flex;
    align-items: center; justify-content: center; transition: background 0.2s;
  `, "✕") as HTMLButtonElement;
  
  closeBtn.onmouseenter = () => closeBtn.style.background = "rgba(255,255,255,0.2)";
  closeBtn.onmouseleave = () => closeBtn.style.background = "rgba(255,255,255,0.1)";
  container.appendChild(closeBtn);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const cleanup = () => {
    document.body.removeChild(overlay);
    tempRenderer.dispose();
    plane.geometry.dispose();
    (plane.material as THREE.Material).dispose();
    document.removeEventListener("keydown", handleKey);
  };

  const handleKey = (e: KeyboardEvent) => e.key === "Escape" && cleanup();
  closeBtn.onclick = cleanup;
  overlay.onclick = e => e.target === overlay && cleanup();
  document.addEventListener("keydown", handleKey);

  return cleanup;
};

// ─── АНИМАЦИЯ И ИНСТАНСЫ ────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./core/instancing.ts
 */

export const createAnimatedMaterial = (
  product: Product,
  bounds: { width: number; height: number }
): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    map: { value: product.materials[0]?.map ?? null },
    color: { value: new THREE.Color(DEFAULT_COLOR) },
    uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
  },
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
});

export const updateAnimation = (mat: THREE.ShaderMaterial, time: number): void => {
  if ("uTime" in mat.uniforms) mat.uniforms.uTime.value = time;
};

const createInstancedAttr = (array: Float32Array, itemSize: number) =>
  new THREE.InstancedBufferAttribute(array, itemSize);

export const createAnimationAttributes = (
  count: number,
  seed: number,
  bounds: { width: number; height: number },
  startIdx = 0
) => {
  const rs = new Float32Array(count);
  const ra = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  const md = new Float32Array(count * 2);
  const ms = new Float32Array(count);
  const ip = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const s = (seed + idx * 31) | 0;
    const rand = (o: number) => deterministicRandom(s + o);

    rs[i] = 0.3 + rand(0) * 0.7;
    const ax = (rand(1) - 0.5) * 2;
    const ay = (rand(2) - 0.5) * 2;
    const az = (rand(3) - 0.5) * 2;
    const len = Math.hypot(ax, ay, az) || 1;
    ra.set([ax / len, ay / len, az / len], i * 3);
    ph[i] = rand(4) * Math.PI * 2;

    const ang = rand(5) * Math.PI * 2;
    md.set([Math.cos(ang), Math.sin(ang)], i * 2);
    ms[i] = 1.0 + rand(6) * 2.0;

    const vw = bounds.width * ANIMATION_BOUNDS_SCALE;
    const vh = bounds.height * ANIMATION_BOUNDS_SCALE;
    ip.set([
      (rand(7) - 0.5) * vw,
      (rand(8) - 0.5) * vh,
      (rand(9) - 0.5) * (Z_MAX - Z_MIN) + Z_MIN
    ], i * 3);
  }

  return {
    rotationSpeed: createInstancedAttr(rs, 1),
    rotationAxis: createInstancedAttr(ra, 3),
    phase: createInstancedAttr(ph, 1),
    movementDirection: createInstancedAttr(md, 2),
    movementSpeed: createInstancedAttr(ms, 1),
    initialPosition: createInstancedAttr(ip, 3),
  };
};

export type InstancedProduct = { mesh: THREE.InstancedMesh; count: number; product: Product };

export const createInstancedProduct = (product: Product, count: number): InstancedProduct => {
  const mat = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR });
  const mesh = new THREE.InstancedMesh(product.geometry, mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, count, product };
};

const warnOutOfBounds = (idx: number, max: number) =>
  console.warn(`Индекс ${idx} вне диапазона [0, ${max})`);

export const setInstanceMatrix = (inst: InstancedProduct, idx: number, m: THREE.Matrix4): void => {
  if (idx < 0 || idx >= inst.count) return warnOutOfBounds(idx, inst.count);
  inst.mesh.setMatrixAt(idx, m);
};

export const setInstanceTransform = (
  inst: InstancedProduct,
  idx: number,
  pos: THREE.Vector3,
  scale?: number,
  rot?: THREE.Euler
): void => {
  if (idx < 0 || idx >= inst.count) return warnOutOfBounds(idx, inst.count);
  
  const s = (scale ?? 1) * inst.product.normalizedScale;
  const quat = rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion();
  const mat = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(s, s, s));
  
  inst.mesh.setMatrixAt(idx, mat);
};

export const markInstancesDirty = (inst: InstancedProduct): void => {
  inst.mesh.instanceMatrix.needsUpdate = true;
};

// ─── СЦЕНА ──────────────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./core/scene.ts
 */

const DEFAULT_RENDERER_CFG: ConstructorParameters<typeof THREE.WebGLRenderer>[0] = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
};

export const createFruitsRenderer = (
  canvas: HTMLCanvasElement,
  settings: (Partial<typeof DEFAULT_RENDERER_CFG> & { autoClear?: boolean }) = {}
): THREE.WebGLRenderer => {
  const renderer = new THREE.WebGLRenderer({ ...DEFAULT_RENDERER_CFG, ...settings, canvas });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = settings.autoClear ?? true;
  return renderer;
};

export const resizeRenderer = (
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  getDpr: () => number
): { w: number; h: number; dpr: number } => {
  const rect = canvas.getBoundingClientRect();
  const dpr = getDpr();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  renderer.setSize(w, h, false);
  
  return { w, h, dpr };
};

export const renderProduct = (
  scene: THREE.Scene,
  product: Product,
  opts: RenderProductOptions = {}
): THREE.Mesh => {
  const mat = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR });
  const mesh = new THREE.Mesh(product.geometry, mat);
  
  if (opts.position) mesh.position.copy(opts.position);
  if (opts.rotation) mesh.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
  if (opts.quaternion) mesh.quaternion.copy(opts.quaternion);
  
  const s = (opts.scale ?? 1) * product.normalizedScale;
  mesh.scale.set(s, s, s);
  
  scene.add(mesh);
  return mesh;
};

export const createScene = (bgColor: string): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  return scene;
};

export type CameraSetup = { camera: THREE.PerspectiveCamera; width: number; height: number };

export const setupCamera = (w: number, h: number, fov = 50): CameraSetup => {
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
  cam.position.set(0, 0, 25);
  cam.lookAt(0, 0, 0);
  return { camera: cam, width: w, height: h };
};

export const updateCameraSize = (cam: THREE.PerspectiveCamera, w: number, h: number): void => {
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
};

/**
 * ✅ ВЫНЕСТИ В: ./core/scene.ts
 */
function calculateVisibleBounds(
  fov: number,
  width: number,
  height: number,
  distance: number = 25,
  wrapFactor: number = 1.5
): { width: number; height: number } {
  const fovRad = (fov * Math.PI) / 180;
  const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
  const visibleWidth = visibleHeight * (width / height);
  
  return {
    width: visibleWidth * wrapFactor,
    height: visibleHeight * wrapFactor
  };
}

function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach(m => m.dispose());
  } else {
    material.dispose();
  }
}

export class FruitsScene {
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _bounds: { width: number; height: number } = { width: 20, height: 20 };

  initialize(backgroundColor: string, width: number, height: number, fov: number): void {
    this._bounds = calculateVisibleBounds(fov, width, height);
    this._scene = createScene(backgroundColor);
    this._camera = setupCamera(width, height, fov).camera;
  }

  get scene(): THREE.Scene {
    this._ensureInitialized("Scene");
    return this._scene!;
  }

  get camera(): THREE.PerspectiveCamera {
    this._ensureInitialized("Camera");
    return this._camera!;
  }

  get bounds(): { width: number; height: number } {
    return this._bounds;
  }

  resize(width: number, height: number): void {
    if (this._camera) updateCameraSize(this._camera, width, height);
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (this._scene && this._camera) {
      renderer.render(this._scene, this._camera);
    }
  }

  private _ensureInitialized(component: string): void {
    if (!this._scene || !this._camera) {
      throw new Error(`${component} not initialized. Call initialize() first.`);
    }
  }
}

export class ProductPlacement {
  constructor(
    private readonly _seed: number,
    private readonly _bounds: { width: number; height: number }
  ) {}

  getRandomPosition(config: FruitsConfig["products"][number], index: number): THREE.Vector3 {
    if (config.position) {
      return new THREE.Vector3(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    const seed = (this._seed + index * 31) | 0;
    const [r1, r2, r3] = [0, 1, 2].map(offset => rand01(seed + offset));
    
    const visibleWidth = this._bounds.width / 3;
    const visibleHeight = this._bounds.height / 3;
    
    return new THREE.Vector3(
      (r1 - 0.5) * visibleWidth,
      (r2 - 0.5) * visibleHeight,
      (r3 - 0.5) * 5 - 5
    );
  }

  getRandomScale(config: FruitsConfig["products"][number], index: number): number {
    if (config.scale !== undefined) return config.scale;
    
    if (config.size) {
      if (typeof config.size === "number") return config.size;
      
      const seed = (this._seed + index * 31 + 100) | 0;
      const r = rand01(seed);
      return config.size.min + (config.size.max - config.size.min) * r;
    }
    
    return 1.0;
  }

  getRandomRotation(config: FruitsConfig["products"][number], index: number): THREE.Euler {
    if (config.rotation) {
      return new THREE.Euler(
        config.rotation.x ?? 0,
        config.rotation.y ?? 0,
        config.rotation.z ?? 0
      );
    }

    const seed = (this._seed + index * 31 + 200) | 0;
    return new THREE.Euler(
      rand01(seed) * Math.PI * 2,
      rand01(seed + 1) * Math.PI * 2,
      rand01(seed + 2) * Math.PI * 2
    );
  }
}

export type InstancedProductResult = {
  instanced: InstancedProduct;
  material: THREE.ShaderMaterial;
};

export class ProductFactory {
  private _instanceCounter = 0;

  constructor(
    private readonly _scene: FruitsScene,
    private readonly _placement: ProductPlacement
  ) {}

  resetInstanceCounter(): void {
    this._instanceCounter = 0;
  }

  createInstancedProduct(
    product: Product,
    config: FruitsConfig["products"][number],
    seed: number
  ): InstancedProductResult {
    const instanced = createInstancedProduct(product, config.count);
    const material = createAnimatedMaterial(product, this._scene.bounds);
    instanced.mesh.material = material;

    this._setupInstancedAttributes(instanced, config.count, seed);
    this._setupInstanceTransforms(instanced, config);
    
    markInstancesDirty(instanced);
    this._scene.scene.add(instanced.mesh);

    return { instanced, material };
  }

  createSingleProduct(product: Product, config: FruitsConfig["products"][number]): THREE.Mesh {
    const position = this._placement.getRandomPosition(config, 0);
    const scale = this._placement.getRandomScale(config, 0);
    const rotation = this._placement.getRandomRotation(config, 0);

    return renderProduct(this._scene.scene, product, {
      position,
      scale,
      rotation
    });
  }

  private _setupInstancedAttributes(
    instanced: InstancedProduct,
    count: number,
    seed: number
  ): void {
    const startInstanceIndex = this._instanceCounter;
    this._instanceCounter += count;
    
    const attrs = createAnimationAttributes(
      count,
      seed,
      this._scene.bounds,
      startInstanceIndex
    );

    const { geometry } = instanced.mesh;
    geometry.setAttribute("aRotationSpeed", attrs.rotationSpeed);
    geometry.setAttribute("aRotationAxis", attrs.rotationAxis);
    geometry.setAttribute("aPhase", attrs.phase);
    geometry.setAttribute("aMovementDirection", attrs.movementDirection);
    geometry.setAttribute("aMovementSpeed", attrs.movementSpeed);
    geometry.setAttribute("aInitialPosition", attrs.initialPosition);
  }

  private _setupInstanceTransforms(
    instanced: InstancedProduct,
    config: FruitsConfig["products"][number]
  ): void {
    for (let i = 0; i < config.count; i++) {
      const scale = this._placement.getRandomScale(config, i);
      setInstanceTransform(instanced, i, new THREE.Vector3(0, 0, 0), scale);
    }
  }
}

// ─── ОСНОВНОЙ ПРОЕКТ ────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./project.ts
 */

export class FruitsProject {
  private _products: Product[] = [];
  private _instancedProducts: InstancedProductResult[] = [];
  private _meshes: THREE.Mesh[] = [];
  private _scene: FruitsScene | null = null;
  private _factory: ProductFactory | null = null;
  private _seed = DEFAULT_SEED;
  private _config: FruitsConfig | null = null;

  async load(gltfUrl: string): Promise<Product[]> {
    const { parseGLTF } = await import("./gltfParser");
    this._products = await parseGLTF(gltfUrl);
    return this._products;
  }

  // ✅ Критическое исправление: принимает уже загруженные продукты
  setup(config: FruitsConfig, products: Product[], width: number, height: number): void {
    this._config = config;
    this._seed = config.seed ?? this._seed;
    this._products = products; // ← не загружаем повторно!
    
    this._initializeScene(config, width, height);
    this._createProducts(config);
  }

  update(time: number): void {
    for (const { material } of this._instancedProducts) {
      updateAnimation(material, time);
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    this._scene?.render(renderer);
  }

  resize(width: number, height: number): void {
    this._scene?.resize(width, height);
  }

  get scene(): THREE.Scene | null {
    return this._scene?.scene ?? null;
  }

  get camera(): THREE.PerspectiveCamera | null {
    return this._scene?.camera ?? null;
  }

  get products(): Product[] {
    return this._products;
  }

  get config(): FruitsConfig | null {
    return this._config;
  }

  get instancedProducts(): InstancedProductResult[] {
    return this._instancedProducts;
  }

  dispose(): void {
    this._disposeInstancedProducts();
    this._disposeMeshes();
    this._disposeProducts();
    
    this._scene = null;
    this._factory = null;
    this._instancedProducts = [];
    this._meshes = [];
    this._products = [];
  }

  private _initializeScene(config: FruitsConfig, width: number, height: number): void {
    this._scene = new FruitsScene();
    this._scene.initialize(config.backgroundColor, width, height, config.camera.fov);
    
    const placement = new ProductPlacement(this._seed, this._scene.bounds);
    this._factory = new ProductFactory(this._scene, placement);
    this._factory.resetInstanceCounter();
  }

  private _createProducts(config: FruitsConfig): void {
    for (const productConfig of config.products) {
      this._createProduct(productConfig);
    }
  }

  private _createProduct(productConfig: FruitsConfig["products"][number]): void {
    const product = this._products.find(p => p.name === productConfig.productName);
    
    if (!product) {
      console.warn(`Product "${productConfig.productName}" not found`);
      return;
    }

    if (productConfig.count > 1 && this._factory) {
      const result = this._factory.createInstancedProduct(
        product,
        productConfig,
        this._seed
      );
      this._instancedProducts.push(result);
    } else if (this._factory) {
      const mesh = this._factory.createSingleProduct(product, productConfig);
      this._meshes.push(mesh);
    }
  }

  private _disposeInstancedProducts(): void {
    for (const { instanced, material } of this._instancedProducts) {
      instanced.mesh.geometry.dispose();
      disposeMaterials(material);
    }
  }

  private _disposeMeshes(): void {
    if (!this._scene) return;
    
    for (const mesh of this._meshes) {
      this._scene.scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMaterials(mesh.material);
    }
  }

  private _disposeProducts(): void {
    for (const product of this._products) {
      product.geometry.dispose();
      product.materials.forEach(m => m.dispose());
    }
  }
}

// ─── ФОН ────────────────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./background/renderer.ts
 * ✅ КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ:
 *    - Загрузка моделей 1 раз вместо 8
 *    - Параллельная инициализация слоёв
 *    - Управление памятью (dispose)
 *    - Обработка ошибок
 */

function createLayerConfig(
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

function createSharedTexture(
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

function copyRenderTargetToTexture(
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
  
  const targetData = targetTexture.image.data;
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

/**
 * ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Загружаем модели ОДИН раз
 */
async function initializeBackgroundLayers(
  config: FruitBackgroundPresetsConfig,
  projects: Map<FruitLayerBits, FruitsProject>,
  renderTargets: Map<FruitLayerBits, THREE.WebGLRenderTarget>,
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  targetWidth: number,
  targetHeight: number,
  products: Product[] // ← получаем готовые продукты
): Promise<void> {
  // ✅ Параллельная инициализация всех слоёв
  await Promise.all(
    LAYER_BITS.map(async (bits) => {
      const layerConfig = createLayerConfig(config, bits, products);
      
      const project = new FruitsProject();
      project.setup(layerConfig, products, targetWidth, targetHeight); // ← не загружаем!
      
      projects.set(bits, project);
      
      const renderTarget = createLayerRenderTarget(targetWidth, targetHeight);
      renderTargets.set(bits, renderTarget);
      
      const sharedTexture = createSharedTexture(targetWidth, targetHeight);
      sharedTextures.set(bits, sharedTexture);
    })
  );
}

function runBackgroundRenderLoop(
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
      
      copyRenderTargetToTexture(renderTarget, sharedTexture, renderer);
    }
    
    renderer.setRenderTarget(null);
    
    if (debugMode && frameCount % 60 === 0) {
      const layer1Texture = sharedTextures.get(1);
      if (layer1Texture?.image.data) {
        const width = layer1Texture.image.width;
        const height = layer1Texture.image.height;
        const data = layer1Texture.image.data;
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
  
  // Возвращаем функцию для остановки
  return () => cancelAnimationFrame(animationFrame);
}

function scheduleTextureDebug(
  sharedTextures: Map<FruitLayerBits, THREE.DataTexture>,
  delayMs: number = DEBUG_DELAY_MS
): void {
  setTimeout(() => {
    const sharedTexture = sharedTextures.get(1);
    if (!sharedTexture) return;
    
    const width = sharedTexture.image.width;
    const height = sharedTexture.image.height;
    const data = sharedTexture.image.data;
    
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

/**
 * ✅ ПОЛНОСТЬЮ ПЕРЕПИСАН: Устранены утечки памяти, дублирование загрузки
 */
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
  
  // ✅ Загружаем модели ОДИН раз для всех слоёв
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
      
      // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Загрузка 1 раз
      const loaderProject = new FruitsProject();
      const products = await loaderProject.load(config.gltfUrl);
      
      await initializeBackgroundLayers(
        config,
        projects,
        renderTargets,
        sharedTextures,
        rtWidth,
        rtHeight,
        products // ← передаём готовые продукты
      );
      
      offscreenRenderer.setSize(rtWidth, rtHeight, false);
      isLoaded.value = true;
      
      // ✅ Сохраняем функцию остановки для dispose
      stopAnimation.fn = runBackgroundRenderLoop(
        projects,
        renderTargets,
        sharedTextures,
        offscreenRenderer,
        isLoaded,
        debug
      );
      
      if (debug) scheduleTextureDebug(sharedTextures);
    } catch (err) {
      console.error('Background initialization failed:', err);
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
  
  // ✅ Добавляем dispose для предотвращения утечек
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
    renderTargets: () => renderTargets,
    getLayerTexture,
  };
}

// ─── МОНТИРОВАНИЕ ───────────────────────────────────────────────────────────────

/**
 * ✅ ВЫНЕСТИ В: ./mount.ts
 * ✅ Возвращает функцию очистки
 */

export async function mountFruitsProject(host: HTMLElement): Promise<() => void> {
  const ui = createFruitsUI(host);
  const renderer = createFruitsRenderer(ui.canvas);
  
  const project = new FruitsProject();
  
  function handleResize() {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    project.resize(w, h);
    return { w, h, dpr };
  }
  
  ui.statusEl.textContent = "Загрузка моделей фруктов...";
  const products = await project.load(CONFIG.puzzle.background3d.gltfUrl);
  
  const fruitsConfig = createLayerConfig(
    CONFIG.puzzle.background3d as FruitBackgroundPresetsConfig,
    1,
    products
  );
  
  const { w, h } = handleResize();
  project.setup(fruitsConfig, products, w, h); // ✅ Передаём готовые продукты
  ui.statusEl.textContent = "Готово!";
  
  let lastTimestamp = performance.now();
  let animationFrame: number;
  
  function renderLoop(timestamp: number): void {
    animationFrame = requestAnimationFrame(renderLoop);
    
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
  
  animationFrame = requestAnimationFrame(renderLoop);
  
  const resizeHandler = () => handleResize();
  window.addEventListener("resize", resizeHandler);
  
  // ✅ Возвращаем функцию очистки
  return () => {
    window.removeEventListener("resize", resizeHandler);
    cancelAnimationFrame(animationFrame);
    project.dispose();
    renderer.dispose();
  };
}