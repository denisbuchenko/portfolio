import type { AnimationItem } from "lottie-web";

export type OsminogUiMode = 1 | 2 | 3;

type _SegmentKey = "loop1" | "transFwd" | "transBwd" | "loop2";

type _Segment = Readonly<{
  frames: readonly [number, number];
}>;

const _SEGMENTS: Record<_SegmentKey, _Segment> = {
  loop1: { frames: [0, 400] },
  transFwd: { frames: [400, 430] },
  transBwd: { frames: [430, 400] },
  loop2: { frames: [430, 490] }
};

export class LottieSegmentsController {
  private _anim: AnimationItem;
  private _currentKey: _SegmentKey = "loop1";
  private _requested: OsminogUiMode | null = null;
  private _disposed = false;
  private _onUiModeChange: ((mode: OsminogUiMode) => void) | null = null;

  // handlers (нужны как поля, чтобы корректно отписываться)
  private _handleDataReady = () => {
    if (this._disposed) return;
    this._play("loop1");
  };

  private _handleComplete = () => {
    if (this._disposed) return;
    this._handleBoundary();
  };

  constructor(anim: AnimationItem) {
    this._anim = anim;
    this._anim.loop = false;
    this._anim.autoplay = false;

    // lottie-web шлёт `data_ready` когда JSON распаршен и готовы метаданные.
    this._anim.addEventListener("data_ready", this._handleDataReady as any);
    // `complete` приходит на завершении проигрывания (у нас всегда loop=false).
    this._anim.addEventListener("complete", this._handleComplete as any);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._onUiModeChange = null;
    this._anim.removeEventListener("data_ready", this._handleDataReady as any);
    this._anim.removeEventListener("complete", this._handleComplete as any);
  }

  request(mode: OsminogUiMode): void {
    this._requested = mode;
  }

  getUiMode(): OsminogUiMode {
    if (this._currentKey === "loop1") return 1;
    if (this._currentKey === "loop2") return 3;
    return 2; // любой переход
  }

  onUiModeChange(cb: (mode: OsminogUiMode) => void): () => void {
    this._onUiModeChange = cb;
    cb(this.getUiMode());
    return () => {
      if (this._onUiModeChange === cb) this._onUiModeChange = null;
    };
  }

  private _emitUiMode(): void {
    this._onUiModeChange?.(this.getUiMode());
  }

  private _stableAfter(key: _SegmentKey): 1 | 3 {
    return key === "loop2" || key === "transFwd" ? 3 : 1;
  }

  private _play(key: _SegmentKey): void {
    this._currentKey = key;
    this._emitUiMode();

    // Важно: stop() перед playSegments снижает шанс "дребезга" на мобильном при быстрых переключениях.
    this._anim.stop();
    this._anim.playSegments(_SEGMENTS[key].frames as [number, number], true);
    this._anim.play();
  }

  /**
   * Вызывается строго на границе сегмента:
   * - для loop-сегментов это "конец одного цикла"
   * - для transition-сегментов это "конец перехода"
   *
   * Тут и выполняется отложенное переключение.
   */
  private _handleBoundary(): void {
    const stable = this._stableAfter(this._currentKey);
    const requested = this._requested;
    this._requested = null;

    // Нет запроса — просто продолжаем текущую "стабильную" анимацию.
    if (requested === null) {
      this._play(stable === 1 ? "loop1" : "loop2");
      return;
    }

    // 1: зациклить первую анимацию
    if (requested === 1) {
      this._play(stable === 1 ? "loop1" : "transBwd");
      return;
    }

    // 3: зациклить вторую анимацию
    if (requested === 3) {
      this._play(stable === 3 ? "loop2" : "transFwd");
      return;
    }

    // 2: переход (вперёд или назад в зависимости от текущего стабильного состояния)
    this._play(stable === 1 ? "transFwd" : "transBwd");
  }
}

