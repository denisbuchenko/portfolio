import type { Transform, WorldObjectId } from "../core/types";

/**
 * Система трансформаций объектов мира.
 * Отдельна от World (который может быть иммутабельным представлением) и от рендера.
 */
export interface WorldTransformSystem {
  /**
   * Задать transform объекта мира.
   * Реализация сама решает: “поставить сразу” или “анимировать/интерполировать”.
   */
  setWorldObjectTransform(id: WorldObjectId, transform: Transform): void;

  /**
   * Получить текущий transform (после всех применённых эффектов).
   */
  getWorldObjectTransform(id: WorldObjectId): Transform | null;
}

