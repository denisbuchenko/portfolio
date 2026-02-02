/**
 * Главный модуль проекта фруктов.
 * Содержит сцену, размещение, фабрику продуктов и основной класс проекта.
 */

import * as THREE from "three";
import { parseGLTF } from "../gltfParser";
import {
  updateAnimation,
  createAnimatedMaterial,
  createAnimationAttributes,
  createScene,
  setupCamera,
  updateCameraSize,
  rand01,
  createInstancedProduct,
  setInstanceTransform,
  markInstancesDirty,
  renderProduct,
  type InstancedProduct
} from "../utils";
import type { FruitsConfig, ProductConfig } from "../config";
import type { Product } from "../types";

// ======================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ======================

/**
 * Вычисляет границы видимой области с учетом wrap-around эффекта
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

/**
 * Безопасная очистка материалов
 */
function disposeMaterials(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((m: THREE.Material) => m.dispose());
  } else {
    material.dispose();
  }
}

// ======================
// КЛАССЫ СЦЕНЫ
// ======================

/**
 * Класс для управления сценой Three.js.
 */
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

// ======================
// КЛАССЫ РАЗМЕЩЕНИЯ
// ======================

/**
 * Генератор параметров размещения продуктов
 */
export class ProductPlacement {
  constructor(
    private readonly _seed: number,
    private readonly _bounds: { width: number; height: number }
  ) {}

  getRandomPosition(config: ProductConfig, index: number): THREE.Vector3 {
    if (config.position) {
      return new THREE.Vector3(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    const seed = (this._seed + index * 31) | 0;
    const [r1, r2, r3] = [0, 1, 2].map(offset => rand01(seed + offset));
    
    // Используем центральную треть области для начального размещения
    const visibleWidth = this._bounds.width / 3;
    const visibleHeight = this._bounds.height / 3;
    
    return new THREE.Vector3(
      (r1 - 0.5) * visibleWidth,
      (r2 - 0.5) * visibleHeight,
      (r3 - 0.5) * 5 - 5
    );
  }

  getRandomScale(config: ProductConfig, index: number): number {
    if (config.scale !== undefined) return config.scale;
    
    if (config.size) {
      if (typeof config.size === "number") return config.size;
      
      const seed = (this._seed + index * 31 + 100) | 0;
      const r = rand01(seed);
      return config.size.min + (config.size.max - config.size.min) * r;
    }
    
    return 1.0;
  }

  getRandomRotation(config: ProductConfig, index: number): THREE.Euler {
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

// ======================
// ФАБРИКА ПРОДУКТОВ
// ======================

export type InstancedProductResult = {
  instanced: InstancedProduct;
  material: THREE.ShaderMaterial;
};

/**
 * Фабрика для создания продуктов (инстансированных и одиночных)
 */
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
    config: ProductConfig,
    seed: number
  ): InstancedProductResult {
    const instanced = createInstancedProduct(product, config.count);
    const material = createAnimatedMaterial(product, this._scene.bounds);
    instanced.mesh.material = material;

    this._setupInstancedAttributes(instanced, config.count, seed);
    this._setupInstanceTransforms(instanced, config);
    
    markInstancesDirty(instanced);
    this._scene.scene.add(instanced.mesh);

    console.log(`Создан анимированный продукт: ${product.name}, инстансов: ${config.count}`);
    return { instanced, material };
  }

  createSingleProduct(product: Product, config: ProductConfig): THREE.Mesh {
    const position = this._placement.getRandomPosition(config, 0);
    const scale = this._placement.getRandomScale(config, 0);
    const rotation = this._placement.getRandomRotation(config, 0);

    const mesh = renderProduct(this._scene.scene, product, {
      position,
      scale,
      rotation
    });

    console.log(`Создан одиночный продукт: ${product.name}`);
    return mesh;
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
    config: ProductConfig
  ): void {
    for (let i = 0; i < config.count; i++) {
      const scale = this._placement.getRandomScale(config, i);
      // Позиция (0,0,0) так как реальная позиция в атрибуте aInitialPosition
      setInstanceTransform(instanced, i, new THREE.Vector3(0, 0, 0), scale);
    }
  }
}

// ======================
// ОСНОВНОЙ КЛАСС ПРОЕКТА
// ======================

/**
 * Класс для управления проектом фруктов.
 * Координирует работу всех компонентов системы.
 */
export class FruitsProject {
  private _products: Product[] = [];
  private _instancedProducts: InstancedProductResult[] = [];
  private _meshes: THREE.Mesh[] = [];
  private _scene: FruitsScene | null = null;
  private _factory: ProductFactory | null = null;
  private _seed = 0xdecafbad;
  private _config: FruitsConfig | null = null;

  async load(gltfUrl: string): Promise<Product[]> {
    this._products = await parseGLTF(gltfUrl);
    return this._products;
  }

  setup(config: FruitsConfig, width: number, height: number): void {
    this._config = config;
    this._seed = config.seed ?? this._seed;
    
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

  // ======================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ======================

  private _initializeScene(config: FruitsConfig, width: number, height: number): void {
    this._scene = new FruitsScene();
    this._scene.initialize(config.backgroundColor, width, height, config.camera.fov);
    
    const placement = new ProductPlacement(this._seed, this._scene.bounds);
    this._factory = new ProductFactory(this._scene, placement);
    this._factory.resetInstanceCounter();
  }

  private _createProducts(config: FruitsConfig): void {
    console.log(`Настройка сцены: ${config.products.length} продуктов в конфиге`);
    
    for (const productConfig of config.products) {
      this._createProduct(productConfig);
    }
  }

  private _createProduct(productConfig: ProductConfig): void {
    const product = this._products.find(p => p.name === productConfig.productName);
    
    if (!product) {
      console.warn(`Product "${productConfig.productName}" not found`);
      return;
    }

    this._logProductInfo(product);
    
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

  private _logProductInfo(product: Product): void {
    const positionCount = product.geometry.attributes.position?.count || 0;
    console.log(
      `Продукт "${product.name}": вершин=${positionCount}, ` +
      `normalizedScale=${product.normalizedScale.toFixed(4)}`
    );
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
      product.materials.forEach((m: THREE.Material) => m.dispose());
    }
  }
}