import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type FoodCatalogEntry = { name: string; group: THREE.Group; normalizedScale: number };

function _cloneAndLambertize(node: THREE.Object3D): THREE.Group {
  const group = node.clone(true) as THREE.Group;
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const srcMat = mesh.material as THREE.Material;
    const map = (srcMat as unknown as { map?: THREE.Texture }).map ?? undefined;
    mesh.material = new THREE.MeshLambertMaterial({ map, color: 0xffffff });
    const lm = mesh.material as THREE.MeshLambertMaterial;
    lm.depthTest = false;
    lm.depthWrite = false;
    lm.toneMapped = false;
  });
  return group;
}

function _normalizeGroup(group: THREE.Group): number {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  group.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  return 1 / maxDim;
}

export async function loadFoodCatalog(gltfUrl: string): Promise<FoodCatalogEntry[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(gltfUrl);
  const root = gltf.scene;

  const bases = new Set<string>();
  root.traverse((o) => {
    const n = o.name || "";
    if (!n) return;
    if (n.includes("_")) return;
    bases.add(n);
  });

  const sortedBases = Array.from(bases).sort((a, b) => a.localeCompare(b));
  return sortedBases
    .map((base) => {
      const node = root.getObjectByName(base);
      if (!node) return null;
      const group = _cloneAndLambertize(node);
      group.name = base;
      const normalizedScale = _normalizeGroup(group);
      return { name: base, group, normalizedScale };
    })
    .filter((x): x is FoodCatalogEntry => x !== null);
}

