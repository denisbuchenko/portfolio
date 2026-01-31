/**
 * Главный класс проекта фруктов.
 */

import * as THREE from "three";
import { parseGLTF } from "./gltfParser";
import { createScene, setupCamera, updateCameraSize } from "./scene";
import { renderProduct } from "./renderer";
import { createInstancedProduct, setInstanceTransform, markInstancesDirty } from "./instancing";
import { createAnimatedMaterial, updateAnimation, createAnimationAttributes } from "./animation";
import type { FruitsConfig, ProductConfig } from "./config";
import type { Product } from "./types";
import { rand01 } from "./utils";
import type { InstancedProduct } from "./instancing";

/**
 * Упрощенный класс для управления проектом фруктов.
 */
export class FruitsProject {
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _products: Product[] = [];
  private _instancedProducts: Array<{
    instanced: InstancedProduct;
    material: THREE.ShaderMaterial;
  }> = [];
  private _meshes: THREE.Mesh[] = [];
  private _seed: number = 0;
  private _bounds: { width: number; height: number } = { width: 20, height: 20 };

  /**
   * Загружает GLTF и парсит продукты.
   */
  async load(gltfUrl: string): Promise<Product[]> {
    this._products = await parseGLTF(gltfUrl);
    return this._products;
  }

  /**
   * Настраивает сцену, камеру и создает инстансы.
   */
  setup(config: FruitsConfig, width: number, height: number): void {
    this._seed = config.seed ?? 0xdecafbad;

    // Вычисляем границы экрана в единицах 3D пространства
    // Камера на z=25, FOV=35°, поэтому видимая область примерно 20x20 единиц
    const fovRad = (config.camera.fov * Math.PI) / 180;
    const distance = 25; // Расстояние камеры
    const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (width / height);
    
    // Увеличиваем границы в 3 раза для wrap-around, чтобы объекты исчезали за пределами экрана
    // перед тем как появиться с другой стороны (большой запас)
    this._bounds = { 
      width: visibleWidth * 1.5, 
      height: visibleHeight * 1.5 
    };

    // Создаем сцену
    this._scene = createScene(config.backgroundColor);

    // Настраиваем камеру
    const cameraSetup = setupCamera(width, height, config.camera.fov);
    this._camera = cameraSetup.camera;

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
      console.log(`Продукт "${product.name}": вершин=${positionCount}, normalizedScale=${product.normalizedScale.toFixed(4)}`);

      // Если count > 1, используем instancing
      if (productConfig.count > 1) {
        this._createInstancedProduct(product, productConfig);
      } else {
        // Иначе создаем обычный mesh
        this._createSingleProduct(product, productConfig);
      }
    }
  }

  /**
   * Создает инстансированный продукт.
   */
  private _createInstancedProduct(product: Product, config: ProductConfig): void {
    const instanced = createInstancedProduct(product, config.count);

    // Создаем анимированный материал
    const material = createAnimatedMaterial(product, this._bounds);

    instanced.mesh.material = material;

    // Создаем instanced атрибуты для уникальных параметров каждого инстанса
    const attrs = createAnimationAttributes(config.count, this._seed);
    instanced.mesh.geometry.setAttribute("aRotationSpeed", attrs.rotationSpeed);
    instanced.mesh.geometry.setAttribute("aRotationAxis", attrs.rotationAxis);
    instanced.mesh.geometry.setAttribute("aPhase", attrs.phase);
    instanced.mesh.geometry.setAttribute("aMovementDirection", attrs.movementDirection);
    instanced.mesh.geometry.setAttribute("aMovementSpeed", attrs.movementSpeed);

    // Размещаем инстансы по всему экрану
    for (let i = 0; i < config.count; i++) {
      const position = this._getRandomPosition(config, i);
      const scale = this._getRandomScale(config, i);
      // Начальное вращение не нужно, так как вращение в шейдере
      setInstanceTransform(instanced, i, position, scale);
    }

    markInstancesDirty(instanced);
    this._scene!.add(instanced.mesh);
    this._instancedProducts.push({ instanced, material });
    console.log(`Создан анимированный продукт: ${product.name}, инстансов: ${config.count}`);
  }

  /**
   * Создает одиночный продукт.
   */
  private _createSingleProduct(product: Product, config: ProductConfig): void {
    const position = this._getRandomPosition(config, 0);
    const scale = this._getRandomScale(config, 0);
    const rotation = this._getRandomRotation(config, 0);

    const mesh = renderProduct(this._scene!, product, {
      position,
      scale,
      rotation
    });

    this._meshes.push(mesh);
    console.log(`Создан одиночный продукт: ${product.name}`);
  }

  /**
   * Получает случайную позицию для продукта.
   */
  private _getRandomPosition(config: ProductConfig, index: number): { x: number; y: number; z: number } {
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
  private _getRandomScale(config: ProductConfig, index: number): number {
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
  private _getRandomRotation(config: ProductConfig, index: number): { x: number; y: number; z: number } {
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
    if (!this._scene || !this._camera) return;
    renderer.render(this._scene, this._camera);
  }

  /**
   * Обновляет размеры.
   */
  resize(width: number, height: number): void {
    if (!this._camera) return;
    updateCameraSize(this._camera, width, height);
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
    for (const mesh of this._meshes) {
      this._scene?.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    this._meshes = [];

    // Очищаем продукты
    this._products.forEach((p) => {
      p.geometry.dispose();
      p.materials.forEach((m) => m.dispose());
    });
    this._products = [];
  }
}

/**
 * Главная функция монтирования проекта фруктов.
 *
 * @param host - Родительский элемент для монтирования
 */
import { createFruitsUI } from "./ui";
import { createFruitsRenderer, resizeRenderer } from "./renderer";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";

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

  // Создаем простой конфиг для демонстрации
  // Берем несколько случайных продуктов
  const sampleProducts = products.slice(0, Math.min(5, products.length));
  console.log(`Используем продуктов: ${sampleProducts.length}`, sampleProducts.map(p => p.name));

  const config: FruitsConfig = {
    gltfUrl: CONFIG.puzzle.background3d.gltfUrl,
    backgroundColor: "#00506f",
    camera: {
      fov: CONFIG.puzzle.background3d.camera.fovDeg
    },
    products: sampleProducts.map((p, i) => ({
      productName: p.name,
      count: 3 + i * 2,
      size: { min: 2.0, max: 4.0 } // Увеличиваем размер продуктов
    })),
    seed: CONFIG.puzzle.background3d.seed
  };

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
