import type { ColorKey, Trail } from "../runtimeTypes";
import { CONFIG } from "../../../../config";
import type { getDpr as getDprFn } from "../utils";

export type PaintSystem = {
  paintCanvas: HTMLCanvasElement;
  resize(w: number, h: number): void;
  clear(): void;
  addPoint(color: ColorKey, x: number, y: number): void;
  maskBitsAt(x: number, y: number, viewW: number, viewH: number): number;
};

const STROKE_COLORS: Record<ColorKey, string> = {
  r: "rgba(255,0,0,1)",
  g: "rgba(0,255,0,1)",
  b: "rgba(0,0,255,1)",
};

const MASK_BRIGHTNESS_THRESHOLD = 12;
const MASK_CANVAS_SIZE = 256;

// ============ Основная фабрика ============

export function createPaintSystem(opts: {
  config: typeof CONFIG;
  getDpr: typeof getDprFn;
  onRedraw?: () => void;
}): PaintSystem {
  const { config, getDpr } = opts;

  // Инициализация холстов
  const paintCanvas = document.createElement("canvas");
  paintCanvas.width = 2;
  paintCanvas.height = 2;
  const paintCtx = paintCanvas.getContext("2d");
  if (!paintCtx) throw new Error("2D paint context not available");

  const maskSampleCanvas = document.createElement("canvas");
  maskSampleCanvas.width = MASK_CANVAS_SIZE;
  maskSampleCanvas.height = MASK_CANVAS_SIZE;
  const maskSampleCtx = maskSampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskSampleCtx) throw new Error("2D mask sample context not available");

  // Состояние
  let maskSampleData: ImageData | null = null;
  const trails: Record<ColorKey, Trail> = {
    r: { points: [], lengthPx: 0 },
    g: { points: [], lengthPx: 0 },
    b: { points: [], lengthPx: 0 },
  };

  // Перерисовка
  function redraw(): void {
    drawTrails(paintCtx!, trails, config, getDpr);
    maskSampleData = updateMaskSample(maskSampleCtx!, paintCanvas);
    opts.onRedraw?.();
  }

  // Публичные методы
  function addPoint(color: ColorKey, x: number, y: number): void {
    const maxLength = getMaxTrailLengthPx(config, getDpr);
    const changed = addPointToTrail(trails[color], x, y, maxLength, getDpr());
    if (changed) redraw();
  }

  function clear(): void {
    clearAllTrails(trails);
    redraw();
  }

  function resize(w: number, h: number): void {
    paintCanvas.width = Math.max(1, w);
    paintCanvas.height = Math.max(1, h);
    redraw();
  }

  function maskBitsAt(x: number, y: number, viewW: number, viewH: number): number {
    if (!maskSampleData) return 0;
    return readMaskBits(maskSampleData, x, y, viewW, viewH);
  }

  return { paintCanvas, resize, clear, addPoint, maskBitsAt };
}

// ============ Вспомогательные функции ============

function getMaxTrailLengthPx(config: typeof CONFIG, getDpr: typeof getDprFn): number {
  return config.puzzle.paint.maxTrailLengthCssPx * getDpr();
}

function trimTrail(trail: Trail, maxLength: number): void {
  while (trail.lengthPx > maxLength && trail.points.length > 1) {
    const [a, b] = trail.points;
    const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
    trail.points.shift();
    trail.lengthPx -= segmentLength;
  }
}

function drawTrails(
  paintCtx: CanvasRenderingContext2D,
  trails: Record<ColorKey, Trail>,
  config: typeof CONFIG,
  getDpr: typeof getDprFn
): void {
  const { width: w, height: h } = paintCtx.canvas;
  paintCtx.setTransform(1, 0, 0, 1, 0, 0);
  paintCtx.clearRect(0, 0, w, h);

  paintCtx.globalCompositeOperation = "lighter";
  paintCtx.lineCap = "round";
  paintCtx.lineJoin = "round";
  paintCtx.imageSmoothingEnabled = true;
  paintCtx.lineWidth = Math.max(1, config.puzzle.paint.brushSizeCssPx * getDpr());

  for (const color of ["r", "g", "b"] as ColorKey[]) {
    const { points } = trails[color];
    if (points.length < 2) continue;

    paintCtx.strokeStyle = STROKE_COLORS[color];
    paintCtx.beginPath();
    paintCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      paintCtx.lineTo(points[i].x, points[i].y);
    }
    paintCtx.stroke();
  }

  paintCtx.globalCompositeOperation = "source-over";
}

function updateMaskSample(
  maskSampleCtx: CanvasRenderingContext2D,
  paintCanvas: HTMLCanvasElement
): ImageData {
  maskSampleCtx.setTransform(1, 0, 0, 1, 0, 0);
  maskSampleCtx.clearRect(0, 0, MASK_CANVAS_SIZE, MASK_CANVAS_SIZE);
  maskSampleCtx.drawImage(paintCanvas, 0, 0, MASK_CANVAS_SIZE, MASK_CANVAS_SIZE);
  return maskSampleCtx.getImageData(0, 0, MASK_CANVAS_SIZE, MASK_CANVAS_SIZE);
}

function addPointToTrail(
  trail: Trail,
  x: number,
  y: number,
  maxLength: number,
  dpr: number
): boolean {
  if (trail.points.length === 0) {
    trail.points.push({ x, y });
    trail.lengthPx = 0;
    return true;
  }

  const last = trail.points[trail.points.length - 1];
  const dist = Math.hypot(x - last.x, y - last.y);
  
  if (dist < 0.5 * dpr) return false;

  trail.points.push({ x, y });
  trail.lengthPx += dist;
  trimTrail(trail, maxLength);
  return true;
}

function clearAllTrails(trails: Record<ColorKey, Trail>): void {
  for (const color of ["r", "g", "b"] as const) {
    trails[color].points = [];
    trails[color].lengthPx = 0;
  }
}

function readMaskBits(
  maskSampleData: ImageData,
  x: number,
  y: number,
  viewW: number,
  viewH: number
): number {
  const sx = Math.floor((x / Math.max(1, viewW)) * MASK_CANVAS_SIZE);
  const sy = Math.floor((y / Math.max(1, viewH)) * MASK_CANVAS_SIZE);
  const clampedX = Math.max(0, Math.min(MASK_CANVAS_SIZE - 1, sx));
  const clampedY = Math.max(0, Math.min(MASK_CANVAS_SIZE - 1, sy));

  const idx = (clampedY * MASK_CANVAS_SIZE + clampedX) * 4;
  const [r, g, b] = maskSampleData.data.slice(idx, idx + 3);

  let bits = 0;
  if (r > MASK_BRIGHTNESS_THRESHOLD) bits |= 1;
  if (g > MASK_BRIGHTNESS_THRESHOLD) bits |= 2;
  if (b > MASK_BRIGHTNESS_THRESHOLD) bits |= 4;
  return bits;
}
