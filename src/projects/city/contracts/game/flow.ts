import type { TimeStep } from "../core/lifecycle";
import type { Result, Vec3 } from "../core/types";

export type GameMode = "overview" | "focusStart" | "playing" | "crashed";

export type CrashReason = "buildingCollision" | "unknown";

export type GameStartRequest = Readonly<{
  /** Имя якоря, на который летим камерой (например, "start"). */
  startAnchorName: string;
}>;

export type CrashEvent = Readonly<{
  reason: CrashReason;
  at: Vec3;
  tSec: number;
}>;

export type CrashRecoveryConfig = Readonly<{
  /** Сколько секунд показываем “грустный смайлик” перед ресетом. */
  resetDelaySec: number; // = 3
}>;

/**
 * Оркестратор игры: управляет фазами (обзор → зум к старту → игра → краш → ресет).
 * Это “верхний уровень”, который связывает камеры, UI, системы движения/коллизий.
 */
export interface GameFlowDirector {
  getMode(): GameMode;

  requestStart(req: GameStartRequest): Result<void>;
  reportCrash(crash: CrashEvent): void;

  /**
   * Обновить flow. Обычно вызывается каждый кадр.
   */
  update(step: TimeStep): void;
}

