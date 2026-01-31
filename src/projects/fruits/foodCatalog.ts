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
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(gltfUrl);
  const root = gltf.scene;

  // Собираем все базовые ноды: "apple", "banana", ... (без underscore)
  // Это корневые узлы для каждого типа фрукта
  const bases = new Set<string>();
  root.traverse((o) => {
    const n = o.name || "";
    if (!n) return;
    if (n.includes("_")) return; // пропускаем дочерние ноды вида "apple_apple_0"
    bases.add(n);
  });

  const sortedBases = Array.from(bases).sort((a, b) => a.localeCompare(b));
  const entries: FoodEntry[] = [];

  for (const base of sortedBases) {
    const node = root.getObjectByName(base);
    if (!node) continue;

    // Фильтр от мусорных/служебных root-ноды (RootNode, FBX-обёртки, "material" и т.п.):
    // берём только те base, у которых реально есть меш вида `${base}_${base}_0`.
    const baseLower = base.toLowerCase();
    let hasProperMesh = false;
    node.traverse((o) => {
      if (hasProperMesh) return;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const n = (mesh.name || "").toLowerCase();
      if (n.startsWith(`${baseLower}_${baseLower}_`)) hasProperMesh = true;
    });
    if (!hasProperMesh) continue;

    // Клонируем ноду для безопасного использования
    const group = node.clone(true) as THREE.Group;
    group.name = base;

    // Настраиваем материалы: Basic (unlit) для чистого цвета из текстуры
    // Это даёт "мультяшный" вид без зависимости от освещения
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      const srcMat = mesh.material as THREE.Material;
      const map = (srcMat as unknown as { map?: THREE.Texture }).map ?? undefined;
      if (map) map.colorSpace = THREE.SRGBColorSpace;

      const mat = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
      mat.toneMapped = false;
      mat.depthTest = true;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;
      mesh.material = mat;
    });

    // Центрируем объект и нормализуем размер (чтобы maxDim = 1)
    // Это позволяет легко масштабировать объекты до нужного размера в пикселях
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    group.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const normalizedScale = 1 / maxDim;

    entries.push({ name: base, object: group, normalizedScale });
  }

  return { entries };
}
