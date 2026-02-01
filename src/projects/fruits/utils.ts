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

/**
 * Визуализирует Three.js текстуру поверх всех элементов в отдельном canvas.
 * Создает overlay с canvas, на котором отрисовывается текстура.
 * 
 * @param texture - Текстура для визуализации
 * @param label - Опциональная метка для отображения
 * @returns Функция для закрытия overlay
 */
export function showTextureDebug(texture: THREE.Texture, label?: string): () => void {
  // Определяем размеры текстуры
  let texWidth = 256;
  let texHeight = 256;
  
  if (texture.image) {
    const img = texture.image as { width?: number; height?: number };
    if (img.width && img.height) {
      texWidth = img.width;
      texHeight = img.height;
    }
  } else if (texture.source?.data) {
    const data = texture.source.data as { width?: number; height?: number };
    if (data.width && data.height) {
      texWidth = data.width;
      texHeight = data.height;
    }
  }

  // Создаем контейнер overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `;

  // Создаем внутренний контейнер
  const container = document.createElement("div");
  container.style.cssText = `
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    background: rgba(18, 22, 34, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  `;

  // Добавляем заголовок если есть
  if (label) {
    const title = document.createElement("div");
    title.textContent = label;
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.88);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;
    container.appendChild(title);
  }

  // Создаем canvas для отрисовки
  const canvas = document.createElement("canvas");
  const displayWidth = Math.min(texWidth, 800);
  const displayHeight = Math.min(texHeight, 600);
  const scale = Math.min(displayWidth / texWidth, displayHeight / texHeight);
  
  canvas.width = Math.floor(texWidth * scale);
  canvas.height = Math.floor(texHeight * scale);
  canvas.style.cssText = `
    display: block;
    max-width: 100%;
    max-height: 70vh;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  `;

  // Создаем временный рендерер для отрисовки текстуры
  const tempCanvas = document.createElement("canvas");
  const tempRenderer = new THREE.WebGLRenderer({
    canvas: tempCanvas,
    preserveDrawingBuffer: true,
    antialias: false
  });
  tempRenderer.setSize(canvas.width, canvas.height);
  tempRenderer.setPixelRatio(1);

  // Создаем сцену с плоскостью и текстурой
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ 
    map: texture,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Рендерим текстуру
  tempRenderer.render(scene, camera);

  // Копируем результат в canvas
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(tempRenderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  // Добавляем информацию о размерах
  const info = document.createElement("div");
  info.textContent = `Размер: ${texWidth} × ${texHeight}px`;
  info.style.cssText = `
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 8px;
    text-align: center;
  `;

  // Кнопка закрытия
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.88);
    border-radius: 4px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = "rgba(255, 255, 255, 0.2)";
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = "rgba(255, 255, 255, 0.1)";
  };

  // Собираем всё вместе
  container.appendChild(closeBtn);
  container.appendChild(canvas);
  container.appendChild(info);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Функция закрытия
  const close = () => {
    document.body.removeChild(overlay);
    tempRenderer.dispose();
    geometry.dispose();
    material.dispose();
  };

  closeBtn.onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      close();
    }
  };

  // Закрытие по Escape
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", handleKeyDown);
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  return close;
}
