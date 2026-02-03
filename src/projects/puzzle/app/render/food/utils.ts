import * as THREE from "three";

export function hexToColor3(hex: string): THREE.Color {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(0xffffff), 0.18);
  return c;
}

export function norm2(v: THREE.Vector2): THREE.Vector2 {
  const n = v.length();
  if (n < 1e-6) return new THREE.Vector2(1, 0);
  return v.multiplyScalar(1 / n);
}

export function rand01(seed: number): number {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x1_0000_0000;
}

