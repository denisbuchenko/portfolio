import * as THREE from "three";
import type { Product, RenderProductOptions } from "./types";
import vertexShader from "./shaders/animatedProduct.vert.glsl?raw";
import fragmentShader from "./shaders/animatedProduct.frag.glsl?raw";

/**
 * =============
 * БАЗОВЫЕ УТИЛИТЫ
 * =============
 */

/** Ограничивает значение в диапазоне [min, max] */
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/** Нормализует 2D-вектор. При нулевой длине возвращает (1, 0) */
export const normalizeVector2 = (v: THREE.Vector2): THREE.Vector2 => {
  const length = v.length();
  return length < 1e-6 
    ? new THREE.Vector2(1, 0) 
    : v.clone().multiplyScalar(1 / length);
};

/** Детерминированный ГСЧ (xorshift) → [0, 1) */
export const deterministicRandom = (seed: number): number => {
  let x = seed ^ (seed >>> 15);
  x = Math.imul(x, 0x46d31bad);
  x ^= x >>> 14;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 15;
  return (x >>> 0) / 0x1_0000_0000;
};

/** Конвертирует hex в RGB (0–255) */
export const hexToRgb8 = (hex: string): { r: number; g: number; b: number } => {
  const color = new THREE.Color(hex);
  return {
    r: Math.round(clamp(color.r, 0, 1) * 255),
    g: Math.round(clamp(color.g, 0, 1) * 255),
    b: Math.round(clamp(color.b, 0, 1) * 255),
  };
};

/**
 * =============
 * РАБОТА С ТЕКСТУРАМИ
 * =============
 */

/** Создаёт однотонную текстуру RGBA (fallback) */
export const createSolidTexture = (hex: string): THREE.DataTexture => {
  const { r, g, b } = hexToRgb8(hex);
  const data = new Uint8Array([r, g, b, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  
  return texture;
};

/** Настраивает материал для фона (без освещения, строгий цвет) */
export const configureBackgroundMaterial = (mat: THREE.MeshBasicMaterial): void => {
  mat.toneMapped = false;
  mat.depthTest = true;
  mat.depthWrite = true;
  mat.side = THREE.DoubleSide;
};

/**
 * =============
 * ФИЛЬТРАЦИЯ И ВЫБОР
 * =============
 */

/** Фильтрует записи по include/exclude спискам имён */
export const filterCatalogEntries = <T extends { name: string }>(
  entries: T[],
  include?: string[],
  exclude?: string[]
): T[] => {
  const includeSet = new Set((include ?? []).filter(Boolean));
  const excludeSet = new Set((exclude ?? []).filter(Boolean));
  
  if (includeSet.size > 0) {
    return entries.filter(entry => includeSet.has(entry.name));
  }
  if (excludeSet.size > 0) {
    return entries.filter(entry => !excludeSet.has(entry.name));
  }
  return entries;
};

/** Детерминированно выбирает `count` уникальных элементов (Fisher-Yates до k) */
export const pickUnique = <T>(entries: T[], count: number, seed: number): T[] => {
  const n = entries.length;
  if (n <= 0 || count <= 0) return [];
  
  const k = Math.min(n, count);
  const indices = Array.from({ length: n }, (_, i) => i);
  let currentSeed = seed | 0;
  
  for (let i = 0; i < k; i++) {
    currentSeed = (currentSeed * 1664525 + 1013904223) | 0; // LCG
    const j = i + (((currentSeed >>> 0) % (n - i)) | 0);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  return indices.slice(0, k).map(i => entries[i]);
};

/**
 * =============
 * ОТЛАДКА ТЕКСТУР (UI)
 * =============
 */

/** Вспомогательная функция: создаёт элемент с заданными стилями */
const _createStyledElement = (
  tag: string,
  styles: string,
  text?: string
): HTMLElement => {
  const el = document.createElement(tag);
  el.style.cssText = styles;
  if (text) el.textContent = text;
  return el;
};

/** Отображает текстуру в оверлее для отладки */
export const showTextureDebug = (
  texture: THREE.Texture,
  label?: string
): (() => void) => {
  // --- Определение размеров текстуры ---
  const img = (texture as any).image;
  const sourceData = (texture as any).source?.data;
  const texWidth = img?.width || sourceData?.width || 256;
  const texHeight = img?.height || sourceData?.height || 256;

  // --- Создание элементов UI ---
  const overlay = _createStyledElement("div", `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `);

  const container = _createStyledElement("div", `
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    background: rgba(18, 22, 34, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  `);

  if (label) {
    const title = _createStyledElement("div", `
      font-size: 14px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.88);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `, label);
    container.appendChild(title);
  }

  // --- Рендер текстуры во временный canvas ---
  const displayScale = Math.min(
    Math.min(texWidth, 800) / texWidth,
    Math.min(texHeight, 600) / texHeight
  );
  const canvasWidth = Math.floor(texWidth * displayScale);
  const canvasHeight = Math.floor(texHeight * displayScale);

  const tempRenderer = new THREE.WebGLRenderer({ 
    preserveDrawingBuffer: true, 
    antialias: false 
  });
  tempRenderer.setSize(canvasWidth, canvasHeight);
  tempRenderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ 
      map: texture,
      toneMapped: false 
    })
  );
  scene.add(plane);
  tempRenderer.render(scene, camera);

  // --- Основной canvas для отображения ---
  const canvas = _createStyledElement("canvas", `
    display: block;
    max-width: 100%;
    max-height: 70vh;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  `) as HTMLCanvasElement;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(tempRenderer.domElement, 0, 0);

  // --- Информация и кнопка закрытия ---
  const info = _createStyledElement("div", `
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 8px;
    text-align: center;
  `, `Размер: ${texWidth} × ${texHeight}px`);

  const closeBtn = _createStyledElement("button", `
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
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `, "✕") as HTMLButtonElement;

  closeBtn.onmouseenter = () => { closeBtn.style.background = "rgba(255, 255, 255, 0.2)"; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = "rgba(255, 255, 255, 0.1)"; };

  // --- Сборка и монтирование ---
  container.appendChild(closeBtn);
  container.appendChild(canvas);
  container.appendChild(info);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // --- Очистка ресурсов ---
  const cleanup = () => {
    document.body.removeChild(overlay);
    tempRenderer.dispose();
    plane.geometry.dispose();
    (plane.material as THREE.Material).dispose();
    document.removeEventListener("keydown", handleKeyDown);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };

  closeBtn.onclick = cleanup;
  overlay.onclick = (e) => e.target === overlay && cleanup();
  document.addEventListener("keydown", handleKeyDown);

  return cleanup;
};

/**
 * =============
 * АНИМАЦИЯ ПРОДУКТОВ (ШЕЙДЕРЫ + INSTANCING)
 * =============
 */

/** Создаёт шейдерный материал для анимированного продукта */
export const createAnimatedMaterial = (
  product: Product,
  bounds: { width: number; height: number }
): THREE.ShaderMaterial => {
  const baseMap = product.materials[0]?.map ?? null;
  
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      map: { value: baseMap },
      color: { value: new THREE.Color(0xffffff) },
      uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
    },
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
};

/** Обновляет время анимации в материале */
export const updateAnimationTime = (
  material: THREE.ShaderMaterial, 
  time: number
): void => {
  if (material.uniforms.uTime) {
    material.uniforms.uTime.value = time;
  }
};

/** Обёртка для обратной совместимости: обновление анимации по времени */
export const updateAnimation = updateAnimationTime;

/** Генерирует параметры анимации для каждого инстанса */
export const createAnimationAttributes = (
  count: number,
  seed: number,
  bounds: { width: number; height: number },
  startInstanceIndex = 0
) => {
  const rotationSpeed = new Float32Array(count);
  const rotationAxis = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const movementDirection = new Float32Array(count * 2);
  const movementSpeed = new Float32Array(count);
  const initialPosition = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const globalIdx = startInstanceIndex + i;
    const s = (seed + globalIdx * 31) | 0;
    const rand = (offset: number) => deterministicRandom(s + offset);

    // Вращение
    rotationSpeed[i] = 0.3 + rand(0) * 0.7;
    
    const ax = (rand(1) - 0.5) * 2;
    const ay = (rand(2) - 0.5) * 2;
    const az = (rand(3) - 0.5) * 2;
    const len = Math.hypot(ax, ay, az) || 1;
    rotationAxis.set([ax / len, ay / len, az / len], i * 3);
    
    phase[i] = rand(4) * Math.PI * 2;

    // Движение
    const angle = rand(5) * Math.PI * 2;
    movementDirection.set([Math.cos(angle), Math.sin(angle)], i * 2);
    movementSpeed[i] = 1.0 + rand(6) * 2.0;

    // Позиция (в центральной трети области)
    const visibleW = bounds.width / 3;
    const visibleH = bounds.height / 3;
    initialPosition.set([
      (rand(7) - 0.5) * visibleW,
      (rand(8) - 0.5) * visibleH,
      (rand(9) - 0.5) * 5 - 5 // Z: [-7.5, -2.5]
    ], i * 3);
  }

  return {
    rotationSpeed: new THREE.InstancedBufferAttribute(rotationSpeed, 1),
    rotationAxis: new THREE.InstancedBufferAttribute(rotationAxis, 3),
    phase: new THREE.InstancedBufferAttribute(phase, 1),
    movementDirection: new THREE.InstancedBufferAttribute(movementDirection, 2),
    movementSpeed: new THREE.InstancedBufferAttribute(movementSpeed, 1),
    initialPosition: new THREE.InstancedBufferAttribute(initialPosition, 3),
  };
};

/**
 * =============
 * УПРАВЛЕНИЕ INSTANCED-ОБЪЕКТАМИ
 * =============
 */

export type InstancedProduct = {
  mesh: THREE.InstancedMesh;
  count: number;
  product: Product;
};

/** Создаёт InstancedMesh для продукта */
export const createInstancedProduct = (
  product: Product, 
  count: number
): InstancedProduct => {
  const material = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(product.geometry, material, count);
  
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  
  return { mesh, count, product };
};

/** Устанавливает матрицу трансформации для инстанса */
export const setInstanceMatrix = (
  instanced: InstancedProduct,
  index: number,
  matrix: THREE.Matrix4
): void => {
  if (index < 0 || index >= instanced.count) {
    console.warn(`Индекс ${index} вне диапазона [0, ${instanced.count})`);
    return;
  }
  instanced.mesh.setMatrixAt(index, matrix);
};

/** Устанавливает позицию, масштаб и вращение для инстанса */
export const setInstanceTransform = (
  instanced: InstancedProduct,
  index: number,
  position: THREE.Vector3,
  scale?: number,
  rotation?: THREE.Euler
): void => {
  if (index < 0 || index >= instanced.count) {
    console.warn(`Индекс ${index} вне диапазона [0, ${instanced.count})`);
    return;
  }

  const finalScale = (scale ?? 1) * instanced.product.normalizedScale;
  const quat = rotation 
    ? new THREE.Quaternion().setFromEuler(rotation) 
    : new THREE.Quaternion();
  
  const matrix = new THREE.Matrix4().compose(
    position,
    quat,
    new THREE.Vector3(finalScale, finalScale, finalScale)
  );
  
  instanced.mesh.setMatrixAt(index, matrix);
};

/** Помечает матрицы инстансов как требующие обновления */
export const markInstancesDirty = (instanced: InstancedProduct): void => {
  instanced.mesh.instanceMatrix.needsUpdate = true;
};

/**
 * =============
 * НАСТРОЙКА РЕНДЕРА И СЦЕНЫ
 * =============
 */

export type RendererSettings = {
  alpha: boolean;
  antialias: boolean;
  depth: boolean;
  stencil: boolean;
  premultipliedAlpha: boolean;
  preserveDrawingBuffer: boolean;
  outputColorSpace: THREE.ColorSpace;
  autoClear: boolean;
};

const DEFAULT_RENDERER_SETTINGS: RendererSettings = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  outputColorSpace: THREE.SRGBColorSpace,
  autoClear: true,
};

/** Создаёт и настраивает WebGLRenderer */
export const createFruitsRenderer = (
  canvas: HTMLCanvasElement,
  settings: Partial<RendererSettings> = {}
): THREE.WebGLRenderer => {
  const config = { ...DEFAULT_RENDERER_SETTINGS, ...settings };
  
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: config.alpha,
    antialias: config.antialias,
    depth: config.depth,
    stencil: config.stencil,
    premultipliedAlpha: config.premultipliedAlpha,
    preserveDrawingBuffer: config.preserveDrawingBuffer,
  });
  
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = config.outputColorSpace;
  renderer.autoClear = config.autoClear;
  
  return renderer;
};

/** Обновляет размеры рендерера под текущий canvas */
export const resizeRenderer = (
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  getDpr: () => number
): { w: number; h: number; dpr: number } => {
  const rect = canvas.getBoundingClientRect();
  const dpr = getDpr();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  renderer.setSize(w, h, false);
  
  return { w, h, dpr };
};

/** Размещает одиночный продукт в сцене */
export const renderProduct = (
  scene: THREE.Scene,
  product: Product,
  options: RenderProductOptions = {}
): THREE.Mesh => {
  const material = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(product.geometry, material);
  
  if (options.position) mesh.position.copy(options.position);
  if (options.rotation) {
    mesh.rotation.set(
      options.rotation.x,
      options.rotation.y,
      options.rotation.z
    );
  }
  if (options.quaternion) mesh.quaternion.copy(options.quaternion);
  
  const scaleValue = (options.scale ?? 1) * product.normalizedScale;
  mesh.scale.set(scaleValue, scaleValue, scaleValue);
  
  scene.add(mesh);
  return mesh;
};

/** Создаёт сцену с заданным цветом фона */
export const createScene = (backgroundColor: string): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);
  return scene;
};

/** Настройки камеры */
export type CameraSetup = {
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
};

/** Создаёт и позиционирует камеру */
export const setupCamera = (
  width: number, 
  height: number, 
  fov = 50
): CameraSetup => {
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
  camera.position.set(0, 0, 25);
  camera.lookAt(0, 0, 0);
  return { camera, width, height };
};

/** Обновляет соотношение сторон камеры */
export const updateCameraAspect = (
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): void => {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

/** Обёртка для обратной совместимости: обновление размера/аспекта камеры */
export const updateCameraSize = updateCameraAspect;

/** Обёртка для обратной совместимости: детерминированный rand [0, 1) */
export const rand01 = (seed: number): number => deterministicRandom(seed);