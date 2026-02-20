import type { TimeStep } from "../core/lifecycle";
import type { Result } from "../core/types";
import type { AnimationChannelId, AnimationMixer, ClipHandle, ClipPlayback, CrossFade } from "../animation/clip";
import type { ChelRigManifest } from "../assets/character-rig";

export type TurnDirection = -1 | 0 | 1;

/**
 * Интент анимаций велосипедиста — отдельно от движения и отдельно от input.
 * Это то, что нужно анимационной логике, чтобы корректно запускать/останавливать клипы.
 */
export type BikerAnimationIntent = Readonly<{
  /** 0..1 скорость относительно cruiseSpeed. */
  speed01: number;
  /** Направление поворота (как в input). */
  turn: TurnDirection;
}>;

export type BikerAnimationConfig = Readonly<{
  channels: Readonly<{
    pedals: AnimationChannelId;
    turnBody: AnimationChannelId;
    turnArms: AnimationChannelId;
  }>;

  /**
   * Педали: всегда циклически, но speed клипа зависит от speed01 (плавный разгон).
   */
  pedals: Readonly<{
    fadeInSec: number;
    fadeOutSec: number;
    /** Множитель скорости клипа при speed01=1. */
    maxPlaybackSpeed: number;
  }>;

  /**
   * Повороты:
   * - стартуют только при turn != 0
   * - при отпускании должны вернуться в нейтраль
   * - при смене направления: быстро вернуться в нейтраль и тут же стартовать другой поворот
   */
  turn: Readonly<{
    /** Плавный вход в поворот. */
    fadeIn: CrossFade;
    /** Возврат в нейтраль (короткий). */
    returnToNeutral: CrossFade;
    /** Смена направления: “snap to neutral” быстрее, чем обычный return. */
    reverseSnap: CrossFade;
  }>;
}>;

export type BikerAnimationState = Readonly<{
  activeTurn: TurnDirection;
  pedalsHandle: ClipHandle | null;
}>;

export interface BikerAnimationSystem {
  getState(): BikerAnimationState;

  /**
   * Обновить анимации велосипедиста.
   *
   * Реализация обязана:
   * - держать педали в `repeat` и менять speed по `intent.speed01`
   * - на поворотах включать нужные клипы (body + arms)
   * - при отпускании/смене направления возвращать в “нейтраль” через кроссфейд
   */
  update(params: Readonly<{ mixer: AnimationMixer; manifest: ChelRigManifest; intent: BikerAnimationIntent; step: TimeStep }>): Result<void>;

  /**
   * Сбросить анимации в нейтральное состояние (например, при ресете игры).
   */
  reset(params: Readonly<{ mixer: AnimationMixer }>): void;
}

/**
 * Помощник: собрать playback для педалей по speed01.
 * Это чистый контракт, чтобы удобно тестировать/настраивать.
 */
export interface PedalPlaybackPolicy {
  getPlayback(params: Readonly<{ base: ClipPlayback; speed01: number; maxPlaybackSpeed: number }>): ClipPlayback;
}

