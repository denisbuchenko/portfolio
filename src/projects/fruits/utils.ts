import * as THREE from "three";

/**
 * Утилиты для работы с фруктами.
 */

/**
 * Ограничивает значение между min и max.
 */
export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/**
 * Нормализует 2D вектор. Если длина < 1e-6, возвращает (1, 0).
 */
export function norm2(v: THREE.Vector2): THREE.Vector2 {
  const n = v.length();
  if (n < 1e-6) return new THREE.Vector2(1, 0);
  return v.multiplyScalar(1 / n);
}

/**
 * Детерминированный генератор случайных чисел (0..1) на основе seed.
 * Использует xorshift-подобный алгоритм для быстрого и предсказуемого результата.
 */
 // Простая функция для генерации случайных чисел
 export function rand01(seed: number): number {
  let x = seed ^ (seed >>> 15);
  x = Math.imul(x, 0x46d31bad);
  x ^= x >>> 14;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 15;
  return (x >>> 0) / 0x1_0000_0000;
}

/**
 * Конвертирует hex цвет в RGB компоненты (0..255).
 */
export function hexToRgb8(hex: string): { r: number; g: number; b: number } {
  const c = new THREE.Color(hex);
  return {
    r: Math.round(clamp(c.r, 0, 1) * 255),
    g: Math.round(clamp(c.g, 0, 1) * 255),
    b: Math.round(clamp(c.b, 0, 1) * 255)
  };
}

/**
 * Создаёт простую текстуру из одного цвета (для fallback).
 */
export function createSolidTexture(hex: string): THREE.DataTexture {
  const { r, g, b } = hexToRgb8(hex);
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Настраивает Basic материал для фона (unlit, цвет строго из текстуры).
 */
export function patchMaterialForBackground(mat: THREE.MeshBasicMaterial): void {
  mat.toneMapped = false;
  mat.depthTest = true;
  mat.depthWrite = true;
  mat.side = THREE.DoubleSide;
}

/**
 * Фильтрует записи каталога по include/exclude спискам.
 */
export function filterCatalogEntries<T extends { name: string }>(
  entries: T[],
  include?: string[],
  exclude?: string[]
): T[] {
  const inc = (include ?? []).filter(Boolean);
  const exc = new Set((exclude ?? []).filter(Boolean));
  if (inc.length > 0) {
    const incSet = new Set(inc);
    return entries.filter((e) => incSet.has(e.name));
  }
  if (exc.size > 0) return entries.filter((e) => !exc.has(e.name));
  return entries;
}

/**
 * Выбирает уникальные записи (детерминированная тасовка Fisher-Yates до k элементов).
 */
export function pickUnique<T>(entries: T[], count: number, seed: number): T[] {
  const n = entries.length;
  if (n <= 0) return [];
  const k = Math.max(0, Math.min(n, count | 0));
  if (k <= 0) return [];

  const idx: number[] = Array.from({ length: n }, (_, i) => i);
  let s = seed | 0;
  for (let i = 0; i < k; i++) {
    s = (s * 1664525 + 1013904223) | 0; // LCG
    const r = ((s >>> 0) % (n - i)) | 0;
    const j = i + r;
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx.slice(0, k).map((i) => entries[i]);
}
