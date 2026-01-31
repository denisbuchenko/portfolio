import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type FoodEntry = {
  name: string;
  object: THREE.Group;
  normalizedScale: number; // 1 / maxDim
};

export async function loadFoodCatalog(gltfUrl: string): Promise<{ entries: FoodEntry[] }> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(gltfUrl);
  const root = gltf.scene;

  // Base nodes: "apple", "banana", ... (без underscore)
  const bases = new Set<string>();
  root.traverse((o) => {
    const n = o.name || "";
    if (!n) return;
    if (n.includes("_")) return;
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

    const group = node.clone(true) as THREE.Group;
    group.name = base;

    // Дёшево и "как в текстуре": Basic (unlit) + без теней + SRGB для baseColor
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

    // центрируем + нормализуем размер
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

