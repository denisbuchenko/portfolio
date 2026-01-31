/**
 * Класс для генерации случайных параметров размещения продуктов.
 */

import type { ProductConfig } from "../config";
import { rand01 } from "../utils";

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
