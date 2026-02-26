import * as THREE from "three";

export function projectToScreen(
  world: THREE.Vector3,
  w: number,
  h: number,
  camera: THREE.Camera
): { x: number; y: number } | null {
  const v = world.clone().project(camera);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
  // z outside clip space
  if (v.z < -1 || v.z > 1) return null;
  return {
    x: (v.x * 0.5 + 0.5) * w,
    y: (-v.y * 0.5 + 0.5) * h
  };
}

