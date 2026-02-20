import type { TimeStep } from "../core/lifecycle";
import type { Transform, Vec3 } from "../core/types";
import type { Character } from "./character";

/**
 * Входы для движения — то, что “хочет” контроллер.
 * Это не про физику; это “намерение” (intent).
 */
export type MovementIntent = Readonly<{
  /** Направление в плоскости (обычно XZ) или в мировых координатах — решает реализация. */
  move: Vec3;
  /** Хотим бежать/идти/красться — в будущем. */
  sprint?: boolean;
  /** Прыжок/рывок — в будущем. */
  jump?: boolean;
}>;

export type MovementState = Readonly<{
  velocity: Vec3;
  isGrounded: boolean;
}>;

/**
 * CharacterMotor отвечает за “переместить персонажа в мире”, учитывая столкновения.
 * Он не знает про input — только про intent и физические ограничения.
 */
export interface CharacterMotor {
  getState(): MovementState;

  /**
   * Применить движение к персонажу (может менять его transform).
   * Возвращает новый transform (после столкновений).
   */
  step(character: Character, intent: MovementIntent, step: TimeStep): Transform;
}

