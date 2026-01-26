import { assert } from "../../utils/assert";
import type { Mode } from "../../config";

export class HudController {
  private _btnAttractor: HTMLButtonElement;
  private _btnSpline: HTMLButtonElement;
  private _btnPaint: HTMLButtonElement;
  private _statusEl: HTMLElement | null;

  constructor() {
    const btn0 = document.getElementById("btn-mode-0") as HTMLButtonElement | null;
    const btn1 = document.getElementById("btn-mode-1") as HTMLButtonElement | null;
    const btn2 = document.getElementById("btn-mode-2") as HTMLButtonElement | null;
    assert(btn0 && btn1 && btn2, "mode buttons not found");
    this._btnAttractor = btn0;
    this._btnSpline = btn1;
    this._btnPaint = btn2;
    this._statusEl = document.getElementById("hud-status");
  }

  bindModeToggle(getMode: () => Mode, setMode: (m: Mode) => void): void {
    this._btnAttractor.addEventListener("click", () => setMode(getMode() === 0 ? -1 : 0));
    this._btnSpline.addEventListener("click", () => setMode(getMode() === 1 ? -1 : 1));
    this._btnPaint.addEventListener("click", () => setMode(getMode() === 2 ? -1 : 2));
  }

  setMode(mode: Mode): void {
    this._btnAttractor.classList.toggle("btn--active", mode === 0);
    this._btnSpline.classList.toggle("btn--active", mode === 1);
    this._btnPaint.classList.toggle("btn--active", mode === 2);
  }

  setStatus(text: string): void {
    if (!this._statusEl) return;
    this._statusEl.textContent = text;
  }
}


