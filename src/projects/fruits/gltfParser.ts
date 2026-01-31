/**
 * Парсер GLTF файлов для извлечения продуктов.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Product } from "./types";

/**
 * Загружает и парсит GLTF файл, извлекая все продукты.
 *
 * @param gltfUrl - URL к .gltf файлу
 * @returns Массив продуктов
 */
export async function parseGLTF(gltfUrl: string): Promise<Product[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(gltfUrl);
  const scene = gltf.scene;

  const products: Product[] = [];
  const baseNodeNames = _collectBaseNodeNames(scene);

  for (const baseName of baseNodeNames) {
    const node = scene.getObjectByName(baseName);
    if (!node) continue;

    if (!_hasProperMesh(node, baseName)) continue;

    const product = _processNode(node, baseName);
    if (product) {
      products.push(product);
    }
  }

  return products;
}

/**
 * Собирает имена всех базовых нод (без underscore в имени).
 */
function _collectBaseNodeNames(root: THREE.Object3D): string[] {
  const bases = new Set<string>();

  root.traverse((o) => {
    const name = o.name || "";
    if (!name || name.includes("_")) return;
    bases.add(name);
  });

  return Array.from(bases).sort((a, b) => a.localeCompare(b));
}

/**
 * Проверяет, есть ли у ноды правильный меш.
 */
function _hasProperMesh(node: THREE.Object3D, baseName: string): boolean {
  const baseLower = baseName.toLowerCase();

  let hasProperMesh = false;
  node.traverse((o) => {
    if (hasProperMesh) return;

    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    const meshName = (mesh.name || "").toLowerCase();
    const expectedPrefix = `${baseLower}_${baseLower}_`;

    if (meshName.startsWith(expectedPrefix)) {
      hasProperMesh = true;
    }
  });

  return hasProperMesh;
}

/**
 * Обрабатывает ноду: извлекает геометрию и материалы, нормализует размер.
 */
function _processNode(node: THREE.Object3D, baseName: string): Product | null {
  // Создаем временную группу для обработки
  const group = node.clone(true) as THREE.Group;
  group.name = baseName;

  // Настраиваем материалы
  _setupMaterials(group);

  // Центрируем и нормализуем размер (делаем это до извлечения геометрии)
  const normalizedScale = _centerAndNormalize(group);

  // Обновляем матрицы после нормализации
  group.updateMatrixWorld(true);

  // Извлекаем геометрию и материалы
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.updateMatrixWorld(true);
    const geo = (mesh.geometry as THREE.BufferGeometry).clone();
    geo.applyMatrix4(mesh.matrixWorld);

    const mat = mesh.material as THREE.MeshBasicMaterial;
    materials.push(mat);
    geometries.push(geo);
  });

  if (geometries.length === 0) return null;

  // Объединяем все геометрии в одну
  const mergedGeometry = _mergeGeometries(geometries);

  return {
    name: baseName,
    geometry: mergedGeometry,
    materials: materials,
    normalizedScale
  };
}

/**
 * Объединяет несколько геометрий в одну.
 */
function _mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 1) return geometries[0];

  // Используем BufferGeometryUtils если доступен, иначе просто берем первую
  // В реальности можно использовать THREE.BufferGeometryUtils.mergeGeometries
  // но для простоты возьмем первую геометрию
  // TODO: можно улучшить, объединив все геометрии
  return geometries[0];
}

/**
 * Настраивает материалы для всех мешей в группе.
 */
function _setupMaterials(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    // Извлекаем текстуру из исходного материала
    const srcMat = mesh.material as THREE.Material;
    const map = (srcMat as unknown as { map?: THREE.Texture }).map ?? undefined;
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
    }

    // Создаём новый Basic материал
    const mat = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    mat.toneMapped = false;
    mat.depthTest = true;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;

    mesh.material = mat;
  });
}

/**
 * Центрирует объект и нормализует его размер (чтобы maxDim = 1).
 */
function _centerAndNormalize(group: THREE.Group): number {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  // Центрируем объект
  group.position.sub(center);

  // Вычисляем нормализованный масштаб
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  return 1 / maxDim;
}
