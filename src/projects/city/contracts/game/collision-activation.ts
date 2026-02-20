import type { TimeStep } from "../core/lifecycle";
import type { Aabb, Vec3, WorldObjectId } from "../core/types";

/**
 * Правило активации коллизий для объектов мира.
 * По описанию: дом активируется, когда игрок близко (по радиусу),
 * и тогда коллизия считается “по мешу”.
 */
export type ProximityActivationRule = Readonly<{
  /** Радиус включения. */
  enableRadius: number;
  /** Радиус выключения (обычно чуть больше/меньше для гистерезиса). */
  disableRadius: number;
}>;

export type ActiveSetDelta = Readonly<{
  enabled: readonly WorldObjectId[];
  disabled: readonly WorldObjectId[];
}>;

export interface CollisionActivationSystem {
  /**
   * Обновить активный набор “коллидируемых” домов вокруг игрока.
   * Возвращает, какие объекты были включены/выключены на этом тике.
   */
  update(params: Readonly<{ playerPosition: Vec3; step: TimeStep }>): ActiveSetDelta;

  /**
   * Получить AABB вокруг игрока, который используется как broadphase‑запрос.
   * Это полезно для интеграции с `World.queryAabb`.
   */
  getBroadphaseAabb(playerPosition: Vec3): Aabb;
}

