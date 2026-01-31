/**
 * Система анимации через шейдеры для продуктов.
 */

import * as THREE from "three";
import vertexShader from "./shaders/animatedProduct.vert.glsl?raw";
import fragmentShader from "./shaders/animatedProduct.frag.glsl?raw";
import type { Product } from "./types";

/**
 * Создает ShaderMaterial для анимированного продукта.
 *
 * @param product - Продукт
 * @param animationParams - Параметры анимации
 * @returns ShaderMaterial
 */
export function createAnimatedMaterial(
  product: Product,
  bounds: { width: number; height: number }
): THREE.ShaderMaterial {
  // Используем первую текстуру из материалов
  const map = product.materials.length > 0 && product.materials[0].map 
    ? product.materials[0].map 
    : null;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      map: { value: map },
      color: { value: new THREE.Color(0xffffff) },
      uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) }
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true
  });

  return material;
}

/**
 * Обновляет uniforms шейдера для анимации.
 *
 * @param material - ShaderMaterial
 * @param time - Время в секундах
 */
export function updateAnimation(material: THREE.ShaderMaterial, time: number): void {
  if (material.uniforms && material.uniforms.uTime) {
    material.uniforms.uTime.value = time;
  }
}

/**
 * Создает InstancedBufferAttribute для передачи параметров анимации каждому инстансу.
 * Это позволяет каждому инстансу иметь свои уникальные параметры анимации.
 *
 * @param count - Количество инстансов
 * @param seed - Базовый seed для генерации случайных параметров
 * @param bounds - Границы видимой области для размещения объектов
 * @param startInstanceIndex - Начальный индекс инстанса (для глобальной уникальности)
 * @returns Объект с атрибутами для добавления в геометрию
 */
export function createAnimationAttributes(
  count: number,
  seed: number,
  bounds: { width: number; height: number },
  startInstanceIndex: number = 0
): {
  rotationSpeed: THREE.InstancedBufferAttribute;
  rotationAxis: THREE.InstancedBufferAttribute;
  phase: THREE.InstancedBufferAttribute;
  movementDirection: THREE.InstancedBufferAttribute;
  movementSpeed: THREE.InstancedBufferAttribute;
  initialPosition: THREE.InstancedBufferAttribute;
} {
  const rotationSpeedArray = new Float32Array(count);
  const rotationAxisArray = new Float32Array(count * 3);
  const phaseArray = new Float32Array(count);
  const movementDirectionArray = new Float32Array(count * 2);
  const movementSpeedArray = new Float32Array(count);
  const initialPositionArray = new Float32Array(count * 3);

  // Простая функция для генерации случайных чисел
  function rand(seed: number): number {
      let x = seed ^ (seed >>> 15);
      x = Math.imul(x, 0x46d31bad);
      x ^= x >>> 14;
      x = Math.imul(x, 0x2c1b3c6d);
      x ^= x >>> 15;
      return (x >>> 0) / 0x1_0000_0000;
  }

  for (let i = 0; i < count; i++) {
    // Используем глобальный индекс инстанса для уникальности позиций
    const globalIndex = startInstanceIndex + i;
    const s = (seed + globalIndex * 31) | 0;
    
    // Случайная скорость вращения (0.3 - 1.0)
    rotationSpeedArray[i] = 0.3 + rand(s) * 0.7;
    
    // Случайная ось вращения (нормализованная)
    const axisX = (rand(s + 1) - 0.5) * 2.0;
    const axisY = (rand(s + 2) - 0.5) * 2.0;
    const axisZ = (rand(s + 3) - 0.5) * 2.0;
    const axisLen = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
    const invLen = axisLen > 0.001 ? 1.0 / axisLen : 1.0;
    
    rotationAxisArray[i * 3 + 0] = axisX * invLen;
    rotationAxisArray[i * 3 + 1] = axisY * invLen;
    rotationAxisArray[i * 3 + 2] = axisZ * invLen;
    
    // Случайная фаза (0 - 2π)
    phaseArray[i] = rand(s + 4) * 6.28318530718;
    
    // Уникальное направление движения для каждого инстанса
    // Генерируем случайный угол и преобразуем в направление
    const angle = rand(s + 5) * 6.28318530718; // 0 - 2π
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    movementDirectionArray[i * 2 + 0] = dirX;
    movementDirectionArray[i * 2 + 1] = dirY;
    
    // Уникальная скорость движения (1.0 - 3.0)
    movementSpeedArray[i] = 1.0 + rand(s + 6) * 2.0;
    
    // Случайная начальная 3D позиция в видимой области
    // Используем только центральную треть для начального размещения
    const visibleWidth = bounds.width / 3.0;
    const visibleHeight = bounds.height / 3.0;
    const posX = (rand(s + 7) - 0.5) * visibleWidth;
    const posY = (rand(s + 8) - 0.5) * visibleHeight;
    const posZ = (rand(s + 9) - 0.5) * 5.0 - 5.0; // Z от -2.5 до -7.5

    console.log('QQQQQQQQQQQQQ', posX, posY, posZ)
    
    initialPositionArray[i * 3 + 0] = posX;
    initialPositionArray[i * 3 + 1] = posY;
    initialPositionArray[i * 3 + 2] = posZ;
  }

  return {
    rotationSpeed: new THREE.InstancedBufferAttribute(rotationSpeedArray, 1),
    rotationAxis: new THREE.InstancedBufferAttribute(rotationAxisArray, 3),
    phase: new THREE.InstancedBufferAttribute(phaseArray, 1),
    movementDirection: new THREE.InstancedBufferAttribute(movementDirectionArray, 2),
    movementSpeed: new THREE.InstancedBufferAttribute(movementSpeedArray, 1),
    initialPosition: new THREE.InstancedBufferAttribute(initialPositionArray, 3)
  };
}
