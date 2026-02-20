import type { TimeStep } from "../core/lifecycle";
import type { Result } from "../core/types";
import type { AnimationMixer, ClipHandle, ClipName, ClipPlayback, CrossFade } from "./clip";

/**
 * Высокоуровневый контроллер анимаций (state machine / policy).
 * Он получает “намерение” (intent) и управляет микшером.
 */
export interface AnimationController<TIntent> {
  update(params: Readonly<{ mixer: AnimationMixer; intent: TIntent; step: TimeStep }>): void;
}

/**
 * Контракт, удобный для тестирования turn-логики:
 * отдельно выделяем операции, которые контроллер может “попросить” у микшера.
 * (Реализация может адаптировать к конкретному движку.)
 */
export interface AnimationOps {
  play(clip: ClipName, playback: ClipPlayback): Result<ClipHandle>;
  crossFadeTo(clip: ClipName, playback: ClipPlayback, fade: CrossFade): Result<ClipHandle>;
  stop(clip: ClipName): void;
}

