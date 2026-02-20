import type { TimeStep } from "../core/lifecycle";
import type { Transform, Vec3 } from "../core/types";

/**
 * Ввод управления велосипедистом.
 * Сейчас по требованиям — “тап/удержание слева/справа экрана”.
 */
export type BikerSteerInput = Readonly<{
  /** -1 = влево, 0 = прямо, +1 = вправо */
  turn: -1 | 0 | 1;
  /** Сколько секунд удерживаем текущее направление. Нужен для “радиус плавно уменьшается”. */
  holdSec: number;
}>;

export type BikerSpeedProfile = Readonly<{
  /** Сколько стоим на месте перед стартом. */
  idleSec: number; // = 2
  /** За сколько секунд разгоняемся до стабильной скорости. */
  rampSec: number; // = 3
  /** Стабильная скорость (единицы мира/сек). */
  cruiseSpeed: number;
}>;

export type BikerTurnProfile = Readonly<{
  /**
   * Радиус поворота при свежем удержании.
   * Чем меньше радиус — тем сильнее закрутка.
   */
  radiusStart: number;
  /** Минимальный радиус, к которому мы плавно приходим при длительном удержании. */
  radiusMin: number;
  /** За сколько секунд подходим к `radiusMin`. */
  radiusEaseSec: number;
}>;

export type BikerMotionConfig = Readonly<{
  speed: BikerSpeedProfile;
  turn: BikerTurnProfile;
  /**
   * Высота/смещение “точки столкновения” (кончик велосипеда) относительно transform персонажа.
   * Мы оставляем это как контракт, т.к. точка может быть:
   * - либо именованной нодой в `Chel.gltf`
   * - либо вычисляемым оффсетом
   */
  collisionTipLocalOffset?: Vec3;
}>;

export type BikerMotionState = Readonly<{
  /** Текущая скорость по модулю. */
  speed: number;
  /** Текущий радиус поворота (для дебага/телеметрии). */
  turnRadius: number;
  /** Мировое направление вперёд (можно использовать камерой/анимациями). */
  forward: Vec3;
}>;

/**
 * Система движения велосипедиста.
 * Внутри может быть кинематика (дуга по радиусу), может быть физика —
 * но контракт фиксирует вход/выход.
 */
export interface BikerMotionSystem {
  getState(): BikerMotionState;
  update(params: Readonly<{ transform: Transform; input: BikerSteerInput; step: TimeStep }>): Transform;
}

