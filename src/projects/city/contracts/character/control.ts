import type { TimeStep } from "../core/lifecycle";
import type { Vec2 } from "../core/types";
import type { MovementIntent } from "./movement";

/**
 * Снимок ввода. Источник может быть клавиатура/геймпад/тач/AI.
 * “Стек” не задаётся — важен контракт данных.
 */
export type InputSnapshot = Readonly<{
  /**
   * Аналог WASD / стика: (-1..1) по x/y.
   * Интерпретация (локальная/мировая) — задача контроллера.
   */
  moveAxis: Vec2;

  /** Поворот/камера (например, мышь или правый стик). */
  lookAxis?: Vec2;

  sprint?: boolean;
  jump?: boolean;
  interact?: boolean;
}>;

export interface InputSource {
  read(): InputSnapshot;
}

/**
 * Контроллер персонажа: превращает input в MovementIntent + высокоуровневые действия.
 */
export interface CharacterController {
  /**
   * Вернуть “намерение” движения на текущем тике.
   * Можно учитывать состояние камеры, поверхности, стамины и т.п.
   */
  getMovementIntent(input: InputSnapshot, step: TimeStep): MovementIntent;
}

