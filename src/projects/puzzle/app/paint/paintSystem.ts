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

function strokeForColor(color: ColorKey): string {
  if (color === "r") return "rgba(255,0,0,1)";
  if (color === "g") return "rgba(0,255,0,1)";
  return "rgba(0,0,255,1)";
}

export function createPaintSystem(opts: {
  config: typeof CONFIG;
  getDpr: typeof getDprFn;
  onRedraw?: () => void;
}): PaintSystem {
  const { config, getDpr } = opts;

  const paintCanvas = document.createElement("canvas");
  paintCanvas.width = 2;
  paintCanvas.height = 2;
  const paintCtx = paintCanvas.getContext("2d");
  if (!paintCtx) throw new Error("2D paint context not available");
  const paintCtx2: CanvasRenderingContext2D = paintCtx;

  // Downsample для быстрых CPU hit-test’ов/ограничения перемещения по маске.
  const maskSampleCanvas = document.createElement("canvas");
  maskSampleCanvas.width = 256;
  maskSampleCanvas.height = 256;
  const maskSampleCtx = maskSampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskSampleCtx) throw new Error("2D mask sample context not available");
  const maskSampleCtx2: CanvasRenderingContext2D = maskSampleCtx;

  let maskSampleData: ImageData | null = null;

  const trails: Record<ColorKey, Trail> = {
    r: { points: [], lengthPx: 0 },
    g: { points: [], lengthPx: 0 },
    b: { points: [], lengthPx: 0 }
  };

  function trailMaxLenPx(): number {
    return config.puzzle.paint.maxTrailLengthCssPx * getDpr();
  }

  function redraw(): void {
    const w = paintCanvas.width;
    const h = paintCanvas.height;
    paintCtx2.setTransform(1, 0, 0, 1, 0, 0);
    paintCtx2.clearRect(0, 0, w, h);

    paintCtx2.globalCompositeOperation = "lighter";
    paintCtx2.lineCap = "round";
    paintCtx2.lineJoin = "round";
    paintCtx2.imageSmoothingEnabled = true;
    paintCtx2.lineWidth = Math.max(1, config.puzzle.paint.brushSizeCssPx * getDpr());

    const order: ColorKey[] = ["r", "g", "b"];
    for (const c of order) {
      const pts = trails[c].points;
      if (pts.length < 2) continue;
      paintCtx2.strokeStyle = strokeForColor(c);
      paintCtx2.beginPath();
      paintCtx2.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) paintCtx2.lineTo(pts[i].x, pts[i].y);
      paintCtx2.stroke();
    }
    paintCtx2.globalCompositeOperation = "source-over";

    // обновляем downsample буфер
    maskSampleCtx2.setTransform(1, 0, 0, 1, 0, 0);
    maskSampleCtx2.clearRect(0, 0, maskSampleCanvas.width, maskSampleCanvas.height);
    maskSampleCtx2.drawImage(paintCanvas, 0, 0, maskSampleCanvas.width, maskSampleCanvas.height);
    maskSampleData = maskSampleCtx2.getImageData(0, 0, maskSampleCanvas.width, maskSampleCanvas.height);

    opts.onRedraw?.();
  }

  function addPoint(color: ColorKey, x: number, y: number): void {
    const t = trails[color];
    const pts = t.points;
    const maxLen = trailMaxLenPx();

    if (pts.length === 0) {
      pts.push({ x, y });
      t.lengthPx = 0;
      redraw();
      return;
    }

    const last = pts[pts.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5 * getDpr()) return;

    pts.push({ x, y });
    t.lengthPx += dist;

    while (t.lengthPx > maxLen && pts.length > 1) {
      const a = pts[0];
      const b = pts[1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      pts.shift();
      t.lengthPx -= seg;
    }

    redraw();
  }

  function clear(): void {
    for (const k of ["r", "g", "b"] as const) {
      trails[k].points = [];
      trails[k].lengthPx = 0;
    }
    redraw();
  }

  function resize(w: number, h: number): void {
    paintCanvas.width = Math.max(1, w);
    paintCanvas.height = Math.max(1, h);
    redraw();
  }

  function maskBitsAt(x: number, y: number, viewW: number, viewH: number): number {
    if (!maskSampleData) return 0;
    const sw = maskSampleCanvas.width;
    const sh = maskSampleCanvas.height;
    const sx = Math.max(0, Math.min(sw - 1, Math.floor((x / Math.max(1, viewW)) * sw)));
    const sy = Math.max(0, Math.min(sh - 1, Math.floor((y / Math.max(1, viewH)) * sh)));
    const idx = (sy * sw + sx) * 4;
    const d = maskSampleData.data;
    const thr = 12; // 0..255
    let bits = 0;
    if (d[idx + 0] > thr) bits |= 1;
    if (d[idx + 1] > thr) bits |= 2;
    if (d[idx + 2] > thr) bits |= 4;
    return bits;
  }

  return { paintCanvas, resize, clear, addPoint, maskBitsAt };
}


