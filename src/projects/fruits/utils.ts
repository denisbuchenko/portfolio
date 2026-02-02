import * as THREE from "three";
import type { Product, RenderProductOptions } from "./types";
import vertexShader from "./shaders/animatedProduct.vert.glsl?raw";
import fragmentShader from "./shaders/animatedProduct.frag.glsl?raw";

/**
 * Утилиты и системы для работы с фруктами (анимация, instancing, рендер, сцена).
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
  
  const img = (texture as any).image as { width?: number; height?: number } | undefined;
  const data = (texture as any).source?.data as { width?: number; height?: number } | undefined;

  if (img?.width && img.height) {
    texWidth = img.width;
    texHeight = img.height;
  } else if (data?.width && data.height) {
    texWidth = data.width;
    texHeight = data.height;
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
  const debugMaterial = new THREE.MeshBasicMaterial({ 
    map: texture,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, debugMaterial);
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
    debugMaterial.dispose();
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

/**
 * Система анимации через шейдеры для продуктов.
 */

/**
 * Создает ShaderMaterial для анимированного продукта.
 *
 * @param product - Продукт
 * @param bounds - Границы для uBounds
 * @returns ShaderMaterial
 */
export function createAnimatedMaterial(
  product: Product,
  bounds: { width: number; height: number }
): THREE.ShaderMaterial {
  // Используем первую текстуру из материалов
  const map = product.materials.length > 0 && product.materials[0].map 
    ? product.materials[0].map 
    : null;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      map: { value: map },
      color: { value: new THREE.Color(0xffffff) },
      uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) }
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true
  });

  return material;
}

/**
 * Обновляет uniforms шейдера для анимации.
 *
 * @param material - ShaderMaterial
 * @param time - Время в секундах
 */
export function updateAnimation(material: THREE.ShaderMaterial, time: number): void {
  if (material.uniforms && (material.uniforms as any).uTime) {
    (material.uniforms as any).uTime.value = time;
  }
}

/**
 * Создает InstancedBufferAttribute для передачи параметров анимации каждому инстансу.
 * Это позволяет каждому инстансу иметь свои уникальные параметры анимации.
 *
 * @param count - Количество инстансов
 * @param seed - Базовый seed для генерации случайных параметров
 * @param bounds - Границы видимой области для размещения объектов
 * @param startInstanceIndex - Начальный индекс инстанса (для глобальной уникальности)
 * @returns Объект с атрибутами для добавления в геометрию
 */
export function createAnimationAttributes(
  count: number,
  seed: number,
  bounds: { width: number; height: number },
  startInstanceIndex: number = 0
): {
  rotationSpeed: THREE.InstancedBufferAttribute;
  rotationAxis: THREE.InstancedBufferAttribute;
  phase: THREE.InstancedBufferAttribute;
  movementDirection: THREE.InstancedBufferAttribute;
  movementSpeed: THREE.InstancedBufferAttribute;
  initialPosition: THREE.InstancedBufferAttribute;
} {
  const rotationSpeedArray = new Float32Array(count);
  const rotationAxisArray = new Float32Array(count * 3);
  const phaseArray = new Float32Array(count);
  const movementDirectionArray = new Float32Array(count * 2);
  const movementSpeedArray = new Float32Array(count);
  const initialPositionArray = new Float32Array(count * 3);

  // Простая функция для генерации случайных чисел
  function _rand(seedLocal: number): number {
    let x = seedLocal ^ (seedLocal >>> 15);
    x = Math.imul(x, 0x46d31bad);
    x ^= x >>> 14;
    x = Math.imul(x, 0x2c1b3c6d);
    x ^= x >>> 15;
    return (x >>> 0) / 0x1_0000_0000;
  }

  for (let i = 0; i < count; i++) {
    // Используем глобальный индекс инстанса для уникальности позиций
    const globalIndex = startInstanceIndex + i;
    const s = (seed + globalIndex * 31) | 0;
    
    // Случайная скорость вращения (0.3 - 1.0)
    rotationSpeedArray[i] = 0.3 + _rand(s) * 0.7;
    
    // Случайная ось вращения (нормализованная)
    const axisX = (_rand(s + 1) - 0.5) * 2.0;
    const axisY = (_rand(s + 2) - 0.5) * 2.0;
    const axisZ = (_rand(s + 3) - 0.5) * 2.0;
    const axisLen = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
    const invLen = axisLen > 0.001 ? 1.0 / axisLen : 1.0;
    
    rotationAxisArray[i * 3 + 0] = axisX * invLen;
    rotationAxisArray[i * 3 + 1] = axisY * invLen;
    rotationAxisArray[i * 3 + 2] = axisZ * invLen;
    
    // Случайная фаза (0 - 2π)
    phaseArray[i] = _rand(s + 4) * 6.28318530718;
    
    // Уникальное направление движения для каждого инстанса
    // Генерируем случайный угол и преобразуем в направление
    const angle = _rand(s + 5) * 6.28318530718; // 0 - 2π
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    movementDirectionArray[i * 2 + 0] = dirX;
    movementDirectionArray[i * 2 + 1] = dirY;
    
    // Уникальная скорость движения (1.0 - 3.0)
    movementSpeedArray[i] = 1.0 + _rand(s + 6) * 2.0;
    
    // Случайная начальная 3D позиция в видимой области
    // Используем только центральную треть для начального размещения
    const visibleWidth = bounds.width / 3.0;
    const visibleHeight = bounds.height / 3.0;
    const posX = (_rand(s + 7) - 0.5) * visibleWidth;
    const posY = (_rand(s + 8) - 0.5) * visibleHeight;
    const posZ = (_rand(s + 9) - 0.5) * 5.0 - 5.0; // Z от -2.5 до -7.5
    
    initialPositionArray[i * 3 + 0] = posX;
    initialPositionArray[i * 3 + 1] = posY;
    initialPositionArray[i * 3 + 2] = posZ;
  }

  return {
    rotationSpeed: new THREE.InstancedBufferAttribute(rotationSpeedArray, 1),
    rotationAxis: new THREE.InstancedBufferAttribute(rotationAxisArray, 3),
    phase: new THREE.InstancedBufferAttribute(phaseArray, 1),
    movementDirection: new THREE.InstancedBufferAttribute(movementDirectionArray, 2),
    movementSpeed: new THREE.InstancedBufferAttribute(movementSpeedArray, 1),
    initialPosition: new THREE.InstancedBufferAttribute(initialPositionArray, 3)
  };
}

/**
 * InstancedMesh для продукта с управлением матрицами.
 */
export type InstancedProduct = {
  /** InstancedMesh */
  mesh: THREE.InstancedMesh;
  /** Количество инстансов */
  count: number;
  /** Продукт */
  product: Product;
};

/**
 * Создает InstancedMesh для продукта.
 *
 * @param product - Продукт для создания инстансов
 * @param count - Количество инстансов
 * @returns InstancedProduct
 */
export function createInstancedProduct(product: Product, count: number): InstancedProduct {
  // Используем первый материал (или создаем дефолтный)
  const material = product.materials.length > 0 
    ? product.materials[0] 
    : new THREE.MeshBasicMaterial({ color: 0xffffff });

  const mesh = new THREE.InstancedMesh(product.geometry, material, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Будем обновлять каждый кадр

  return {
    mesh,
    count,
    product
  };
}

/**
 * Устанавливает матрицу для инстанса.
 *
 * @param instancedProduct - InstancedProduct
 * @param index - Индекс инстанса
 * @param matrix - Матрица трансформации
 */
export function setInstanceMatrix(
  instancedProduct: InstancedProduct,
  index: number,
  matrix: THREE.Matrix4
): void {
  if (index < 0 || index >= instancedProduct.count) {
    console.warn(`Index ${index} out of range for instanced product`);
    return;
  }
  instancedProduct.mesh.setMatrixAt(index, matrix);
}

/**
 * Устанавливает позицию, масштаб и вращение для инстанса.
 *
 * @param instancedProduct - InstancedProduct
 * @param index - Индекс инстанса
 * @param position - Позиция
 * @param scale - Масштаб (опционально)
 * @param rotation - Вращение в радианах (опционально)
 */
export function setInstanceTransform(
  instancedProduct: InstancedProduct,
  index: number,
  position: { x: number; y: number; z: number },
  scale?: number,
  rotation?: { x: number; y: number; z: number }
): void {
  if (index < 0 || index >= instancedProduct.count) {
    console.warn(`Index ${index} out of range for instanced product`);
    return;
  }

  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3(position.x, position.y, position.z);
  const scl = scale !== undefined ? scale * instancedProduct.product.normalizedScale : instancedProduct.product.normalizedScale;
  const rot = rotation 
    ? new THREE.Euler(rotation.x, rotation.y, rotation.z)
    : new THREE.Euler(0, 0, 0);

  // Создаем матрицу без вращения (вращение будет в шейдере)
  matrix.compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(scl, scl, scl));
  instancedProduct.mesh.setMatrixAt(index, matrix);
}

/**
 * Помечает матрицы инстансов как требующие обновления.
 *
 * @param instancedProduct - InstancedProduct
 */
export function markInstancesDirty(instancedProduct: InstancedProduct): void {
  instancedProduct.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Настройки WebGL рендера для фруктов.
 */
export type RendererSettings = {
  /** Включить альфа-канал (прозрачность) */
  alpha: boolean;
  /** Включить сглаживание (antialiasing) */
  antialias: boolean;
  /** Включить буфер глубины (для 3D) */
  depth: boolean;
  /** Включить буфер трафарета */
  stencil: boolean;
  /** Premultiplied alpha */
  premultipliedAlpha: boolean;
  /** Сохранять буфер после рендера (для readPixels) */
  preserveDrawingBuffer: boolean;
  /** Цветовое пространство вывода (SRGB для корректных цветов) */
  outputColorSpace: THREE.ColorSpace;
  /** Автоматическая очистка перед каждым рендером */
  autoClear: boolean;
};

/**
 * Дефолтные настройки рендера для фруктов.
 */
const DEFAULT_SETTINGS: RendererSettings = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  outputColorSpace: THREE.SRGBColorSpace,
  autoClear: true
};

/**
 * Создаёт и настраивает WebGLRenderer для рендера фруктов.
 *
 * @param canvas - Canvas элемент для рендера
 * @param settings - Настройки рендера (по умолчанию используются DEFAULT_SETTINGS)
 * @returns Настроенный WebGLRenderer
 */
export function createFruitsRenderer(
  canvas: HTMLCanvasElement,
  settings: Partial<RendererSettings> = {}
): THREE.WebGLRenderer {
  const opts = { ...DEFAULT_SETTINGS, ...settings };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: opts.alpha,
    antialias: opts.antialias,
    depth: opts.depth,
    stencil: opts.stencil,
    premultipliedAlpha: opts.premultipliedAlpha,
    preserveDrawingBuffer: opts.preserveDrawingBuffer
  });

  renderer.setPixelRatio(1); // Управляем размером вручную через resize
  renderer.outputColorSpace = opts.outputColorSpace;
  renderer.autoClear = opts.autoClear;

  return renderer;
}

/**
 * Вычисляет размеры canvas с учётом DPR и обновляет рендер.
 *
 * @param canvas - Canvas элемент
 * @param renderer - WebGLRenderer
 * @param getDpr - Функция получения device pixel ratio
 * @returns Размеры {w, h, dpr}
 */
export function resizeRenderer(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  getDpr: () => number
): { w: number; h: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = getDpr();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  renderer.setSize(w, h, false);

  return { w, h, dpr };
}

/**
 * Размещает один продукт в сцене.
 *
 * @param scene - Сцена для добавления продукта
 * @param product - Продукт для размещения
 * @param options - Опции размещения
 * @returns Созданный mesh
 */
export function renderProduct(
  scene: THREE.Scene,
  product: Product,
  options: RenderProductOptions = {}
): THREE.Mesh {
  // Используем первый материал (или создаем дефолтный)
  const material = product.materials.length > 0 
    ? product.materials[0] 
    : new THREE.MeshBasicMaterial({ color: 0xffffff });

  const mesh = new THREE.Mesh(product.geometry, material);

  // Применяем опции
  if (options.position) {
    mesh.position.set(options.position.x, options.position.y, options.position.z);
  }

  if (options.scale !== undefined) {
    mesh.scale.setScalar(options.scale * product.normalizedScale);
  } else {
    mesh.scale.setScalar(product.normalizedScale);
  }

  if (options.rotation) {
    mesh.rotation.set(options.rotation.x, options.rotation.y, options.rotation.z);
  }

  if (options.quaternion) {
    mesh.quaternion.set(
      options.quaternion.x,
      options.quaternion.y,
      options.quaternion.z,
      options.quaternion.w
    );
  }

  scene.add(mesh);
  return mesh;
}

/**
 * Создает сцену с заданным цветом фона.
 *
 * @param backgroundColor - Цвет фона (hex строка)
 * @returns Созданная сцена
 */
export function createScene(backgroundColor: string): THREE.Scene {
  const scene = new THREE.Scene();
  const color = new THREE.Color(backgroundColor);
  scene.background = color;
  return scene;
}

/**
 * Настройки камеры.
 */
export type CameraSetup = {
  /** Камера */
  camera: THREE.PerspectiveCamera;
  /** Ширина экрана */
  width: number;
  /** Высота экрана */
  height: number;
};

/**
 * Создает и настраивает камеру для корректного отображения на весь экран.
 *
 * @param width - Ширина экрана
 * @param height - Высота экрана
 * @param fov - Поле зрения (градусы)
 * @returns Настроенная камера и размеры
 */
export function setupCamera(width: number, height: number, fov: number): CameraSetup {
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);

  // Позиционируем камеру на фиксированном расстоянии от центра сцены
  // Объекты размещены в диапазоне примерно от -10 до +10, поэтому камера на расстоянии 20-30
  camera.position.set(0, 0, 25);
  camera.lookAt(0, 0, 0);

  return { camera, width, height };
}

/**
 * Обновляет размеры камеры при изменении размеров экрана.
 *
 * @param camera - Камера для обновления
 * @param width - Новая ширина
 * @param height - Новая высота
 */
export function updateCameraSize(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): void {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
