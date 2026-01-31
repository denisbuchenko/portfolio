import * as THREE from "three";
import type { FoodEntry } from "./foodCatalog";
import { patchMaterialForBackground } from "./utils";
import type { FruitLayerBits } from "./types";

/**
 * Логика создания и управления InstancedMesh для оптимизации рендера.
 * Вместо создания отдельных Group для каждого фрукта, используем InstancedMesh
 * с общей геометрией и материалами, что значительно экономит память и drawcalls.
 */

/**
 * Определение типа фрукта: геометрия и материалы для создания инстансов.
 */
export type TypeDef = {
  name: string;
  normalizedScale: number;
  parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial }>;
};

/**
 * Слой инстансов для конкретного типа фрукта и bits-слоя.
 * Содержит массив InstancedMesh (по одному на каждый подмеш) и метаданные.
 */
export type TypeLayer = {
  bits: FruitLayerBits;
  typeName: string;
  meshes: THREE.InstancedMesh[];
  count: number;
  baseScale: number;
  _dirty: boolean;
};

/**
 * Результат распределения инстансов по типам фруктов.
 */
type AssignedInstances = {
  types: string[];
  countByType: Map<string, number>;
};

/**
 * Собирает определения типов из загруженных записей.
 * Преобразует Group в плоский список геометрий с материалами,
 * применяя трансформации для правильного позиционирования.
 */
export function buildTypeDefs(entries: FoodEntry[]): Map<string, TypeDef> {
  const out = new Map<string, TypeDef>();

  for (const e of entries) {
    const group = e.object;
    group.updateMatrixWorld(true);
    const inv = group.matrixWorld.clone().invert();

    // Собираем все меши из группы, применяя трансформации
    const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial }> = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.updateMatrixWorld(true);
      // Преобразуем геометрию в координаты корня группы
      const localToGroup = inv.clone().multiply(mesh.matrixWorld);
      const geo = (mesh.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(localToGroup);

      const mat = mesh.material as THREE.MeshBasicMaterial;
      patchMaterialForBackground(mat);
      parts.push({ geometry: geo, material: mat });
    });

    if (parts.length <= 0) continue;
    out.set(e.name, { name: e.name, normalizedScale: e.normalizedScale, parts });
  }

  return out;
}

/**
 * Распределяет инстансы по типам фруктов (детерминированно).
 * Каждый инстанс случайно (но предсказуемо) назначается одному из picked типов.
 */
export function assignInstancesToTypes(picked: FoodEntry[], count: number, seed: number): AssignedInstances {
  const types: string[] = [];
  const countByType = new Map<string, number>();

  if (picked.length <= 0 || count <= 0) return { types, countByType };

  for (let i = 0; i < count; i++) {
    const r = rand01((seed + i * 31) | 0);
    const entry = picked[Math.min(picked.length - 1, Math.floor(r * picked.length))];
    types.push(entry.name);
    countByType.set(entry.name, (countByType.get(entry.name) ?? 0) + 1);
  }

  return { types, countByType };
}

/**
 * Создаёт TypeLayer для конкретного bits-слоя.
 * Для каждого типа фрукта создаёт InstancedMesh с нужным количеством инстансов.
 */
export function createTypeLayersForBits(
  bits: FruitLayerBits,
  defs: Map<string, TypeDef>,
  counts: Map<string, number>
): Map<string, TypeLayer> {
  const out = new Map<string, TypeLayer>();

  for (const [name, cnt] of counts) {
    const def = defs.get(name);
    if (!def || cnt <= 0) continue;

    // Создаём InstancedMesh для каждого подмеша
    const meshes: THREE.InstancedMesh[] = [];
    for (let p = 0; p < def.parts.length; p++) {
      const part = def.parts[p];
      const im = new THREE.InstancedMesh(part.geometry, part.material, cnt);
      im.frustumCulled = false;
      im.layers.set(bits);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Будем обновлять каждый кадр
      meshes.push(im);
    }

    out.set(name, { bits, typeName: name, meshes, count: cnt, baseScale: def.normalizedScale, _dirty: true });
  }

  return out;
}

// Импорт для использования в этой же функции
import { rand01 } from "./utils";
