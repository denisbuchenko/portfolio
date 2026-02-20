import type { TimeStep } from "./lifecycle";

export type TimeoutId = string & { readonly __brand: "TimeoutId" };

/**
 * Планировщик таймеров. Нужен для:
 * - “показать окошко краша и через 3 секунды ресет”
 * - любых будущих задержек/скриптов
 */
export interface Scheduler {
  setTimeout(cb: () => void, delaySec: number): TimeoutId;
  clearTimeout(id: TimeoutId): void;

  /**
   * Обновить планировщик (если он “игровой”, а не window.setTimeout).
   * Можно реализовать через накопление времени.
   */
  update(step: TimeStep): void;
}

