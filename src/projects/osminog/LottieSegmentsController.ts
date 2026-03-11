import type { AnimationItem } from "lottie-web";

export type OsminogUiMode = 1 | 2 | 3 | 4;

type _SegmentKey = "segment1" | "segment2" | "segment3" | "still4";

type _Segment = Readonly<{
  frames: readonly [number, number];
}>;

const _FINAL_STILL_FRAME = 608;

const _SEGMENTS: Record<_SegmentKey, _Segment> = {
  segment1: { frames: [0, 400] },
  segment2: { frames: [400, 500] },
  segment3: { frames: [500, 609] },
  still4: { frames: [_FINAL_STILL_FRAME, _FINAL_STILL_FRAME] }
};

export class LottieSegmentsController {
  private _anim: AnimationItem;
  private _currentKey: _SegmentKey = "segment1";
  private _requested: OsminogUiMode | null = null;
  private _disposed = false;
  private _onUiModeChange: ((mode: OsminogUiMode) => void) | null = null;
  private _onSuccessSequenceComplete: (() => void) | null = null;
  private _successSequenceState: "idle" | "pending" | "playing" | "completed" = "idle";

  // handlers (нужны как поля, чтобы корректно отписываться)
  private _handleDataReady = () => {
    if (this._disposed) return;
    this._play("segment1");
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
    if (this._successSequenceState === "pending" || this._successSequenceState === "playing") return;
    if (mode === 4) {
      this._showStillFrame();
      return;
    }
    if (this._currentKey === "still4") {
      this._successSequenceState = "idle";
      this._play(_modeToSegmentKey(mode));
      return;
    }
    if (this._successSequenceState !== "idle") return;
    this._requested = mode;
  }

  getUiMode(): OsminogUiMode {
    if (this._currentKey === "segment1") return 1;
    if (this._currentKey === "segment2") return 2;
    if (this._currentKey === "segment3") return 3;
    return 4;
  }

  onUiModeChange(cb: (mode: OsminogUiMode) => void): () => void {
    this._onUiModeChange = cb;
    cb(this.getUiMode());
    return () => {
      if (this._onUiModeChange === cb) this._onUiModeChange = null;
    };
  }

  onSuccessSequenceComplete(cb: () => void): () => void {
    this._onSuccessSequenceComplete = cb;
    return () => {
      if (this._onSuccessSequenceComplete === cb) this._onSuccessSequenceComplete = null;
    };
  }

  triggerSuccessSequence(): boolean {
    if (this._successSequenceState !== "idle") return false;
    this._requested = null;
    this._successSequenceState = "pending";
    return true;
  }

  private _emitUiMode(): void {
    this._onUiModeChange?.(this.getUiMode());
  }

  private _play(key: _SegmentKey): void {
    if (key === "still4") {
      this._showStillFrame();
      return;
    }

    this._currentKey = key;
    this._emitUiMode();

    // Важно: stop() перед playSegments снижает шанс "дребезга" на мобильном при быстрых переключениях.
    this._anim.stop();
    this._anim.playSegments(_SEGMENTS[key].frames as [number, number], true);
    this._anim.play();
  }

  private _showStillFrame(): void {
    this._currentKey = "still4";
    this._emitUiMode();
    this._anim.stop();
    // После playSegments() у lottie может оставаться локальный диапазон текущего сегмента.
    // Сбрасываем его перед переходом в frozen-state, иначе 2 -> 4 и 3 -> 4
    // могут интерпретировать кадр не от начала всей композиции.
    const animationWithReset = this._anim as AnimationItem & {
      resetSegments?: (forceFlag: boolean) => void;
    };
    animationWithReset.resetSegments?.(true);
    this._anim.goToAndStop(_SEGMENTS.still4.frames[0], true);
  }

  /**
   * Вызывается строго на границе сегмента:
   * после завершения либо проигрываем запрошенный сегмент,
   * либо продолжаем текущий выбранный сегмент по кругу.
   */
  private _handleBoundary(): void {
    if (this._successSequenceState === "pending" && this._currentKey === "segment1") {
      this._successSequenceState = "playing";
      this._play("segment2");
      return;
    }

    if (this._successSequenceState === "playing" && this._currentKey === "segment2") {
      this._play("segment3");
      return;
    }

    if (this._successSequenceState === "playing" && this._currentKey === "segment3") {
      this._successSequenceState = "completed";
      this._showStillFrame();
      this._onSuccessSequenceComplete?.();
      return;
    }

    const requested = this._requested;
    this._requested = null;
    this._play(_modeToSegmentKey(requested ?? this.getUiMode()));
  }
}

function _modeToSegmentKey(mode: OsminogUiMode): _SegmentKey {
  if (mode === 1) return "segment1";
  if (mode === 2) return "segment2";
  if (mode === 3) return "segment3";
  return "still4";
}

