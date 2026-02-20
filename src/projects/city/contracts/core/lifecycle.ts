export interface Disposable {
  dispose(): void;
}

export interface Updatable {
  update(step: TimeStep): void;
}

/**
 * Временной шаг симуляции.
 * - `dtSec`: дельта времени (сек)
 * - `tSec`: время с начала (сек)
 * - `frame`: порядковый номер кадра/тика
 */
export type TimeStep = Readonly<{
  dtSec: number;
  tSec: number;
  frame: number;
}>;

