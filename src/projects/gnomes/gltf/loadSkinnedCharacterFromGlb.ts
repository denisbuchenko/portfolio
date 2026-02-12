import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type LoadedSkinnedCharacter = {
  gltf: GLTF;
  scene: THREE.Group;
  characterRoot: THREE.Object3D;
  skinnedMeshes: THREE.SkinnedMesh[];
  animations: THREE.AnimationClip[];
  bounds: {
    box: THREE.Box3;
    size: THREE.Vector3;
    center: THREE.Vector3;
  };
};

/**
 * Обработчик GLB: загружает файл и пытается найти персонажа со скелетом (SkinnedMesh) и анимациями.
 * Возвращает корневой Object3D персонажа (общий предок всех skinned-мешей) и клипы.
 */
export async function loadSkinnedCharacterFromGlb(glbUrl: string): Promise<LoadedSkinnedCharacter> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(glbUrl);

  const scene = gltf.scene;
  const skinnedMeshes = _collectSkinnedMeshes(scene);
  if (skinnedMeshes.length === 0) {
    throw new Error(`GLB не содержит SkinnedMesh (скелетной модели): ${glbUrl}`);
  }

  const animations = (gltf.animations ?? []).slice();
  if (animations.length === 0) {
    throw new Error(`GLB не содержит анимаций: ${glbUrl}`);
  }

  const characterRoot = _findLowestCommonAncestor(skinnedMeshes, scene);

  // Проставляем sRGB для текстур и включаем тени — это помогает дать \"объём\".
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const material = mesh.material as unknown;
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials) {
      const anyMat = m as Record<string, unknown>;
      const map = anyMat.map as THREE.Texture | undefined;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
    }
  });

  const box = new THREE.Box3().setFromObject(characterRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  return {
    gltf,
    scene,
    characterRoot,
    skinnedMeshes,
    animations,
    bounds: { box, size, center },
  };
}

function _collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const sk = o as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) out.push(sk);
  });
  return out;
}

function _ancestorChain(o: THREE.Object3D, stopAt: THREE.Object3D): THREE.Object3D[] {
  const chain: THREE.Object3D[] = [];
  let cur: THREE.Object3D | null = o;
  while (cur) {
    chain.push(cur);
    if (cur === stopAt) break;
    cur = cur.parent;
  }
  return chain;
}

function _findLowestCommonAncestor(skinnedMeshes: THREE.SkinnedMesh[], sceneRoot: THREE.Object3D): THREE.Object3D {
  const first = skinnedMeshes[0];
  const firstChain = _ancestorChain(first, sceneRoot);
  const common = new Set(firstChain);

  for (let i = 1; i < skinnedMeshes.length; i++) {
    const chain = _ancestorChain(skinnedMeshes[i], sceneRoot);
    const chainSet = new Set(chain);
    for (const node of Array.from(common)) {
      if (!chainSet.has(node)) common.delete(node);
    }
  }

  // Берём самый \"глубокий\" общий предок — первый встретившийся по пути от меша к сцене.
  for (const node of firstChain) {
    if (common.has(node)) return node;
  }

  return sceneRoot;
}

