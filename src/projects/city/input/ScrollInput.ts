/**
 * Нормализованный “скролл прогресс” 0..1 для обзорной камеры.
 * Реализация: wheel + drag (pointer), без зависимости от window.scrollY.
 */
type ScrollInputConfig = {
  dragProgressPerPx?: number;
  wheelDivisor?: number;
  wheelMaxStep?: number;
};

const _DEFAULT_SCROLL_INPUT_CONFIG: Required<ScrollInputConfig> = {
  dragProgressPerPx: 0.0012,
  wheelDivisor: 1500,
  wheelMaxStep: 0.08,
};

export class ScrollInput {
  private _progress01 = 0;
  private _enabled = true;
  private _dragging = false;
  private _lastY = 0;
  private _lastPointerId: number | null = null;
  private _config: Required<ScrollInputConfig>;

  constructor(config: ScrollInputConfig = {}) {
    this._config = {
      dragProgressPerPx: config.dragProgressPerPx ?? _DEFAULT_SCROLL_INPUT_CONFIG.dragProgressPerPx,
      wheelDivisor: config.wheelDivisor ?? _DEFAULT_SCROLL_INPUT_CONFIG.wheelDivisor,
      wheelMaxStep: config.wheelMaxStep ?? _DEFAULT_SCROLL_INPUT_CONFIG.wheelMaxStep,
    };
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this._dragging = false;
      this._lastPointerId = null;
    }
  }

  bind(el: HTMLElement): () => void {
    const isUiEvent = (e: Event): boolean => {
      const t = e.target;
      if (!(t instanceof Element)) return false;
      // Любой UI внутри uiRoot помечен data-city-ui="1"
      if (t.closest('[data-city-ui="1"]')) return true;
      // Фоллбек: любая кнопка.
      if (t.closest("button")) return true;
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!this._enabled) return;
      if (isUiEvent(e)) return;
      // Вниз — увеличиваем прогресс.
      const delta =
        Math.sign(e.deltaY) * Math.min(this._config.wheelMaxStep, Math.abs(e.deltaY) / this._config.wheelDivisor);
      this._progress01 = _clamp01(this._progress01 + delta);
    };

    const onDown = (e: PointerEvent) => {
      if (!this._enabled) return;
      if (isUiEvent(e)) return;
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
      this._progress01 = _clamp01(this._progress01 + dy * -this._config.dragProgressPerPx);
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

