import { createPuzzleModel } from "./model";
import { createPieceImage } from "./pieceImage";
import type { PieceGeometry } from "./path";
import { XorShift32 } from "./rng";
import type { PieceImage } from "./pieceImage";

type RuntimePiece = {
  img: PieceImage;
  /**
   * Позиция в мире в пикселях канваса: это top-left клетки (без pad).
   */
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  piece: RuntimePiece;
  offsetX: number;
  offsetY: number;
} | null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function getDpr(): number {
  return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
}

export function mountPuzzleProject(host: HTMLElement): void {
  host.classList.add("launcher--puzzle");
  host.innerHTML = `
    <div class="puzzle">
      <canvas class="puzzle__canvas"></canvas>
      <div class="puzzle__panel">
        <div class="puzzle__title">Пазл 4×4</div>
        <div class="puzzle__hint">Перетаскивай кусочки мышкой или пальцем.</div>
      </div>
      <div class="puzzle__status" id="puzzle-status">Загрузка...</div>
    </div>
  `;

  const canvas = host.querySelector("canvas.puzzle__canvas") as HTMLCanvasElement | null;
  const status = host.querySelector("#puzzle-status") as HTMLDivElement | null;
  if (!canvas) throw new Error("Puzzle canvas not found");
  if (!status) throw new Error("Puzzle status not found");

  // Важно: TS не сохраняет narrowing внутрь вложенных функций для переменных типа T|null,
  // поэтому сразу фиксируем non-null ссылки в отдельных const.
  const canvasEl: HTMLCanvasElement = canvas;
  const statusEl: HTMLDivElement = status;

  const ctx = canvasEl.getContext("2d");
  if (!ctx) throw new Error("2D context not available");
  const ctx2: CanvasRenderingContext2D = ctx;

  // Отдельный контекст для hit-test’ов по Path2D (transform = identity).
  const hitCanvas = document.createElement("canvas");
  hitCanvas.width = 2;
  hitCanvas.height = 2;
  const hitCtx = hitCanvas.getContext("2d");
  if (!hitCtx) throw new Error("2D hit context not available");
  const hitCtx2: CanvasRenderingContext2D = hitCtx;

  const rng = new XorShift32(0x0ddba11);

  let sourceImg: HTMLImageElement | null = null;
  let pieces: RuntimePiece[] = [];
  let geom: PieceGeometry | null = null;
  let drag: DragState = null;
  let rafId = 0;

  function resizeCanvas(): { w: number; h: number; dpr: number } {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
    return { w, h, dpr };
  }

  function pickGeometry(viewW: number, viewH: number, dpr: number): PieceGeometry {
    const minCss = Math.min(viewW / dpr, viewH / dpr);
    const puzzleCss = Math.max(320, minCss * 0.72);
    const cellCss = puzzleCss / 4;
    const cellPx = Math.max(48, Math.floor(cellCss * dpr));
    const tabPx = cellPx * 0.22;
    const padPx = tabPx * 1.3;
    return { cellPx, tabPx, padPx };
  }

  function scramblePieces(viewW: number, viewH: number, g: PieceGeometry): void {
    const cell = g.cellPx;
    const pad = g.padPx;
    const ext = cell + pad * 2;
    const margin = Math.max(16 * getDpr(), pad);

    for (const p of pieces) {
      const xMin = margin;
      const xMax = Math.max(xMin, viewW - ext - margin);
      const yMin = margin;
      const yMax = Math.max(yMin, viewH - ext - margin);
      // x,y — top-left клетки, поэтому добавляем pad.
      const drawX = rng.range(xMin, xMax);
      const drawY = rng.range(yMin, yMax);
      p.x = drawX + pad;
      p.y = drawY + pad;
    }
  }

  function render(): void {
    rafId = window.requestAnimationFrame(render);

    const dpr = getDpr();
    const w = canvasEl.width;
    const h = canvasEl.height;
    ctx2.setTransform(1, 0, 0, 1, 0, 0);

    // фон
    ctx2.clearRect(0, 0, w, h);
    ctx2.fillStyle = "rgba(0,0,0,0.15)";
    ctx2.fillRect(0, 0, w, h);

    // кусочки (в порядке массива — последний сверху)
    for (const rp of pieces) {
      const pad = rp.img.geom.padPx;
      const dx = rp.x - pad;
      const dy = rp.y - pad;
      ctx2.drawImage(rp.img.bitmap, dx, dy);
    }

    // небольшой статус
    if (geom) {
      statusEl.textContent = `Кусочков: ${pieces.length} • DPR: ${dpr.toFixed(2)}`;
    }
  }

  function canvasPointFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = getDpr();
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr
    };
  }

  function hitTestPiece(rp: RuntimePiece, x: number, y: number): boolean {
    const pad = rp.img.geom.padPx;
    const localX = x - (rp.x - pad);
    const localY = y - (rp.y - pad);
    if (localX < 0 || localY < 0) return false;
    const w = rp.img.bitmap.width;
    const h = rp.img.bitmap.height;
    if (localX > w || localY > h) return false;
    return hitCtx2.isPointInPath(rp.img.path, localX, localY);
  }

  function bringToFront(rp: RuntimePiece): void {
    const i = pieces.indexOf(rp);
    if (i < 0) return;
    pieces.splice(i, 1);
    pieces.push(rp);
  }

  function onPointerDown(e: PointerEvent): void {
    if (!geom) return;
    if (drag) return;
    const { x, y } = canvasPointFromEvent(e);

    for (let i = pieces.length - 1; i >= 0; i--) {
      const rp = pieces[i];
      if (hitTestPiece(rp, x, y)) {
        bringToFront(rp);
        drag = {
          pointerId: e.pointerId,
          piece: rp,
          offsetX: x - rp.x,
          offsetY: y - rp.y
        };
        canvasEl.setPointerCapture(e.pointerId);
        return;
      }
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;
    const { x, y } = canvasPointFromEvent(e);
    drag.piece.x = x - drag.offsetX;
    drag.piece.y = y - drag.offsetY;
  }

  function onPointerUpOrCancel(e: PointerEvent): void {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;
    drag = null;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", onPointerUpOrCancel);
  canvasEl.addEventListener("pointercancel", onPointerUpOrCancel);

  let rebuildToken = 0;
  async function rebuild(): Promise<void> {
    const token = ++rebuildToken;
    const { w, h, dpr } = resizeCanvas();
    if (!sourceImg) return;

    const g = pickGeometry(w, h, dpr);
    geom = g;

    const model = createPuzzleModel({
      rows: 4,
      cols: 4,
      imgW: sourceImg.naturalWidth || sourceImg.width,
      imgH: sourceImg.naturalHeight || sourceImg.height,
      seed: 0x1eafc0de
    });

    const imgs = await Promise.all(model.pieces.map((piece) => createPieceImage({ model, piece, geom: g, source: sourceImg! })));
    if (token !== rebuildToken) return;

    pieces = imgs.map((img) => ({ img, x: 0, y: 0 }));
    scramblePieces(w, h, g);
    statusEl.textContent = "Готово";
  }

  // старт
  (async () => {
    try {
      sourceImg = await loadImage("/img-lol.jpg");
      await rebuild();
      if (!rafId) rafId = window.requestAnimationFrame(render);
      statusEl.classList.add("puzzle__status--ready");
    } catch (e) {
      statusEl.textContent = e instanceof Error ? e.message : String(e);
    }
  })();

  // resize debounce
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      void rebuild();
    });
  });
}


