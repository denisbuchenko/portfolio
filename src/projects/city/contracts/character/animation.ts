import type { TimeStep } from "../core/lifecycle";
import type { Transform } from "../core/types";
import type { Character } from "./character";
import type { MovementState } from "./movement";

export type AnimationState = Readonly<{
  /** Идентификатор текущего клипа/состояния (например, "idle", "run", "jump"). */
  state: string;
  /** 0..1 нормализованная фаза или что-то аналогичное — по договорённости. */
  phase?: number;
}>;

/**
 * Контракт анимаций персонажа.
 * Он не привязывается к конкретному “анимационному графу”, но задаёт входы/выходы.
 */
export interface CharacterAnimationController {
  getState(): AnimationState;

  /**
   * Обновить анимацию по текущему состоянию персонажа/движения.
   * Реализация может:
   * - обновить внутренний граф
   * - вернуть “предлагаемый” визуальный transform (например, корень/ориентация модели)
   */
  update(params: Readonly<{ character: Character; movement: MovementState; step: TimeStep }>): Transform | null;
}

