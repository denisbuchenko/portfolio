import type { Result } from "../core/types";

export type ClipName = string & { readonly __brand: "ClipName" };

/**
 * Канал/слой микширования.
 * Пример: "pedals", "turnBody", "turnArms".
 */
export type AnimationChannelId = string & { readonly __brand: "AnimationChannelId" };

export type LoopMode = "once" | "repeat" | "pingpong";

export type ClipPlayback = Readonly<{
  loop: LoopMode;
  /** Скорость воспроизведения (1 = нормально). Может меняться для “ускорения педалей”. */
  speed: number;
  /** Начальная фаза, 0..1 (опционально). */
  startPhase01?: number;
}>;

export type CrossFade = Readonly<{
  /** Длительность кроссфейда. */
  durationSec: number;
  /**
   * Если `true`, в начале кроссфейда целевой клип стартует с 0.
   * Если `false`, можно сохранять фазу (например, для циклов).
   */
  restartTarget?: boolean;
}>;

export interface ClipHandle {
  readonly clip: ClipName;
  stop(): void;
  setWeight(weight01: number): void;
  setSpeed(speed: number): void;
  /** 0..1 нормализованный seek. */
  seek(phase01: number): void;
}

/**
 * “Микшер” анимаций — слой, который умеет играть клипы по имени,
 * управлять весами и делать кроссфейды.
 */
export interface AnimationMixer {
  /**
   * Запустить клип. Возвращает handle, через который можно менять speed/weight/seek.
   */
  play(clip: ClipName, playback: ClipPlayback, channel?: AnimationChannelId): Result<ClipHandle>;

  /**
   * Кроссфейд: плавно перейти на другой клип.
   * Реализация сама решает, “какой клип сейчас активен” для данного канала/слоя.
   */
  crossFadeTo(
    clip: ClipName,
    playback: ClipPlayback,
    fade: CrossFade,
    channel?: AnimationChannelId
  ): Result<ClipHandle>;

  stop(clip: ClipName, channel?: AnimationChannelId): void;
  stopAll(channel?: AnimationChannelId): void;
}

