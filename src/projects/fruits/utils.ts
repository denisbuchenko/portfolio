import * as THREE from "three";
import type { Product, RenderProductOptions } from "./types";
import vertexShader from "./shaders/animatedProduct.vert.glsl?raw";
import fragmentShader from "./shaders/animatedProduct.frag.glsl?raw";

// ======================
// КОНСТАНТЫ И ТИПЫ
// ======================

const EPSILON = 1e-6;
const DEFAULT_COLOR = 0xffffff;
const DEBUG_UI_Z_INDEX = 9999;
const MAX_DEBUG_SIZE = { width: 800, height: 600 };
const ANIMATION_BOUNDS_SCALE = 1 / 3;
const Z_MIN = -7.5;
const Z_MAX = -2.5;

// ======================
// БАЗОВЫЕ УТИЛИТЫ
// ======================

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const normalizeVector2 = (v: THREE.Vector2): THREE.Vector2 =>
  v.length() < EPSILON ? new THREE.Vector2(1, 0) : v.clone().normalize();

// Единый детерминированный ГСЧ (xorshift) для всего модуля
const deterministicRandom = (seed: number): number => {
  let x = seed ^ (seed >>> 15);
  x = Math.imul(x, 0x46d31bad);
  x ^= x >>> 14;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 15;
  return (x >>> 0) / 0x1_0000_0000;
};

export const hexToRgb8 = (hex: string) => {
  const c = new THREE.Color(hex);
  return {
    r: Math.round(clamp(c.r, 0, 1) * 255),
    g: Math.round(clamp(c.g, 0, 1) * 255),
    b: Math.round(clamp(c.b, 0, 1) * 255),
  };
};

// ======================
// ТЕКСТУРЫ И МАТЕРИАЛЫ
// ======================

const configureTexture = <T extends THREE.Texture>(texture: T): T => {
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};

export const createSolidTexture = (hex: string): THREE.DataTexture => {
  const { r, g, b } = hexToRgb8(hex);
  const data = new Uint8Array([r, g, b, 255]);
  return configureTexture(new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat));
};

export const configureBackgroundMaterial = (mat: THREE.MeshBasicMaterial): void => {
  Object.assign(mat, {
    toneMapped: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
};

// ======================
// ФИЛЬТРАЦИЯ И ВЫБОР
// ======================

export const filterCatalogEntries = <T extends { name: string }>(
  entries: T[],
  include?: string[],
  exclude?: string[]
): T[] => {
  const inc = new Set(include?.filter(Boolean) ?? []);
  const exc = new Set(exclude?.filter(Boolean) ?? []);
  
  if (inc.size) return entries.filter(e => inc.has(e.name));
  if (exc.size) return entries.filter(e => !exc.has(e.name));
  return entries;
};

// Единый ГСЧ для согласованности
export const pickUnique = <T>(entries: T[], count: number, seed: number): T[] => {
  if (entries.length === 0 || count <= 0) return [];
  const k = Math.min(entries.length, count);
  const indices = Array.from({ length: entries.length }, (_, i) => i);
  let s = seed | 0;

  for (let i = 0; i < k; i++) {
    s = (s * 1664525 + 1013904223) | 0;
    const j = i + (((s >>> 0) % (entries.length - i)) | 0);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, k).map(i => entries[i]);
};

// ======================
// ОТЛАДКА ТЕКСТУР (УПРОЩЕНО)
// ======================

const createDebugElement = (tag: string, styles: string, text?: string): HTMLElement => {
  const el = document.createElement(tag);
  el.style.cssText = styles;
  if (text) el.textContent = text;
  return el;
};

export const showTextureDebug = (texture: THREE.Texture, label?: string): (() => void) => {
  // Получаем размеры текстуры безопасно
  const img = (texture.image as HTMLImageElement | HTMLCanvasElement | undefined);
  const source = (texture.source?.data as { width?: number; height?: number } | undefined);
  const w = img?.width ?? source?.width ?? 256;
  const h = img?.height ?? source?.height ?? 256;

  // Масштабируем под экран
  const scale = Math.min(
    Math.min(w, MAX_DEBUG_SIZE.width) / w,
    Math.min(h, MAX_DEBUG_SIZE.height) / h
  );
  const canvasW = Math.floor(w * scale);
  const canvasH = Math.floor(h * scale);

  // Рендерим текстуру во временный канвас
  const tempRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false });
  tempRenderer.setSize(canvasW, canvasH);
  tempRenderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  scene.add(plane);
  tempRenderer.render(scene, cam);

  // Создаём отладочный UI
  const overlay = createDebugElement("div", `
    position: fixed; inset: 0; z-index: ${DEBUG_UI_Z_INDEX};
    background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
    padding: 20px; box-sizing: border-box;
  `);

  const container = createDebugElement("div", `
    position: relative; max-width: 90vw; max-height: 90vh;
    background: rgba(18,22,34,0.95); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `);

  if (label) {
    container.appendChild(createDebugElement("div", `
      font-size: 14px; font-weight: bold; color: rgba(255,255,255,0.88);
      margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);
    `, label));
  }

  const canvas = createDebugElement("canvas", `
    display: block; max-width: 100%; max-height: 70vh;
    border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
  `) as HTMLCanvasElement;
  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.getContext("2d")?.drawImage(tempRenderer.domElement, 0, 0);

  container.appendChild(canvas);
  container.appendChild(createDebugElement("div", `
    font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 8px; text-align: center;
  `, `Размер: ${w} × ${h}px`));

  const closeBtn = createDebugElement("button", `
    position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
    border: none; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.88);
    border-radius: 4px; cursor: pointer; font-size: 18px; display: flex;
    align-items: center; justify-content: center; transition: background 0.2s;
  `, "✕") as HTMLButtonElement;
  
  closeBtn.onmouseenter = () => closeBtn.style.background = "rgba(255,255,255,0.2)";
  closeBtn.onmouseleave = () => closeBtn.style.background = "rgba(255,255,255,0.1)";
  container.appendChild(closeBtn);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Очистка ресурсов
  const cleanup = () => {
    document.body.removeChild(overlay);
    tempRenderer.dispose();
    plane.geometry.dispose();
    (plane.material as THREE.Material).dispose();
    document.removeEventListener("keydown", handleKey);
  };

  const handleKey = (e: KeyboardEvent) => e.key === "Escape" && cleanup();
  closeBtn.onclick = cleanup;
  overlay.onclick = e => e.target === overlay && cleanup();
  document.addEventListener("keydown", handleKey);

  return cleanup;
};

// ======================
// АНИМАЦИЯ И ИНСТАНСЫ
// ======================

export const createAnimatedMaterial = (
  product: Product,
  bounds: { width: number; height: number }
): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    map: { value: product.materials[0]?.map ?? null },
    color: { value: new THREE.Color(DEFAULT_COLOR) },
    uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
  },
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
});

export const updateAnimationTime = (mat: THREE.ShaderMaterial, time: number): void => {
  if ("uTime" in mat.uniforms) mat.uniforms.uTime.value = time;
};
export const updateAnimation = updateAnimationTime; // BC

const createInstancedAttr = (array: Float32Array, itemSize: number) =>
  new THREE.InstancedBufferAttribute(array, itemSize);

export const createAnimationAttributes = (
  count: number,
  seed: number,
  bounds: { width: number; height: number },
  startIdx = 0
) => {
  const rs = new Float32Array(count);
  const ra = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  const md = new Float32Array(count * 2);
  const ms = new Float32Array(count);
  const ip = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const s = (seed + idx * 31) | 0;
    const rand = (o: number) => deterministicRandom(s + o);

    // Вращение
    rs[i] = 0.3 + rand(0) * 0.7;
    const ax = (rand(1) - 0.5) * 2;
    const ay = (rand(2) - 0.5) * 2;
    const az = (rand(3) - 0.5) * 2;
    const len = Math.hypot(ax, ay, az) || 1;
    ra.set([ax / len, ay / len, az / len], i * 3);
    ph[i] = rand(4) * Math.PI * 2;

    // Движение
    const ang = rand(5) * Math.PI * 2;
    md.set([Math.cos(ang), Math.sin(ang)], i * 2);
    ms[i] = 1.0 + rand(6) * 2.0;

    // Позиция (центральная треть)
    const vw = bounds.width * ANIMATION_BOUNDS_SCALE;
    const vh = bounds.height * ANIMATION_BOUNDS_SCALE;
    ip.set([
      (rand(7) - 0.5) * vw,
      (rand(8) - 0.5) * vh,
      (rand(9) - 0.5) * (Z_MAX - Z_MIN) + Z_MIN
    ], i * 3);
  }

  return {
    rotationSpeed: createInstancedAttr(rs, 1),
    rotationAxis: createInstancedAttr(ra, 3),
    phase: createInstancedAttr(ph, 1),
    movementDirection: createInstancedAttr(md, 2),
    movementSpeed: createInstancedAttr(ms, 1),
    initialPosition: createInstancedAttr(ip, 3),
  };
};

// ======================
// УПРАВЛЕНИЕ ИНСТАНСАМИ
// ======================

export type InstancedProduct = { mesh: THREE.InstancedMesh; count: number; product: Product };

export const createInstancedProduct = (product: Product, count: number): InstancedProduct => {
  const mat = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR });
  const mesh = new THREE.InstancedMesh(product.geometry, mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, count, product };
};

const warnOutOfBounds = (idx: number, max: number) =>
  console.warn(`Индекс ${idx} вне диапазона [0, ${max})`);

export const setInstanceMatrix = (inst: InstancedProduct, idx: number, m: THREE.Matrix4): void => {
  if (idx < 0 || idx >= inst.count) return warnOutOfBounds(idx, inst.count);
  inst.mesh.setMatrixAt(idx, m);
};

export const setInstanceTransform = (
  inst: InstancedProduct,
  idx: number,
  pos: THREE.Vector3,
  scale?: number,
  rot?: THREE.Euler
): void => {
  if (idx < 0 || idx >= inst.count) return warnOutOfBounds(idx, inst.count);
  
  const s = (scale ?? 1) * inst.product.normalizedScale;
  const quat = rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion();
  const mat = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(s, s, s));
  
  inst.mesh.setMatrixAt(idx, mat);
};

export const markInstancesDirty = (inst: InstancedProduct): void => {
  inst.mesh.instanceMatrix.needsUpdate = true;
};

// ======================
// РЕНДЕР И СЦЕНА
// ======================

const DEFAULT_RENDERER_CFG: ConstructorParameters<typeof THREE.WebGLRenderer>[0] = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
};

export const createFruitsRenderer = (
  canvas: HTMLCanvasElement,
  settings: (Partial<typeof DEFAULT_RENDERER_CFG> & { autoClear?: boolean }) = {}
): THREE.WebGLRenderer => {
  const renderer = new THREE.WebGLRenderer({ ...DEFAULT_RENDERER_CFG, ...settings, canvas });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = settings.autoClear ?? true;
  return renderer;
};

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

export const renderProduct = (
  scene: THREE.Scene,
  product: Product,
  opts: RenderProductOptions = {}
): THREE.Mesh => {
  const mat = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR });
  const mesh = new THREE.Mesh(product.geometry, mat);
  
  if (opts.position) mesh.position.copy(opts.position);
  if (opts.rotation) mesh.rotation.set(opts.rotation.x, opts.rotation.y, opts.rotation.z);
  if (opts.quaternion) mesh.quaternion.copy(opts.quaternion);
  
  const s = (opts.scale ?? 1) * product.normalizedScale;
  mesh.scale.set(s, s, s);
  
  scene.add(mesh);
  return mesh;
};

export const createScene = (bgColor: string): THREE.Scene => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  return scene;
};

export type CameraSetup = { camera: THREE.PerspectiveCamera; width: number; height: number };

export const setupCamera = (w: number, h: number, fov = 50): CameraSetup => {
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
  cam.position.set(0, 0, 25);
  cam.lookAt(0, 0, 0);
  return { camera: cam, width: w, height: h };
};

export const updateCameraAspect = (cam: THREE.PerspectiveCamera, w: number, h: number): void => {
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
};
export const updateCameraSize = updateCameraAspect; // BC

// ======================
// СОВМЕСТИМОСТЬ
// ======================

export const rand01 = deterministicRandom; // BC alias