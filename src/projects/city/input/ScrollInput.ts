/**
 * Нормализованный “скролл прогресс” 0..1 для обзорной камеры.
 * Реализация: wheel + drag (pointer), без зависимости от window.scrollY.
 */
export class ScrollInput {
  private _progress01 = 0;
  private _enabled = true;
  private _dragging = false;
  private _lastY = 0;
  private _lastPointerId: number | null = null;

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this._dragging = false;
      this._lastPointerId = null;
    }
  }

  bind(el: HTMLElement): () => void {
    const onWheel = (e: WheelEvent) => {
      if (!this._enabled) return;
      // Вниз — увеличиваем прогресс.
      const delta = Math.sign(e.deltaY) * Math.min(0.08, Math.abs(e.deltaY) / 1500);
      this._progress01 = _clamp01(this._progress01 + delta);
    };

    const onDown = (e: PointerEvent) => {
      if (!this._enabled) return;
      // Перетаскивание одним пальцем/мышью.
      this._dragging = true;
      this._lastPointerId = e.pointerId;
      this._lastY = e.clientY;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this._enabled) return;
      if (!this._dragging) return;
      if (this._lastPointerId !== null && e.pointerId !== this._lastPointerId) return;
      const dy = e.clientY - this._lastY;
      this._lastY = e.clientY;
      // Тащим вверх → прогресс уменьшается (как скролл).
      this._progress01 = _clamp01(this._progress01 + dy * -0.0012);
    };

    const onUp = (e: PointerEvent) => {
      if (!this._enabled) return;
      if (this._lastPointerId !== null && e.pointerId !== this._lastPointerId) return;
      this._dragging = false;
      this._lastPointerId = null;
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }

  getProgress01(): number {
    return this._progress01;
  }

  setProgress01(v: number): void {
    this._progress01 = _clamp01(v);
  }
}

function _clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

