import { CONFIG } from "../../config";

import puzzleVert from "../../shaders/puzzleTextured.vert.glsl?raw";
import puzzleBgFrag from "../../shaders/puzzleBgMasked.frag.glsl?raw";
import puzzlePieceMaskFrag from "../../shaders/puzzlePieceMask.frag.glsl?raw";

import { mountPuzzleUI } from "./app/ui/puzzleUI";
import { createPaintSystemGL } from "./app/paint/paintSystemGL";
import { createGroupSystem } from "./app/groups/groupSystem";
import { createPuzzleRenderer } from "./app/render/puzzleRenderer";
import { InputHandler } from "./app/input";
import { PuzzleManager } from "./app/puzzleManager";
import { XorShift32 } from "./rng";
import { getDpr, loadImage } from "./app/utils";
import { publicAssetUrl } from "../../utils/publicAssetUrl";

const PUZZLE_FINAL_FILL_DURATION_SEC = 1.6;
const PUZZLE_REWARD_DELAY_MS = 1000;

export interface PuzzleProjectOptions {
  onGameComplete?: () => void;
}

export interface PuzzleConsoleApi {
  complete: () => boolean;
  getGroupCount: () => number;
  isCompleting: () => boolean;
  isCompleted: () => boolean;
}

type _PuzzleLayoutSnapshot = {
  canvasWidth: number;
  canvasHeight: number;
  pieceOrder: number[];
  piecesById: Map<
    number,
    {
      centerX01: number;
      centerY01: number;
      groupId: number;
    }
  >;
};

declare global {
  interface Window {
    puzzleGame?: PuzzleConsoleApi;
  }
}

export class PuzzleProject {
  private _host: HTMLElement;
  private _ui: ReturnType<typeof mountPuzzleUI>;
  private _paint: ReturnType<typeof createPaintSystemGL>;
  private _groupSys: ReturnType<typeof createGroupSystem>;
  private _renderer: ReturnType<typeof createPuzzleRenderer> | null = null;
  private _input: InputHandler;
  private _manager: PuzzleManager;
  private _rng: XorShift32;

  private _sourceImg: HTMLImageElement | null = null;
  private _rafId = 0;
  private _resizeRaf = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _disposed = false;
  private _renderActive = true;
  private _finalFillPhase: "idle" | "animating" | "completed" = "idle";
  private _finalFillStartTimeSec = 0;
  private _rewardTimer: number | null = null;
  private _onGameComplete?: () => void;
  private _consoleApi: PuzzleConsoleApi;

  private _onCanvasPointerDown = (e: PointerEvent) => this._onPointerDown(e);
  private _onCanvasPointerMove = (e: PointerEvent) => this._onPointerMove(e);
  private _onCanvasPointerMoveDraw = (e: PointerEvent) => this._onPointerMoveDraw(e);
  private _onCanvasPointerUpOrCancel = (e: PointerEvent) => this._onPointerUpOrCancel(e);
  private _onWindowResize = () => this._scheduleRebuild();

  constructor(host: HTMLElement, opts: PuzzleProjectOptions = {}) {
    this._host = host;
    this._onGameComplete = opts.onGameComplete;
    this._ui = mountPuzzleUI({ 
      host, 
      config: CONFIG,
      onColorSelect: (color, wasAlreadyActive) => {
        if (wasAlreadyActive) {
          this._paint.clearColor(color);
        }
      }
    });
    this._groupSys = createGroupSystem();
    this._rng = new XorShift32(0x0ddba11);
    this._input = new InputHandler();
    this._manager = new PuzzleManager();

    this._paint = createPaintSystemGL({
      config: CONFIG,
      getDpr,
      onRedraw: () => this._renderer?.markMaskDirty()
    });

    this._renderer = createPuzzleRenderer({
      canvas: this._ui.canvas,
      paint: this._paint,
      background3d: CONFIG.puzzle.background3d,
      shaders: { vert: puzzleVert, bgFrag: puzzleBgFrag, pieceFrag: puzzlePieceMaskFrag }
    });
    this._consoleApi = this._createConsoleApi();

    this._setupEventListeners();
    window.puzzleGame = this._consoleApi;
    this._init();
  }

  private _setupEventListeners(): void {
    const nonPassive: AddEventListenerOptions = { passive: false };
    this._ui.canvas.addEventListener("pointerdown", this._onCanvasPointerDown, nonPassive);
    this._ui.canvas.addEventListener("pointermove", this._onCanvasPointerMove, nonPassive);
    this._ui.canvas.addEventListener("pointermove", this._onCanvasPointerMoveDraw, nonPassive);
    this._ui.canvas.addEventListener("pointerup", this._onCanvasPointerUpOrCancel, nonPassive);
    this._ui.canvas.addEventListener("pointercancel", this._onCanvasPointerUpOrCancel, nonPassive);

    window.addEventListener("resize", this._onWindowResize);
    this._resizeObserver = new ResizeObserver(() => this._scheduleRebuild());
    this._resizeObserver.observe(this._host);
  }

  private _removeEventListeners(): void {
    const nonPassive: AddEventListenerOptions = { passive: false };
    this._ui.canvas.removeEventListener("pointerdown", this._onCanvasPointerDown, nonPassive);
    this._ui.canvas.removeEventListener("pointermove", this._onCanvasPointerMove, nonPassive);
    this._ui.canvas.removeEventListener("pointermove", this._onCanvasPointerMoveDraw, nonPassive);
    this._ui.canvas.removeEventListener("pointerup", this._onCanvasPointerUpOrCancel, nonPassive);
    this._ui.canvas.removeEventListener("pointercancel", this._onCanvasPointerUpOrCancel, nonPassive);

    window.removeEventListener("resize", this._onWindowResize);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  private _scheduleRebuild(): void {
    if (this._disposed) return;
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = 0;
      const snapshot = this._captureLayoutSnapshot();
      void this._rebuild(snapshot);
      this._renderOnce();
    });
  }

  private async _init(): Promise<void> {
    try {
      this._sourceImg = await loadImage(publicAssetUrl("img-lol.jpg"));
      await this._rebuild(null);
      await this._renderer?.loadAndPrewarm(getDpr());

      if (this._renderActive) this._requestFrame();
      else this._renderOnce();
    } catch (e) {
      this._ui.statusEl.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  private _maskBitsAt(x: number, y: number): number {
    return this._paint.maskBitsAt(x, y, this._ui.canvas.width, this._ui.canvas.height);
  }

  private _onPointerDown(e: PointerEvent): void {
    if (!this._renderActive) return;
    if (this._finalFillPhase !== "idle") return;
    if (!this._manager.geom) return;
    if (this._manager.drag || this._manager.draw) return;

    const newPieces = this._input.handlePointerDown(
      e,
      this._ui.canvas,
      this._manager.pieces,
      this._groupSys,
      this._ui,
      this._paint,
      (x, y) => this._maskBitsAt(x, y),
      (drag, pieces) => {
        this._manager.setDrag(drag);
        this._manager.setPieces(pieces);
      },
      (draw) => {
        this._manager.setDraw(draw);
      }
    );
    this._manager.setPieces(newPieces);
    if (this._manager.drag || this._manager.draw) {
      if (e.cancelable) e.preventDefault();
    }
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._renderActive) return;
    if (this._finalFillPhase !== "idle") return;
    this._input.handlePointerMove(e, this._ui.canvas, this._manager.drag, this._groupSys, (x, y) =>
      this._maskBitsAt(x, y)
    );
    if (this._manager.drag && e.cancelable) e.preventDefault();
  }

  private _onPointerMoveDraw(e: PointerEvent): void {
    if (!this._renderActive) return;
    if (this._finalFillPhase !== "idle") return;
    this._input.handlePointerMoveDraw(e, this._ui.canvas, this._manager.draw, this._paint);
    if (this._manager.draw && e.cancelable) e.preventDefault();
  }

  private _onPointerUpOrCancel(e: PointerEvent): void {
    if (!this._renderActive) return;
    this._input.handlePointerUpOrCancel(
      e,
      this._ui.canvas,
      this._manager.drag,
      this._manager.draw,
      (drag) => {
        this._manager.setDrag(null);
        if (this._manager.geom && drag) {
          this._manager.trySnapGroup(drag.groupId, this._groupSys);
          this._tryStartCompletion();
        }
      },
      () => {
        this._manager.setDraw(null);
      }
    );
  }

  private async _rebuild(snapshot: _PuzzleLayoutSnapshot | null): Promise<void> {
    if (!this._sourceImg) return;
    if (!this._renderer) return;
    this._resetInteractions();
    this._resetCompletionState();
    await this._manager.rebuild(
      this._sourceImg,
      this._ui.canvas,
      this._paint,
      this._renderer,
      this._groupSys,
      this._ui,
      this._rng
    );
    this._restoreLayoutSnapshot(snapshot);
  }

  dispose(): void {
    this._disposed = true;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this._resizeRaf) {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = 0;
    }
    if (this._rewardTimer !== null) {
      window.clearTimeout(this._rewardTimer);
      this._rewardTimer = null;
    }
    this._resetInteractions();
    this._removeEventListeners();
    if (window.puzzleGame === this._consoleApi) delete window.puzzleGame;
    this._ui.destroy();
  }

  resume(): void {
    this.setRenderActive(true);
  }

  pause(): void {
    this.setRenderActive(false);
  }

  resize(): void {
    this._scheduleRebuild();
  }

  setRenderActive(active: boolean): void {
    if (this._disposed) return;
    if (this._renderActive === active) return;

    this._renderActive = active;
    if (active) {
      this._renderOnce();
      this._requestFrame();
      return;
    }

    this._resetInteractions();
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  private _frame(): void {
    if (this._disposed || !this._renderActive) {
      this._rafId = 0;
      return;
    }

    this._rafId = window.requestAnimationFrame(() => this._frame());
    this._renderOnce();
  }

  private _requestFrame(): void {
    if (this._rafId || this._disposed || !this._renderActive) return;
    this._rafId = window.requestAnimationFrame(() => this._frame());
  }

  private _renderOnce(): void {
    const dpr = getDpr();
    const timeSec = performance.now() * 0.001;
    this._updateFinalFill(timeSec);
    this._renderer?.render(this._manager.pieces, timeSec, dpr);
    this._manager.updateStatus(this._ui, this._groupSys);
  }

  private _resetInteractions(): void {
    const drag = this._manager.drag;
    const draw = this._manager.draw;

    if (drag) {
      try {
        this._ui.canvas.releasePointerCapture(drag.pointerId);
      } catch {
        // ignore
      }
      this._manager.setDrag(null);
      if (this._manager.geom) this._manager.trySnapGroup(drag.groupId, this._groupSys);
    }

    if (draw) {
      try {
        this._ui.canvas.releasePointerCapture(draw.pointerId);
      } catch {
        // ignore
      }
      this._manager.setDraw(null);
    }
  }

  completeGame(): boolean {
    return this._tryStartCompletion(true);
  }

  private _createConsoleApi(): PuzzleConsoleApi {
    return {
      complete: () => this.completeGame(),
      getGroupCount: () => this._groupSys.groups.size,
      isCompleting: () => this._finalFillPhase === "animating",
      isCompleted: () => this._finalFillPhase === "completed",
    };
  }

  private _tryStartCompletion(force = false): boolean {
    if (this._disposed) return false;
    if (this._finalFillPhase !== "idle") return false;
    if (!force && this._groupSys.groups.size !== 1) return false;

    this._resetInteractions();
    this._finalFillPhase = "animating";
    this._finalFillStartTimeSec = performance.now() * 0.001;
    this._paint.beginFinalFill(this._ui.canvas.width * 0.5, this._ui.canvas.height * 0.5);
    this._paint.setFinalFillProgress(0);
    return true;
  }

  private _updateFinalFill(timeSec: number): void {
    if (this._finalFillPhase !== "animating") return;
    const t = Math.max(0, (timeSec - this._finalFillStartTimeSec) / PUZZLE_FINAL_FILL_DURATION_SEC);
    const progress01 = Math.min(1, t);
    this._paint.setFinalFillProgress(progress01 * progress01 * (3 - 2 * progress01));
    if (progress01 < 1) return;

    this._finalFillPhase = "completed";
    this._paint.setFinalFillProgress(1);
    if (this._rewardTimer !== null) return;
    this._rewardTimer = window.setTimeout(() => {
      this._rewardTimer = null;
      if (this._disposed) return;
      this._onGameComplete?.();
    }, PUZZLE_REWARD_DELAY_MS);
  }

  private _resetCompletionState(): void {
    this._finalFillPhase = "idle";
    this._finalFillStartTimeSec = 0;
    if (this._rewardTimer !== null) {
      window.clearTimeout(this._rewardTimer);
      this._rewardTimer = null;
    }
    this._paint.clearFinalFill();
  }

  private _captureLayoutSnapshot(): _PuzzleLayoutSnapshot | null {
    const canvasWidth = this._ui.canvas.width;
    const canvasHeight = this._ui.canvas.height;
    if (canvasWidth <= 0 || canvasHeight <= 0) return null;
    if (this._manager.pieces.length === 0) return null;

    const piecesById = new Map<number, { centerX01: number; centerY01: number; groupId: number }>();
    for (const piece of this._manager.pieces) {
      const left = piece.x - piece.img.geom.padPx;
      const top = piece.y - piece.img.geom.padPx;
      const centerX01 = (left + piece.img.bitmap.width * 0.5) / canvasWidth;
      const centerY01 = (top + piece.img.bitmap.height * 0.5) / canvasHeight;
      piecesById.set(piece.id, {
        centerX01,
        centerY01,
        groupId: piece.groupId,
      });
    }

    return {
      canvasWidth,
      canvasHeight,
      pieceOrder: this._manager.pieces.map((piece) => piece.id),
      piecesById,
    };
  }

  private _restoreLayoutSnapshot(snapshot: _PuzzleLayoutSnapshot | null): void {
    if (!snapshot) return;
    const canvasWidth = Math.max(1, this._ui.canvas.width);
    const canvasHeight = Math.max(1, this._ui.canvas.height);
    if (this._manager.pieces.length === 0) return;

    for (const piece of this._manager.pieces) {
      const saved = snapshot.piecesById.get(piece.id);
      if (!saved) continue;

      const pieceWidth = piece.img.bitmap.width;
      const pieceHeight = piece.img.bitmap.height;
      const pad = piece.img.geom.padPx;
      const centerX = saved.centerX01 * canvasWidth;
      const centerY = saved.centerY01 * canvasHeight;
      const maxLeft = Math.max(0, canvasWidth - pieceWidth);
      const maxTop = Math.max(0, canvasHeight - pieceHeight);
      const left = Math.max(0, Math.min(maxLeft, centerX - pieceWidth * 0.5));
      const top = Math.max(0, Math.min(maxTop, centerY - pieceHeight * 0.5));

      piece.x = left + pad;
      piece.y = top + pad;
    }

    const desiredGroups = new Map<number, number[]>();
    for (const piece of this._manager.pieces) {
      const saved = snapshot.piecesById.get(piece.id);
      const groupId = saved?.groupId ?? piece.id;
      const members = desiredGroups.get(groupId);
      if (members) members.push(piece.id);
      else desiredGroups.set(groupId, [piece.id]);
    }

    for (const [targetGroupId, members] of desiredGroups) {
      if (!members.includes(targetGroupId)) continue;
      for (const pieceId of members) {
        if (pieceId === targetGroupId) continue;
        this._groupSys.mergeGroups(targetGroupId, pieceId);
      }
    }

    const order = new Map<number, number>();
    snapshot.pieceOrder.forEach((pieceId, idx) => order.set(pieceId, idx));
    this._manager.setPieces(
      [...this._manager.pieces].sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    );
  }
}

export function mountPuzzleProject(host: HTMLElement, opts: PuzzleProjectOptions = {}): PuzzleProject {
  return new PuzzleProject(host, opts);
}
