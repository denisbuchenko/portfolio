import type { TimeStep } from "../core/lifecycle";
import type { Result, Vec3 } from "../core/types";

export type PositionGoalId = string & { readonly __brand: "PositionGoalId" };

export type PositionGoal = Readonly<{
  id: PositionGoalId;
  target: Vec3;
  /**
   * Радиус “достижения”. Как мерять расстояние (2D/3D) — решает реализация.
   */
  radius: number;
}>;

export type PositionReachedEvent = Readonly<{
  goalId: PositionGoalId;
  reachedAt: Vec3;
  tSec: number;
}>;

/**
 * Система “достиг позиции”.
 * Важно отделить от движения: движение меняет позицию, а эта система только оценивает достижение.
 */
export interface ReachPositionSystem {
  createGoal(goal: Omit<PositionGoal, "id"> & Partial<Pick<PositionGoal, "id">>): Result<PositionGoal>;
  removeGoal(id: PositionGoalId): void;

  /**
   * Обновить систему и вернуть список достигнутых целей за тик.
   * Можно использовать для триггеров, квестов, скриптов.
   */
  update(params: Readonly<{ position: Vec3; step: TimeStep }>): readonly PositionReachedEvent[];

  /**
   * Текущий статус конкретной цели.
   */
  isReached(id: PositionGoalId): boolean;
}

