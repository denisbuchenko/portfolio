import type { TimeStep } from "../core/lifecycle";
import type { Result, Vec3 } from "../core/types";
import type { CameraAnimator, CameraRig, CameraTarget } from "./camera";

/**
 * Источник скролла для “обзорной” камеры.
 * Реализация может читать window.scrollY / touch-drag / любой UI.
 */
export interface ScrollSource {
  /** Нормализованный прогресс 0..1 вдоль карты. */
  getProgress01(): number;
}

/**
 * Трек обзора: позволяет начать камеру “за пределами карты”,
 * пролететь карту целиком и снова выйти за пределы, но с ограничением.
 */
export type OverviewTrack = Readonly<{
  /** Насколько “до” карты камера стартует (в долях длины карты). */
  prePadding01: number;
  /** Насколько “после” карты камера может улететь (в долях длины карты). */
  postPadding01: number;
}>;

export type CameraExtraTransform = Readonly<{
  /**
   * Доп. смещение камеры.
   * Рекомендовано трактовать как локальный оффсет камеры (вправо/вверх/вперёд).
   */
  positionOffset: Readonly<{ x: number; y: number; z: number }>;
  /** Доп. поворот камеры в градусах (pitch/yaw/roll). */
  rotationOffsetDeg: Readonly<{ x: number; y: number; z: number }>;
}>;

export type OverviewCameraConfig = Readonly<{
  /** Цель: "края карты по краям экрана" по горизонтали. */
  fitHorizontally: boolean;
  /** Ограничение движения, чтобы нельзя было "бесконечно вниз". */
  clamp: boolean;
  /** Трек обзора с padding'ами. */
  track?: OverviewTrack;
  /** Ручная подстройка камеры (смещение/поворот). */
  extraTransform?: CameraExtraTransform;
  /** true = PerspectiveCamera, false = OrthographicCamera */
  usePerspective?: boolean;
  /** Размер ортхо-фрустума (если usePerspective = false). */
  orthoViewSize?: number;
}>;

export type FocusStartConfig = Readonly<{
  /** Сколько секунд летим/приближаемся к старт-точке. */
  travelSec: number;
  /** Переход к игровому виду (диагональ как в Diablo). */
  gameplayPitchDeg: number;
  gameplayDistance: number;
}>;

export interface CityCameraDirector {
  /**
   * Фаза обзора: камера зависит от скролла по одной оси.
   */
  updateOverview(params: Readonly<{ rig: CameraRig; animator: CameraAnimator; scroll: ScrollSource; step: TimeStep }>): void;

  /**
   * Запустить полёт к старт-точке.
   */
  beginFocusStart(params: Readonly<{ startPosition: Vec3; config: FocusStartConfig }>): Result<void>;

  /**
   * Обновить полёт/зум к старту. Возвращает `true`, когда фаза завершилась.
   */
  updateFocusStart(params: Readonly<{ rig: CameraRig; animator: CameraAnimator; step: TimeStep }>): boolean;

  /**
   * Игровая фаза: камера следует за целью (велосипедист) в диагональном виде.
   */
  updateGameplay(params: Readonly<{ rig: CameraRig; animator: CameraAnimator; target: CameraTarget; step: TimeStep }>): void;
}

