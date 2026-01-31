/**
 * Класс для создания продуктов (инстансированных и одиночных).
 */

import * as THREE from "three";
import { createInstancedProduct, setInstanceTransform, markInstancesDirty } from "../instancing";
import { createAnimatedMaterial, createAnimationAttributes } from "../animation";
import { renderProduct } from "../renderer";
import type { Product } from "../types";
import type { ProductConfig } from "../config";
import type { InstancedProduct } from "../instancing";
import type { FruitsScene } from "./FruitsScene";
import type { ProductPlacement } from "./ProductPlacement";

/**
 * Результат создания инстансированного продукта.
 */
export type InstancedProductResult = {
  instanced: InstancedProduct;
  material: THREE.ShaderMaterial;
};

/**
 * Класс для создания продуктов.
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
