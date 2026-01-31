import * as THREE from "three";

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
export function createFruitsRenderer(canvas: HTMLCanvasElement, settings: Partial<RendererSettings> = {}): THREE.WebGLRenderer {
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
