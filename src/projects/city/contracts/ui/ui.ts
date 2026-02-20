import type { Result, Vec2 } from "../core/types";

/**
 * UI-оверлей при аварии: “грустный смайлик”, затем авто-ресет через 3 секунды.
 */
export interface CrashOverlay {
  show(): void;
  hide(): void;
}

/**
 * Кнопка Start, которая “привязана к миру”.
 * В требованиях это описано как “UV кнопка start” — не фиксируем реализацию,
 * но фиксируем контракт: показать на экране в координате и дать событие клика.
 */
export interface StartButton {
  setVisible(visible: boolean): void;
  setScreenPosition(px: Vec2): void;
  onClick(handler: () => void): void;
}

/**
 * Проектор “мировая позиция → экранные пиксели”.
 * Реализация зависит от камеры/рендера.
 */
export interface WorldToScreenProjector {
  project(worldPosition: Readonly<{ x: number; y: number; z: number }>): Result<Vec2>;
}

