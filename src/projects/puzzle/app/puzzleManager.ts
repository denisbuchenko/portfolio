import type { PieceGeometry } from "../path";
import type { DragState, DrawState, RuntimePiece } from "./runtimeTypes";
import type { PuzzleUI } from "./ui/puzzleUI";
import type { PaintSystem } from "./paint/paintSystem";
import type { GroupSystem } from "./groups/groupSystem";
import type { PuzzleRenderer } from "./render/puzzleRenderer";
import type { XorShift32 } from "../rng";
import { trySnapGroupOnce } from "./groups/snapper";
import { buildPieces, pickGeometry, scramblePieces } from "./build/buildPieces";
import { getDpr } from "./utils";

export class PuzzleManager {
  private _geom: PieceGeometry | null = null;
  private _pieces: RuntimePiece[] = [];
  private _drag: DragState = null;
  private _draw: DrawState = null;
  private _rebuildToken = 0;

  get pieces(): RuntimePiece[] {
    return this._pieces;
  }

  get drag(): DragState {
    return this._drag;
  }

  get draw(): DrawState {
    return this._draw;
  }

  get geom(): PieceGeometry | null {
    return this._geom;
  }

  setDrag(drag: DragState | null): void {
    this._drag = drag;
  }

  setDraw(draw: DrawState | null): void {
    this._draw = draw;
  }

  setPieces(pieces: RuntimePiece[]): void {
    this._pieces = pieces;
  }

  async rebuild(
    sourceImg: HTMLImageElement,
    canvas: HTMLCanvasElement,
    paint: PaintSystem,
    renderer: PuzzleRenderer,
    groupSys: GroupSystem,
    ui: PuzzleUI,
    rng: XorShift32
  ): Promise<boolean> {
    const token = ++this._rebuildToken;
    const rect = canvas.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    paint.resize(w, h);
    renderer.resize(w, h, dpr);

    this._geom = pickGeometry(w, h, dpr);

    renderer.disposePiecesMeshes(this._pieces);
    const built = await buildPieces({
      rows: 4,
      cols: 4,
      img: sourceImg,
      geom: this._geom,
      seed: 0x1eafc0de
    });
    if (token !== this._rebuildToken) return false;

    this._pieces = built;
    scramblePieces(this._pieces, rng, w, h, this._geom, dpr);
    groupSys.init(this._pieces);
    paint.clear();
    renderer.setPiecesMeshes(this._pieces);
    ui.statusEl.textContent = "Готово";
    return true;
  }

  trySnapGroup(groupId: number, groupSys: GroupSystem): void {
    if (!this._geom) return;
    let currentGroupId = groupId;
    for (let i = 0; i < 12; i++) {
      const res = trySnapGroupOnce({
        groupId: currentGroupId,
        geom: this._geom,
        getDpr,
        groupSys,
        pieces: this._pieces
      });
      if (!res) break;
      this._pieces = res.pieces;
      currentGroupId = res.mergedInto;
    }
  }

  updateStatus(ui: PuzzleUI, groupSys: GroupSystem): void {
    if (!this._geom) return;
    const dpr = getDpr();
    ui.statusEl.textContent = `Кусочков: ${this._pieces.length} • Групп: ${groupSys.groups.size} • Цвет: ${ui
      .getActiveColor()
      .toUpperCase()} • DPR: ${dpr.toFixed(2)}`;
  }
}
