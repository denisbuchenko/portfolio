import type { PieceGeometry } from "./path";
import { XorShift32 } from "./rng";
import { CONFIG } from "../../config";

import puzzleVert from "../../shaders/puzzleTextured.vert.glsl?raw";
import puzzleBgFrag from "../../shaders/puzzleBgMasked.frag.glsl?raw";
import puzzlePieceMaskFrag from "../../shaders/puzzlePieceMask.frag.glsl?raw";

import type { DragState, DrawState, RuntimePiece } from "./app/runtimeTypes";
import type { PuzzleUI } from "./app/ui/puzzleUI";
import { mountPuzzleUI } from "./app/ui/puzzleUI";
import type { PaintSystem } from "./app/paint/paintSystem";
import { createPaintSystem } from "./app/paint/paintSystem";
import { GroupSystem, createGroupSystem } from "./app/groups/groupSystem";
import { trySnapGroupOnce } from "./app/groups/snapper";
import type { PuzzleRenderer } from "./app/render/puzzleRenderer";
import { createPuzzleRenderer } from "./app/render/puzzleRenderer";
import { buildPieces, pickGeometry, scramblePieces } from "./app/build/buildPieces";
import { getDpr, loadImage } from "./app/utils";

export class PuzzleProject {
  private _ui: PuzzleUI;
  private _paint: PaintSystem;
  private _groupSys: GroupSystem;
  private _renderer: PuzzleRenderer;
  private _rng: XorShift32;

  private _hitCanvas: HTMLCanvasElement;
  private _hitCtx: CanvasRenderingContext2D;

  private _geom: PieceGeometry | null = null;
  private _pieces: RuntimePiece[] = [];
  private _drag: DragState = null;
  private _draw: DrawState = null;

  private _rebuildToken = 0;
  private _sourceImg: HTMLImageElement | null = null;

  private _rafId = 0;
  private _resizeRaf = 0;

  constructor(host: HTMLElement) {
    this._ui = mountPuzzleUI({ host, config: CONFIG });
    this._rng = new XorShift32(0x0ddba11);
    this._groupSys = createGroupSystem();

    this._hitCanvas = document.createElement("canvas");
    this._hitCanvas.width = 2;
    this._hitCanvas.height = 2;
    const hitCtx = this._hitCanvas.getContext("2d");
    if (!hitCtx) throw new Error("2D hit context not available");
    this._hitCtx = hitCtx;

    this._paint = createPaintSystem({
      config: CONFIG,
      getDpr,
      onRedraw: () => this._renderer.markMaskDirty()
    });

    this._renderer = createPuzzleRenderer({
      canvas: this._ui.canvas,
      paintCanvas: this._paint.paintCanvas,
      background3d: CONFIG.puzzle.background3d,
      shaders: { vert: puzzleVert, bgFrag: puzzleBgFrag, pieceFrag: puzzlePieceMaskFrag }
    });

    this._setupEventListeners();
    this._init();
  }

  private _setupEventListeners(): void {
    this._ui.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this._ui.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this._ui.canvas.addEventListener("pointermove", (e) => this._onPointerMoveDraw(e));
    this._ui.canvas.addEventListener("pointerup", (e) => this._onPointerUpOrCancel(e));
    this._ui.canvas.addEventListener("pointercancel", (e) => this._onPointerUpOrCancel(e));

    window.addEventListener("resize", () => {
      if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = requestAnimationFrame(() => void this._rebuild());
    });
  }

  private async _init(): Promise<void> {
    try {
      this._sourceImg = await loadImage("/img-lol.jpg");
      await this._rebuild();
      await this._renderer.loadAndPrewarm(getDpr());

      if (!this._rafId) this._rafId = window.requestAnimationFrame(() => this._frame());
      this._ui.statusEl.classList.add("puzzle__status--ready");
    } catch (e) {
      this._ui.statusEl.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  private _resizeAll(): { w: number; h: number; dpr: number } {
    const rect = this._ui.canvas.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this._ui.canvas.width !== w) this._ui.canvas.width = w;
    if (this._ui.canvas.height !== h) this._ui.canvas.height = h;
    this._paint.resize(w, h);
    this._renderer.resize(w, h, dpr);
    return { w, h, dpr };
  }

  private _canvasPointFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = this._ui.canvas.getBoundingClientRect();
    const dpr = getDpr();
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr
    };
  }

  private _maskBitsAt(x: number, y: number): number {
    return this._paint.maskBitsAt(x, y, this._ui.canvas.width, this._ui.canvas.height);
  }

  private _hitTestPiece(rp: RuntimePiece, x: number, y: number): boolean {
    if (this._maskBitsAt(x, y) !== rp.maskBits) return false;
    const pad = rp.img.geom.padPx;
    const localX = x - (rp.x - pad);
    const localY = y - (rp.y - pad);
    if (localX < 0 || localY < 0) return false;
    const w = rp.img.bitmap.width;
    const h = rp.img.bitmap.height;
    if (localX > w || localY > h) return false;
    return this._hitCtx.isPointInPath(rp.img.path, localX, localY);
  }

  private _onPointerDown(e: PointerEvent): void {
    if (!this._geom) return;
    if (this._drag || this._draw) return;
    const { x, y } = this._canvasPointFromEvent(e);

    for (let i = this._pieces.length - 1; i >= 0; i--) {
      const rp = this._pieces[i];
      if (this._hitTestPiece(rp, x, y)) {
        this._pieces = this._groupSys.bringGroupToFront(rp.groupId, this._pieces);
        this._drag = {
          pointerId: e.pointerId,
          piece: rp,
          groupId: rp.groupId,
          offsetX: x - rp.x,
          offsetY: y - rp.y
        };
        this._ui.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    this._draw = { pointerId: e.pointerId, color: this._ui.getActiveColor() };
    this._ui.canvas.setPointerCapture(e.pointerId);
    this._paint.addPoint(this._draw.color, x, y);
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._drag) return;
    if (e.pointerId !== this._drag.pointerId) return;
    const { x, y } = this._canvasPointFromEvent(e);
    if (this._maskBitsAt(x, y) !== this._drag.piece.maskBits) return;
    const newX = x - this._drag.offsetX;
    const newY = y - this._drag.offsetY;
    const dx = newX - this._drag.piece.x;
    const dy = newY - this._drag.piece.y;
    this._groupSys.moveGroup(this._drag.groupId, dx, dy);
  }

  private _onPointerMoveDraw(e: PointerEvent): void {
    if (!this._draw) return;
    if (e.pointerId !== this._draw.pointerId) return;
    const { x, y } = this._canvasPointFromEvent(e);
    this._paint.addPoint(this._draw.color, x, y);
  }

  private _onPointerUpOrCancel(e: PointerEvent): void {
    const wasDrag = this._drag && e.pointerId === this._drag.pointerId ? this._drag : null;
    const wasDraw = this._draw && e.pointerId === this._draw.pointerId ? this._draw : null;
    if (wasDrag) this._drag = null;
    if (wasDraw) this._draw = null;
    if (!wasDrag && !wasDraw) return;

    try {
      this._ui.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (wasDrag && this._geom) {
      this._trySnapGroup(wasDrag.groupId);
    }
  }

  private _trySnapGroup(groupId: number): void {
    let currentGroupId = groupId;
    for (let i = 0; i < 12; i++) {
      const res = trySnapGroupOnce({
        groupId: currentGroupId,
        geom: this._geom!,
        getDpr,
        groupSys: this._groupSys,
        pieces: this._pieces
      });
      if (!res) break;
      this._pieces = res.pieces;
      currentGroupId = res.mergedInto;
    }
  }

  private async _rebuild(): Promise<void> {
    const token = ++this._rebuildToken;
    const { w, h, dpr } = this._resizeAll();
    if (!this._sourceImg) return;

    this._geom = pickGeometry(w, h, dpr);

    this._renderer.disposePiecesMeshes(this._pieces);
    const built = await buildPieces({
      rows: 4,
      cols: 4,
      img: this._sourceImg,
      geom: this._geom,
      seed: 0x1eafc0de
    });
    if (token !== this._rebuildToken) return;

    this._pieces = built;
    scramblePieces(this._pieces, this._rng, w, h, this._geom, dpr);
    this._groupSys.init(this._pieces);
    this._paint.clear();
    this._renderer.setPiecesMeshes(this._pieces);
    this._ui.statusEl.textContent = "Готово";
  }

  private _frame(): void {
    this._rafId = window.requestAnimationFrame(() => this._frame());
    const dpr = getDpr();
    this._renderer.render(this._pieces, performance.now() * 0.001, dpr);
    if (this._geom) {
      this._ui.statusEl.textContent = `Кусочков: ${this._pieces.length} • Групп: ${this._groupSys.groups.size} • Цвет: ${this._ui
        .getActiveColor()
        .toUpperCase()} • DPR: ${dpr.toFixed(2)}`;
    }
  }
}

export function mountPuzzleProject(host: HTMLElement): void {
  new PuzzleProject(host);
}
