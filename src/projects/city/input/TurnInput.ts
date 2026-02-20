export type TurnDirection = -1 | 0 | 1;

export type TurnInputState = Readonly<{
  turn: TurnDirection;
  holdSec: number;
}>;

/**
 * Управление поворотом через удержание левой/правой половины экрана.
 */
export class TurnInput {
  private _enabled = true;
  private _turn: TurnDirection = 0;
  private _holdSec = 0;
  private _isHolding = false;
  private _lastPointerId: number | null = null;

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this._isHolding = false;
      this._lastPointerId = null;
      this._turn = 0;
      this._holdSec = 0;
    }
  }

  bind(el: HTMLElement): () => void {
    const onDown = (e: PointerEvent) => {
      if (!this._enabled) return;
      this._isHolding = true;
      this._lastPointerId = e.pointerId;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      // В three.js yaw +Y (rotation.y) при взгляде сверху — это поворот влево.
      // Поэтому “левая половина экрана” -> поворот влево (+1).
      this._turn = x < rect.width * 0.5 ? 1 : -1;
      this._holdSec = 0;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!this._enabled) return;
      if (this._lastPointerId !== null && e.pointerId !== this._lastPointerId) return;
      this._isHolding = false;
      this._lastPointerId = null;
      this._turn = 0;
      this._holdSec = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!this._enabled) return;
      if (!this._isHolding) return;
      if (this._lastPointerId !== null && e.pointerId !== this._lastPointerId) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const next: TurnDirection = x < rect.width * 0.5 ? 1 : -1;
      if (next !== this._turn) {
        this._turn = next;
        this._holdSec = 0;
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointermove", onMove);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointermove", onMove);
    };
  }

  update(dtSec: number): void {
    if (!this._isHolding) return;
    this._holdSec += Math.max(0, dtSec);
  }

  snapshot(): TurnInputState {
    return { turn: this._turn, holdSec: this._holdSec };
  }
}

