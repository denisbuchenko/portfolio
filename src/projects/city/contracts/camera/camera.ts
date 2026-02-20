import type { TimeStep } from "../core/lifecycle";
import type { Transform, Vec3 } from "../core/types";

/**
 * Камера как “риг”: состояние, которое можно анимировать (позиция/ориентация/фов и т.п).
 * Мы не задаём математику камеры конкретного движка — только контракт.
 */
export type CameraState = Readonly<{
  transform: Transform;
  fovDeg?: number;
}>;

export type CameraTarget = Readonly<{
  /** Куда камера “смотрит/следует” (например, точка персонажа). */
  focusPoint: Vec3;
  /** Опционально: желаемая ориентация (например, направление взгляда персонажа). */
  facing?: Vec3;
}>;

export interface CameraRig {
  getState(): CameraState;
  setState(state: CameraState): void;
}

/**
 * Аниматор камеры: обновляет риг, следуя цели (персонаж/сцена/скрипт).
 */
export interface CameraAnimator {
  update(params: Readonly<{ rig: CameraRig; target: CameraTarget; step: TimeStep }>): CameraState;
}

