import { CONFIG } from "../../config";

import puzzleVert from "../../shaders/puzzleTextured.vert.glsl?raw";
import puzzleBgFrag from "../../shaders/puzzleBgMasked.frag.glsl?raw";
import puzzlePieceMaskFrag from "../../shaders/puzzlePieceMask.frag.glsl?raw";

import { mountPuzzleUI } from "./app/ui/puzzleUI";
import { createPaintSystem } from "./app/paint/paintSystem";
import { createGroupSystem } from "./app/groups/groupSystem";
import { createPuzzleRenderer } from "./app/render/puzzleRenderer";
import { InputHandler } from "./app/input";
import { PuzzleManager } from "./app/puzzleManager";
import { XorShift32 } from "./rng";
import { getDpr, loadImage } from "./app/utils";

export class PuzzleProject {
  private _ui: ReturnType<typeof mountPuzzleUI>;
  private _paint: ReturnType<typeof createPaintSystem>;
  private _groupSys: ReturnType<typeof createGroupSystem>;
  private _renderer: ReturnType<typeof createPuzzleRenderer>;
  private _input: InputHandler;
  private _manager: PuzzleManager;
  private _rng: XorShift32;

  private _sourceImg: HTMLImageElement | null = null;
  private _rafId = 0;
  private _resizeRaf = 0;

  constructor(host: HTMLElement) {
    this._ui = mountPuzzleUI({ host, config: CONFIG });
    this._groupSys = createGroupSystem();
    this._rng = new XorShift32(0x0ddba11);
    this._input = new InputHandler();
    this._manager = new PuzzleManager();

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

  private _maskBitsAt(x: number, y: number): number {
    return this._paint.maskBitsAt(x, y, this._ui.canvas.width, this._ui.canvas.height);
  }

  private _onPointerDown(e: PointerEvent): void {
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
  }

  private _onPointerMove(e: PointerEvent): void {
    this._input.handlePointerMove(e, this._ui.canvas, this._manager.drag, this._groupSys, (x, y) =>
      this._maskBitsAt(x, y)
    );
  }

  private _onPointerMoveDraw(e: PointerEvent): void {
    this._input.handlePointerMoveDraw(e, this._ui.canvas, this._manager.draw, this._paint);
  }

  private _onPointerUpOrCancel(e: PointerEvent): void {
    this._input.handlePointerUpOrCancel(
      e,
      this._ui.canvas,
      this._manager.drag,
      this._manager.draw,
      (drag) => {
        this._manager.setDrag(null);
        if (this._manager.geom && drag) {
          this._manager.trySnapGroup(drag.groupId, this._groupSys);
        }
      },
      () => {
        this._manager.setDraw(null);
      }
    );
  }

  private async _rebuild(): Promise<void> {
    if (!this._sourceImg) return;
    await this._manager.rebuild(
      this._sourceImg,
      this._ui.canvas,
      this._paint,
      this._renderer,
      this._groupSys,
      this._ui,
      this._rng
    );
  }

  private _frame(): void {
    this._rafId = window.requestAnimationFrame(() => this._frame());
    const dpr = getDpr();
    this._renderer.render(this._manager.pieces, performance.now() * 0.001, dpr);
    this._manager.updateStatus(this._ui, this._groupSys);
  }
}

export function mountPuzzleProject(host: HTMLElement): void {
  new PuzzleProject(host);
}
