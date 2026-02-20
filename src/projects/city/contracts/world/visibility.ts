import type { TimeStep } from "../core/lifecycle";
import type { Vec3, WorldObjectId } from "../core/types";

/**
 * “Окно видимости” для карты.
 * По требованиям: камера в обзоре двигается по одной оси, значит можно описать видимость как отрезок.
 */
export type VisibilityWindow = Readonly<{
  /** Центр окна (например, позиция камеры по оси). */
  center: Vec3;
  /** Радиус/полуразмер видимой зоны (можно трактовать по одной оси). */
  halfSize: Vec3;
}>;

export type VisibilityDelta = Readonly<{
  becameVisible: readonly WorldObjectId[];
  becameHidden: readonly WorldObjectId[];
}>;

/**
 * Система, которая решает “какие объекты мира должны быть отрисованы”.
 * Реализация может базироваться на AABB, фрустуме, гриде — контракт не фиксирует.
 */
export interface VisibilitySystem {
  getVisibleSet(): ReadonlySet<WorldObjectId>;
  update(params: Readonly<{ window: VisibilityWindow; step: TimeStep }>): VisibilityDelta;
}

/**
 * Аниматор появления/скрытия объектов мира.
 * По требованиям: дом появляется так:
 * - когда входит в видимость: scale.z = 0 → scale.z = target (плавно)
 * - когда выходит: обратно к 0
 */
export interface WorldAppearAnimator {
  onBecameVisible(ids: readonly WorldObjectId[], step: TimeStep): void;
  onBecameHidden(ids: readonly WorldObjectId[], step: TimeStep): void;
}

