import * as THREE from "three";

const EPSILON = 1e-6;

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const normalizeVector2 = (v: THREE.Vector2): THREE.Vector2 =>
  v.length() < EPSILON ? new THREE.Vector2(1, 0) : v.clone().normalize();

// Единый детерминированный ГСЧ (xorshift)
const _deterministicRandom = (seed: number): number => {
  let x = seed ^ (seed >>> 15);
  x = Math.imul(x, 0x46d31bad);
  x ^= x >>> 14;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 15;
  return (x >>> 0) / 0x1_0000_0000;
};

export const rand01 = _deterministicRandom;

export const hexToRgb8 = (hex: string) => {
  const c = new THREE.Color(hex);
  return {
    r: Math.round(clamp(c.r, 0, 1) * 255),
    g: Math.round(clamp(c.g, 0, 1) * 255),
    b: Math.round(clamp(c.b, 0, 1) * 255),
  };
};

export const filterProducts = <T extends { name: string }>(
  items: T[],
  { include, exclude }: { include?: string[]; exclude?: string[] }
): T[] => {
  const inc = new Set(include?.filter(Boolean) ?? []);
  const exc = new Set(exclude?.filter(Boolean) ?? []);

  if (inc.size) return items.filter(e => inc.has(e.name));
  if (exc.size) return items.filter(e => !exc.has(e.name));
  return items;
};

export const pickUnique = <T>(items: T[], count: number, seed: number): T[] => {
  if (items.length === 0 || count <= 0) return [];
  const k = Math.min(items.length, count);
  const indices = Array.from({ length: items.length }, (_, i) => i);
  let s = seed | 0;

  for (let i = 0; i < k; i++) {
    s = (s * 1664525 + 1013904223) | 0;
    const j = i + (((s >>> 0) % (items.length - i)) | 0);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, k).map(i => items[i]);
};

export const DEFAULT_COLOR = 0xffffff;

