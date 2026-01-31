/**
 * Главный класс проекта фруктов.
 * Координирует работу всех компонентов системы.
 */

import * as THREE from "three";
import { parseGLTF } from "../gltfParser";
import { updateAnimation } from "../animation";
import type { FruitsConfig } from "../config";
import type { Product } from "../types";
import { FruitsScene } from "./FruitsScene";
import { ProductPlacement } from "./ProductPlacement";
import { ProductFactory, type InstancedProductResult } from "./ProductFactory";

/**
 * Класс для управления проектом фруктов.
 */
export class FruitsProject {
  private _products: Product[] = [];
  private _instancedProducts: InstancedProductResult[] = [];
  private _meshes: THREE.Mesh[] = [];
  private _scene: FruitsScene | null = null;
  private _factory: ProductFactory | null = null;
  private _seed: number = 0;

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
      console.log(`Продукт "${product.name}": вершин=${positionCount}, normalizedScale=${product.normalizedScale.toFixed(4)}`);

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

