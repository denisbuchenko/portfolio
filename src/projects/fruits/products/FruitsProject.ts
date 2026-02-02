/**
 * Главный модуль проекта фруктов.
 * Содержит сцену, размещение, фабрику продуктов и основной класс проекта.
 */

import * as THREE from "three";
import { parseGLTF } from "../gltfParser";
import {
  updateAnimation,
  createAnimatedMaterial,
  createAnimationAttributes
} from "../animation";
import type { FruitsConfig, ProductConfig } from "../config";
import type { Product } from "../types";
import { createScene, setupCamera, updateCameraSize } from "../scene";
import { rand01 } from "../utils";
import {
  createInstancedProduct,
  setInstanceTransform,
  markInstancesDirty
} from "../instancing";
import type { InstancedProduct } from "../instancing";
import { renderProduct } from "../renderer";

/**
 * Класс для управления сценой Three.js.
 */
export class FruitsScene {
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _bounds: { width: number; height: number } = { width: 20, height: 20 };

  /**
   * Инициализирует сцену и камеру.
   */
  initialize(backgroundColor: string, width: number, height: number, fov: number): void {
    // Вычисляем границы экрана в единицах 3D пространства
    const fovRad = (fov * Math.PI) / 180;
    const distance = 25; // Расстояние камеры
    const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (width / height);

    // Увеличиваем границы в 1.5 раза для wrap-around
    this._bounds = {
      width: visibleWidth * 1.5,
      height: visibleHeight * 1.5
    };

    // Создаем сцену
    this._scene = createScene(backgroundColor);

    // Настраиваем камеру
    const cameraSetup = setupCamera(width, height, fov);
    this._camera = cameraSetup.camera;
  }

  /**
   * Возвращает сцену.
   */
  get scene(): THREE.Scene {
    if (!this._scene) {
      throw new Error("Scene not initialized. Call initialize() first.");
    }
    return this._scene;
  }

  /**
   * Возвращает камеру.
   */
  get camera(): THREE.PerspectiveCamera {
    if (!this._camera) {
      throw new Error("Camera not initialized. Call initialize() first.");
    }
    return this._camera;
  }

  /**
   * Возвращает границы видимой области.
   */
  get bounds(): { width: number; height: number } {
    return this._bounds;
  }

  /**
   * Обновляет размеры камеры при изменении размеров экрана.
   */
  resize(width: number, height: number): void {
    if (!this._camera) return;
    updateCameraSize(this._camera, width, height);
  }

  /**
   * Рендерит сцену.
   */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this._scene || !this._camera) return;
    renderer.render(this._scene, this._camera);
  }
}

/**
 * Класс для генерации параметров размещения продуктов.
 */
export class ProductPlacement {
  private _seed: number;
  private _bounds: { width: number; height: number };

  constructor(seed: number, bounds: { width: number; height: number }) {
    this._seed = seed;
    this._bounds = bounds;
  }

  /**
   * Получает случайную позицию для продукта.
   */
  getRandomPosition(config: ProductConfig, index: number): { x: number; y: number; z: number } {
    if (config.position) {
      return {
        x: config.position.x ?? 0,
        y: config.position.y ?? 0,
        z: config.position.z ?? 0
      };
    }

    // Случайная позиция в пределах видимой области
    const seed = (this._seed + index * 31) | 0;
    const r1 = rand01(seed);
    const r2 = rand01(seed + 1);
    const r3 = rand01(seed + 2);

    // Размещаем продукты в видимой области (не во всей области wrap-around)
    // Используем только центральную треть для начального размещения
    const visibleWidth = this._bounds.width / 3.0;
    const visibleHeight = this._bounds.height / 3.0;

    return {
      x: (r1 - 0.5) * visibleWidth,
      y: (r2 - 0.5) * visibleHeight,
      z: (r3 - 0.5) * 5 - 5 // Смещаем немного назад от камеры
    };
  }

  /**
   * Получает случайный масштаб для продукта.
   */
  getRandomScale(config: ProductConfig, index: number): number {
    if (config.scale !== undefined) {
      return config.scale;
    }

    if (config.size) {
      if (typeof config.size === "number") {
        return config.size;
      } else {
        const seed = (this._seed + index * 31 + 100) | 0;
        const r = rand01(seed);
        return config.size.min + (config.size.max - config.size.min) * r;
      }
    }

    return 1.0;
  }

  /**
   * Получает случайное вращение для продукта.
   */
  getRandomRotation(config: ProductConfig, index: number): { x: number; y: number; z: number } {
    if (config.rotation) {
      return {
        x: config.rotation.x ?? 0,
        y: config.rotation.y ?? 0,
        z: config.rotation.z ?? 0
      };
    }

    const seed = (this._seed + index * 31 + 200) | 0;
    return {
      x: rand01(seed) * Math.PI * 2,
      y: rand01(seed + 1) * Math.PI * 2,
      z: rand01(seed + 2) * Math.PI * 2
    };
  }
}

/**
 * Результат создания инстансированного продукта.
 */
export type InstancedProductResult = {
  instanced: InstancedProduct;
  material: THREE.ShaderMaterial;
};

/**
 * Класс для создания продуктов (инстансированных и одиночных).
 */
export class ProductFactory {
  private _scene: FruitsScene;
  private _placement: ProductPlacement;
  private _instanceCounter: number = 0;

  constructor(scene: FruitsScene, placement: ProductPlacement) {
    this._scene = scene;
    this._placement = placement;
  }

  /**
   * Сбрасывает счетчик инстансов.
   */
  resetInstanceCounter(): void {
    this._instanceCounter = 0;
  }

  /**
   * Создает инстансированный продукт.
   */
  createInstancedProduct(
    product: Product,
    config: ProductConfig,
    seed: number
  ): InstancedProductResult {
    const instanced = createInstancedProduct(product, config.count);

    // Создаем анимированный материал
    const material = createAnimatedMaterial(product, this._scene.bounds);
    instanced.mesh.material = material;

    // Создаем instanced атрибуты для уникальных параметров каждого инстанса
    const startInstanceIndex = this._instanceCounter;
    const attrs = createAnimationAttributes(
      config.count,
      seed,
      this._scene.bounds,
      startInstanceIndex
    );
    this._instanceCounter += config.count;

    instanced.mesh.geometry.setAttribute("aRotationSpeed", attrs.rotationSpeed);
    instanced.mesh.geometry.setAttribute("aRotationAxis", attrs.rotationAxis);
    instanced.mesh.geometry.setAttribute("aPhase", attrs.phase);
    instanced.mesh.geometry.setAttribute("aMovementDirection", attrs.movementDirection);
    instanced.mesh.geometry.setAttribute("aMovementSpeed", attrs.movementSpeed);
    instanced.mesh.geometry.setAttribute("aInitialPosition", attrs.initialPosition);

    // Размещаем инстансы - позиция теперь в атрибуте, нужно только масштаб
    for (let i = 0; i < config.count; i++) {
      const scale = this._placement.getRandomScale(config, i);
      // Позиция (0,0,0) так как реальная позиция в атрибуте aInitialPosition
      setInstanceTransform(instanced, i, { x: 0, y: 0, z: 0 }, scale);
    }

    markInstancesDirty(instanced);
    this._scene.scene.add(instanced.mesh);

    console.log(`Создан анимированный продукт: ${product.name}, инстансов: ${config.count}`);

    return { instanced, material };
  }

  /**
   * Создает одиночный продукт.
   */
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
}

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
  private _seed: number = 0;
  private _config: FruitsConfig | null = null;

  /**
   * Загружает GLTF и парсит продукты.
   */
  async load(gltfUrl: string): Promise<Product[]> {
    this._products = await parseGLTF(gltfUrl);
    return this._products;
  }

  /**
   * Настраивает сцену, камеру и создает продукты.
   */
  setup(config: FruitsConfig, width: number, height: number): void {
    this._config = config;
    this._seed = config.seed ?? 0xdecafbad;

    // Создаем сцену
    this._scene = new FruitsScene();
    this._scene.initialize(config.backgroundColor, width, height, config.camera.fov);

    // Создаем placement для генерации параметров
    const placement = new ProductPlacement(this._seed, this._scene.bounds);

    // Создаем factory для создания продуктов
    this._factory = new ProductFactory(this._scene, placement);
    this._factory.resetInstanceCounter();

    // Создаем продукты согласно конфигу
    console.log(`Настройка сцены: ${config.products.length} продуктов в конфиге`);
    for (const productConfig of config.products) {
      const product = this._products.find((p) => p.name === productConfig.productName);
      if (!product) {
        console.warn(`Product "${productConfig.productName}" not found`);
        continue;
      }

      // Проверяем геометрию
      const positionCount = product.geometry.attributes.position?.count || 0;
      console.log(
        `Продукт "${product.name}": вершин=${positionCount}, normalizedScale=${product.normalizedScale.toFixed(
          4
        )}`
      );

      // Если count > 1, используем instancing
      if (productConfig.count > 1) {
        const result = this._factory.createInstancedProduct(product, productConfig, this._seed);
        this._instancedProducts.push(result);
      } else {
        // Иначе создаем обычный mesh
        const mesh = this._factory.createSingleProduct(product, productConfig);
        this._meshes.push(mesh);
      }
    }
  }

  /**
   * Обновляет анимацию.
   */
  update(time: number): void {
    // Обновляем uniforms шейдеров
    for (const { material } of this._instancedProducts) {
      updateAnimation(material, time);
    }
  }

  /**
   * Рендерит сцену.
   */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this._scene) return;
    this._scene.render(renderer);
  }

  /**
   * Обновляет размеры.
   */
  resize(width: number, height: number): void {
    if (!this._scene) return;
    this._scene.resize(width, height);
  }

  /**
   * Возвращает сцену Three.js.
   */
  get scene(): THREE.Scene | null {
    return this._scene?.scene ?? null;
  }

  /**
   * Возвращает камеру.
   */
  get camera(): THREE.PerspectiveCamera | null {
    return this._scene?.camera ?? null;
  }

  /**
   * Возвращает продукты.
   */
  get products(): Product[] {
    return this._products;
  }

  /**
   * Возвращает конфигурацию.
   */
  get config(): FruitsConfig | null {
    return this._config;
  }

  /**
   * Возвращает инстансированные продукты.
   */
  get instancedProducts(): InstancedProductResult[] {
    return this._instancedProducts;
  }

  /**
   * Очищает ресурсы.
   */
  dispose(): void {
    // Очищаем инстансы
    for (const { instanced, material } of this._instancedProducts) {
      instanced.mesh.dispose();
      material.dispose();
    }
    this._instancedProducts = [];

    // Очищаем меши
    if (this._scene) {
      for (const mesh of this._meshes) {
        this._scene.scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
    this._meshes = [];

    // Очищаем продукты
    this._products.forEach((p) => {
      p.geometry.dispose();
      p.materials.forEach((m) => m.dispose());
    });
    this._products = [];

    this._scene = null;
    this._factory = null;
  }
}

