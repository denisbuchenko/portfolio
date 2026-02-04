import type { ColorKey } from "../runtimeTypes";

/**
 * Минимальный контракт рисования/маски, который нужен пазлу (интеракции + rebuild).
 * Реализация может быть 2D canvas или WebGL RenderTarget.
 */
export type PaintSystem = {
  resize(w: number, h: number): void;
  clear(): void;
  clearColor(color: ColorKey): void;
  addPoint(color: ColorKey, x: number, y: number): void;
  maskBitsAt(x: number, y: number, viewW: number, viewH: number): number;
};

