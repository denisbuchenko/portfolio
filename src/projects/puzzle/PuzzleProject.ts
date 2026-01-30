import type { PieceGeometry } from "./path";
import { XorShift32 } from "./rng";
import { CONFIG } from "../../config";

import puzzleVert from "../../shaders/puzzleTextured.vert.glsl?raw";
import puzzlePaintFrag from "../../shaders/puzzlePaint.frag.glsl?raw";
import puzzlePieceMaskFrag from "../../shaders/puzzlePieceMask.frag.glsl?raw";

import type { DragState, DrawState, RuntimePiece } from "./app/runtimeTypes";
import { mountPuzzleUI } from "./app/ui/puzzleUI";
import { createPaintSystem } from "./app/paint/paintSystem";
import { createGroupSystem } from "./app/groups/groupSystem";
import { trySnapGroupOnce } from "./app/groups/snapper";
import { createPuzzleRenderer } from "./app/render/puzzleRenderer";
import { buildPieces, pickGeometry, scramblePieces } from "./app/build/buildPieces";
import { getDpr, loadImage } from "./app/utils";

export function mountPuzzleProject(host: HTMLElement): void {
  const ui = mountPuzzleUI({ host, config: CONFIG });
  const canvasEl = ui.canvas;
  const statusEl = ui.statusEl;

  // Отдельный контекст для hit-test’ов по Path2D (transform = identity).
  const hitCanvas = document.createElement("canvas");
  hitCanvas.width = 2;
  hitCanvas.height = 2;
  const hitCtx = hitCanvas.getContext("2d");
  if (!hitCtx) throw new Error("2D hit context not available");
  const hitCtx2: CanvasRenderingContext2D = hitCtx;

  const rng = new XorShift32(0x0ddba11);

  const groupSys = createGroupSystem();

  let geom: PieceGeometry | null = null;
  let pieces: RuntimePiece[] = [];
  let drag: DragState = null;
  let draw: DrawState = null;

  let markMaskDirty: (() => void) | undefined;
  const paint = createPaintSystem({
    config: CONFIG,
    getDpr,
    onRedraw: () => markMaskDirty?.()
  });

  const renderer = createPuzzleRenderer({
    canvas: canvasEl,
    paintCanvas: paint.paintCanvas,
    shaders: { vert: puzzleVert, paintFrag: puzzlePaintFrag, pieceFrag: puzzlePieceMaskFrag }
  });
  markMaskDirty = () => renderer.markMaskDirty();

  function resizeAll(): { w: number; h: number; dpr: number } {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
    paint.resize(w, h);
    renderer.resize(w, h);
    return { w, h, dpr };
  }

  function canvasPointFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = getDpr();
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr
    };
  }

  function maskBitsAt(x: number, y: number): number {
    return paint.maskBitsAt(x, y, canvasEl.width, canvasEl.height);
  }

  function hitTestPiece(rp: RuntimePiece, x: number, y: number): boolean {
    if (maskBitsAt(x, y) !== rp.maskBits) return false;
    const pad = rp.img.geom.padPx;
    const localX = x - (rp.x - pad);
    const localY = y - (rp.y - pad);
    if (localX < 0 || localY < 0) return false;
    const w = rp.img.bitmap.width;
    const h = rp.img.bitmap.height;
    if (localX > w || localY > h) return false;
    return hitCtx2.isPointInPath(rp.img.path, localX, localY);
  }

  function onPointerDown(e: PointerEvent): void {
    if (!geom) return;
    if (drag || draw) return;
    const { x, y } = canvasPointFromEvent(e);

    for (let i = pieces.length - 1; i >= 0; i--) {
      const rp = pieces[i];
      if (hitTestPiece(rp, x, y)) {
        pieces = groupSys.bringGroupToFront(rp.groupId, pieces);
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

    // не по пазлу — рисуем
    draw = { pointerId: e.pointerId, color: ui.getActiveColor() };
    canvasEl.setPointerCapture(e.pointerId);
    paint.addPoint(draw.color, x, y);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;
    const { x, y } = canvasPointFromEvent(e);
    if (maskBitsAt(x, y) !== drag.piece.maskBits) return;
    const newX = x - drag.offsetX;
    const newY = y - drag.offsetY;
    const dx = newX - drag.piece.x;
    const dy = newY - drag.piece.y;
    groupSys.moveGroup(drag.groupId, dx, dy);
  }

  function onPointerMoveDraw(e: PointerEvent): void {
    if (!draw) return;
    if (e.pointerId !== draw.pointerId) return;
    const { x, y } = canvasPointFromEvent(e);
    paint.addPoint(draw.color, x, y);
  }

  function onPointerUpOrCancel(e: PointerEvent): void {
    const wasDrag = drag && e.pointerId === drag.pointerId ? drag : null;
    const wasDraw = draw && e.pointerId === draw.pointerId ? draw : null;
    if (wasDrag) drag = null;
    if (wasDraw) draw = null;
    if (!wasDrag && !wasDraw) return;

    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (wasDrag && geom) {
      let currentGroupId = wasDrag.groupId;
      for (let i = 0; i < 12; i++) {
        const res = trySnapGroupOnce({ groupId: currentGroupId, geom, getDpr, groupSys, pieces });
        if (!res) break;
        pieces = res.pieces;
        currentGroupId = res.mergedInto;
      }
    }
  }

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointermove", onPointerMoveDraw);
  canvasEl.addEventListener("pointerup", onPointerUpOrCancel);
  canvasEl.addEventListener("pointercancel", onPointerUpOrCancel);

  let rebuildToken = 0;
  let sourceImg: HTMLImageElement | null = null;

  async function rebuild(): Promise<void> {
    const token = ++rebuildToken;
    const { w, h, dpr } = resizeAll();
    if (!sourceImg) return;

    geom = pickGeometry(w, h, dpr);

    renderer.disposePiecesMeshes(pieces);
    const built = await buildPieces({
      rows: 4,
      cols: 4,
      img: sourceImg,
      geom,
      seed: 0x1eafc0de
    });
    if (token !== rebuildToken) return;

    pieces = built;
    scramblePieces(pieces, rng, w, h, geom, dpr);
    groupSys.init(pieces);
    paint.clear();
    renderer.setPiecesMeshes(pieces);
    statusEl.textContent = "Готово";
  }

  // render loop
  let rafId = 0;
  function frame(): void {
    rafId = window.requestAnimationFrame(frame);
    const dpr = getDpr();
    renderer.render(pieces);
    if (geom) {
      statusEl.textContent = `Кусочков: ${pieces.length} • Групп: ${groupSys.groups.size} • Цвет: ${ui
        .getActiveColor()
        .toUpperCase()} • DPR: ${dpr.toFixed(2)}`;
    }
  }

  (async () => {
    try {
      sourceImg = await loadImage("/img-lol.jpg");
      await rebuild();
      if (!rafId) rafId = window.requestAnimationFrame(frame);
      statusEl.classList.add("puzzle__status--ready");
    } catch (e) {
      statusEl.textContent = e instanceof Error ? e.message : String(e);
    }
  })();

  // resize debounce
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => void rebuild());
  });
}


