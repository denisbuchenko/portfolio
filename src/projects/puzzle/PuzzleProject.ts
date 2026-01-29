import { createPuzzleModel } from "./model";
import { createPieceImage } from "./pieceImage";
import type { PieceGeometry } from "./path";
import { XorShift32 } from "./rng";
import type { PieceImage } from "./pieceImage";

type RuntimePiece = {
  img: PieceImage;
  id: number;
  groupId: number;
  /**
   * Позиция в мире в пикселях канваса: это top-left клетки (без pad).
   */
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  piece: RuntimePiece;
  groupId: number;
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

  const pieceById = new Map<number, RuntimePiece>();
  const groups = new Map<number, number[]>(); // groupId -> piece ids

  function initGroups(): void {
    groups.clear();
    pieceById.clear();
    for (const p of pieces) {
      pieceById.set(p.id, p);
      p.groupId = p.id;
      groups.set(p.groupId, [p.id]);
    }
  }

  function groupMembers(groupId: number): RuntimePiece[] {
    const ids = groups.get(groupId);
    if (!ids) return [];
    const out: RuntimePiece[] = [];
    for (const id of ids) {
      const p = pieceById.get(id);
      if (p) out.push(p);
    }
    return out;
  }

  function moveGroup(groupId: number, dx: number, dy: number): void {
    const ids = groups.get(groupId);
    if (!ids) return;
    for (const id of ids) {
      const p = pieceById.get(id);
      if (!p) continue;
      p.x += dx;
      p.y += dy;
    }
  }

  function mergeGroups(intoGroupId: number, fromGroupId: number): void {
    if (intoGroupId === fromGroupId) return;
    const a = groups.get(intoGroupId);
    const b = groups.get(fromGroupId);
    if (!a || !b) return;
    for (const id of b) {
      const p = pieceById.get(id);
      if (p) p.groupId = intoGroupId;
      a.push(id);
    }
    groups.delete(fromGroupId);
  }

  function bringGroupToFront(groupId: number): void {
    const groupIds = new Set(groups.get(groupId) ?? []);
    if (groupIds.size === 0) return;
    const back: RuntimePiece[] = [];
    const front: RuntimePiece[] = [];
    for (const p of pieces) {
      if (groupIds.has(p.id)) front.push(p);
      else back.push(p);
    }
    pieces = back.concat(front);
  }

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
      statusEl.textContent = `Кусочков: ${pieces.length} • Групп: ${groups.size} • DPR: ${dpr.toFixed(2)}`;
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

  function snapThresholdPx(g: PieceGeometry): number {
    return Math.max(10 * getDpr(), g.cellPx * 0.12);
  }

  function trySnapGroupOnce(groupId: number): { mergedInto: number } | null {
    if (!geom) return null;
    const cell = geom.cellPx;
    const thr = snapThresholdPx(geom);

    let best:
      | {
          score: number;
          dx: number;
          dy: number;
          targetGroupId: number;
        }
      | undefined;

    const members = groupMembers(groupId);
    for (const p of members) {
      const n = p.img.piece.neighbors;
      const neighborChecks: Array<{ neighborId: number | null; offX: number; offY: number }> = [
        { neighborId: n.top, offX: 0, offY: -cell },
        { neighborId: n.right, offX: +cell, offY: 0 },
        { neighborId: n.bottom, offX: 0, offY: +cell },
        { neighborId: n.left, offX: -cell, offY: 0 }
      ];

      for (const c of neighborChecks) {
        if (c.neighborId == null) continue;
        const neighborPiece = pieceById.get(c.neighborId);
        if (!neighborPiece) continue;
        if (neighborPiece.groupId === groupId) continue;

        const dx = neighborPiece.x - (p.x + c.offX);
        const dy = neighborPiece.y - (p.y + c.offY);
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > thr || ady > thr) continue;
        const score = Math.hypot(dx, dy);
        if (!best || score < best.score) {
          best = {
            score,
            dx,
            dy,
            targetGroupId: neighborPiece.groupId
          };
        }
      }
    }

    if (!best) return null;

    // Дотягиваем текущую (перетаскиваемую) группу к стоящей на месте группе.
    moveGroup(groupId, best.dx, best.dy);

    // Немного стабилизируем координаты после снэпа, чтобы не копилась дробь.
    for (const p of groupMembers(groupId)) {
      p.x = Math.round(p.x);
      p.y = Math.round(p.y);
    }

    mergeGroups(best.targetGroupId, groupId);
    bringGroupToFront(best.targetGroupId);
    return { mergedInto: best.targetGroupId };
  }

  function onPointerDown(e: PointerEvent): void {
    if (!geom) return;
    if (drag) return;
    const { x, y } = canvasPointFromEvent(e);

    for (let i = pieces.length - 1; i >= 0; i--) {
      const rp = pieces[i];
      if (hitTestPiece(rp, x, y)) {
        bringGroupToFront(rp.groupId);
        drag = {
          pointerId: e.pointerId,
          piece: rp,
          groupId: rp.groupId,
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
    const newX = x - drag.offsetX;
    const newY = y - drag.offsetY;
    const dx = newX - drag.piece.x;
    const dy = newY - drag.piece.y;
    moveGroup(drag.groupId, dx, dy);
  }

  function onPointerUpOrCancel(e: PointerEvent): void {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;
    const releasedGroupId = drag.groupId;
    drag = null;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // После отпускания пробуем пристыковать группу: можно "цеплять" несколько раз подряд.
    let currentGroupId = releasedGroupId;
    for (let i = 0; i < 12; i++) {
      const res = trySnapGroupOnce(currentGroupId);
      if (!res) break;
      currentGroupId = res.mergedInto;
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

    pieces = imgs.map((img) => ({ img, id: img.piece.id, groupId: img.piece.id, x: 0, y: 0 }));
    scramblePieces(w, h, g);
    initGroups();
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


