import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Запись о загруженном фрукте/еде из glTF каталога.
 * Содержит готовый к использованию объект и нормализованный масштаб.
 */
export type FoodEntry = {
  /** Имя объекта (например "apple", "banana") */
  name: string;
  /** Клонированный Group с настроенными материалами */
  object: THREE.Group;
  /** Нормализованный масштаб: 1 / maxDim (чтобы объект был единичного размера) */
  normalizedScale: number;
};

/**
 * Загружает и парсит glTF файл с 3D моделями фруктов/еды.
 *
 * Что делает:
 * 1. Загружает glTF через GLTFLoader
 * 2. Находит все базовые ноды (без underscore в имени)
 * 3. Фильтрует мусорные ноды (RootNode, FBX-обёртки и т.п.)
 * 4. Настраивает материалы (Basic/unlit для чистого цвета из текстуры)
 * 5. Центрирует и нормализует размер каждого объекта
 *
 * @param gltfUrl - URL к .gltf файлу
 * @returns Массив записей о каждом валидном объекте
 */
export async function loadFoodCatalog(gltfUrl: string): Promise<{ entries: FoodEntry[] }> {
  const root = await _loadGLTFScene(gltfUrl);
  const baseNodeNames = _collectBaseNodeNames(root);
  const entries: FoodEntry[] = [];

  for (const baseName of baseNodeNames) {
    const node = root.getObjectByName(baseName);
    if (!node) continue;

    if (!_hasProperMesh(node, baseName)) continue;

    const { group, normalizedScale } = _processNode(node, baseName);
    entries.push({ name: baseName, object: group, normalizedScale });
  }

  return { entries };
}

/**
 * Загружает glTF файл и возвращает корневую сцену.
 */
async function _loadGLTFScene(gltfUrl: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(gltfUrl);
  return gltf.scene;
}

/**
 * Собирает имена всех базовых нод (без underscore в имени).
 * Это корневые узлы для каждого типа фрукта.
 */
function _collectBaseNodeNames(root: THREE.Object3D): string[] {
  const bases = new Set<string>();
  
  root.traverse((o) => {
    const name = o.name || "";
    if (!name || name.includes("_")) return; // пропускаем дочерние ноды вида "apple_apple_0"
    bases.add(name);
  });

  return Array.from(bases).sort((a, b) => a.localeCompare(b));
}

/**
 * Проверяет, есть ли у ноды правильный меш.
 * Фильтрует мусорные/служебные root-ноды (RootNode, FBX-обёртки и т.п.).
 * Берём только те base, у которых реально есть меш вида `${base}_${base}_0`.
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
 * Обрабатывает ноду: клонирует, настраивает материалы и нормализует размер.
 */
function _processNode(
  node: THREE.Object3D,
  baseName: string
): { group: THREE.Group; normalizedScale: number } {
  // Клонируем ноду для безопасного использования
  const group = node.clone(true) as THREE.Group;
  group.name = baseName;

  // Настраиваем материалы
  _setupMaterials(group);

  // Центрируем и нормализуем размер
  const normalizedScale = _centerAndNormalize(group);

  return { group, normalizedScale };
}

/**
 * Настраивает материалы для всех мешей в группе.
 * Использует Basic (unlit) материал для чистого цвета из текстуры.
 * Это даёт "мультяшный" вид без зависимости от освещения.
 */
function _setupMaterials(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Отключаем тени и frustum culling
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
 * Это позволяет легко масштабировать объекты до нужного размера в пикселях.
 * 
 * @returns Нормализованный масштаб (1 / maxDim)
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
