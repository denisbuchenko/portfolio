import * as THREE from "three";
import type { FruitsConfig } from "../config";
import type { Product, RenderProductOptions } from "../types";
import {
  createInstancedProduct,
  createAnimatedMaterial,
  createAnimationAttributes,
  InstancedProduct,
  markInstancesDirty,
  setInstanceTransform,
} from "./instancing";
import { DEFAULT_COLOR, rand01 } from "./utils";

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

  if (opts.position) mesh.position.copy(opts.position as THREE.Vector3);
  if (opts.rotation) mesh.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
  if (opts.quaternion) mesh.quaternion.copy(opts.quaternion as THREE.Quaternion);

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

function _calculateVisibleBounds(
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

function _disposeMaterials(material: THREE.Material | THREE.Material[]): void {
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
  private _fov = 50;
  private _width = 1;
  private _height = 1;

  initialize(backgroundColor: string, width: number, height: number, fov: number): void {
    this._fov = fov;
    this._width = Math.max(1, width);
    this._height = Math.max(1, height);
    this._bounds = _calculateVisibleBounds(fov, this._width, this._height);
    this._scene = createScene(backgroundColor);
    this._camera = setupCamera(this._width, this._height, fov).camera;
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
    this._width = Math.max(1, width);
    this._height = Math.max(1, height);
    this._bounds = _calculateVisibleBounds(this._fov, this._width, this._height);
    if (this._camera) updateCameraSize(this._camera, this._width, this._height);
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

    return new THREE.Vector3(
      (r1 - 0.5) * this._bounds.width,
      (r2 - 0.5) * this._bounds.height,
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
    private readonly _placement: ProductPlacement,
    private readonly _anim: {
      speedMul?: { min: number; max: number };
    } = {}
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

    this._setupInstancedAttributes(instanced, config, seed);
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
    config: FruitsConfig["products"][number],
    seed: number
  ): void {
    const startInstanceIndex = this._instanceCounter;
    this._instanceCounter += config.count;

    const attrs = createAnimationAttributes(
      config.count,
      seed,
      this._scene.bounds,
      startInstanceIndex,
      {
        speedMul: this._anim.speedMul,
      }
    );

    const { geometry } = instanced.mesh;
    geometry.setAttribute("aRotationSpeed", attrs.rotationSpeed);
    geometry.setAttribute("aRotationAxis", attrs.rotationAxis);
    geometry.setAttribute("aPhase", attrs.phase);
    geometry.setAttribute("aSpeedMul", attrs.speedMul);
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

export const disposeMaterials = _disposeMaterials;

