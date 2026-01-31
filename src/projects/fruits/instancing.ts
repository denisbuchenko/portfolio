/**
 * Система instancing для оптимизации рендера множества продуктов.
 */

import * as THREE from "three";
import type { Product } from "./types";

/**
 * InstancedMesh для продукта с управлением матрицами.
 */
export type InstancedProduct = {
  /** InstancedMesh */
  mesh: THREE.InstancedMesh;
  /** Количество инстансов */
  count: number;
  /** Продукт */
  product: Product;
};

/**
 * Создает InstancedMesh для продукта.
 *
 * @param product - Продукт для создания инстансов
 * @param count - Количество инстансов
 * @returns InstancedProduct
 */
export function createInstancedProduct(product: Product, count: number): InstancedProduct {
  // Используем первый материал (или создаем дефолтный)
  const material = product.materials.length > 0 
    ? product.materials[0] 
    : new THREE.MeshBasicMaterial({ color: 0xffffff });

  const mesh = new THREE.InstancedMesh(product.geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Будем обновлять каждый кадр

  return {
    mesh,
    count,
    product
  };
}

/**
 * Устанавливает матрицу для инстанса.
 *
 * @param instancedProduct - InstancedProduct
 * @param index - Индекс инстанса
 * @param matrix - Матрица трансформации
 */
export function setInstanceMatrix(
  instancedProduct: InstancedProduct,
  index: number,
  matrix: THREE.Matrix4
): void {
  if (index < 0 || index >= instancedProduct.count) {
    console.warn(`Index ${index} out of range for instanced product`);
    return;
  }
  instancedProduct.mesh.setMatrixAt(index, matrix);
}

/**
 * Устанавливает позицию, масштаб и вращение для инстанса.
 *
 * @param instancedProduct - InstancedProduct
 * @param index - Индекс инстанса
 * @param position - Позиция
 * @param scale - Масштаб (опционально)
 * @param rotation - Вращение в радианах (опционально)
 */
export function setInstanceTransform(
  instancedProduct: InstancedProduct,
  index: number,
  position: { x: number; y: number; z: number },
  scale?: number,
  rotation?: { x: number; y: number; z: number }
): void {
  if (index < 0 || index >= instancedProduct.count) {
    console.warn(`Index ${index} out of range for instanced product`);
    return;
  }

  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3(position.x, position.y, position.z);
  const scl = scale !== undefined ? scale * instancedProduct.product.normalizedScale : instancedProduct.product.normalizedScale;
  const rot = rotation 
    ? new THREE.Euler(rotation.x, rotation.y, rotation.z)
    : new THREE.Euler(0, 0, 0);

  // Создаем матрицу без вращения (вращение будет в шейдере)
  matrix.compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(scl, scl, scl));
  instancedProduct.mesh.setMatrixAt(index, matrix);
}

/**
 * Помечает матрицы инстансов как требующие обновления.
 *
 * @param instancedProduct - InstancedProduct
 */
export function markInstancesDirty(instancedProduct: InstancedProduct): void {
  instancedProduct.mesh.instanceMatrix.needsUpdate = true;
}
