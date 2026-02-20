import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

let _installed = false;

/**
 * Подключает ускоренный raycast (BVH) глобально для Mesh.
 * Вызывать один раз при старте City.
 */
export function installMeshBvhRaycast(): void {
  if (_installed) return;
  _installed = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
}

export function buildMeshBvh(mesh: THREE.Mesh): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mesh.geometry as any).computeBoundsTree = computeBoundsTree;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mesh.geometry as any).disposeBoundsTree = disposeBoundsTree;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mesh.geometry as any).computeBoundsTree();
}

export function disposeMeshBvh(mesh: THREE.Mesh): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geo: any = mesh.geometry as any;
  if (typeof geo.disposeBoundsTree === "function") geo.disposeBoundsTree();
}

