import type { TimeStep } from "../core/lifecycle";
import type { Result, Transform, Vec3, WorldObjectId } from "../core/types";
import type { CollisionShape, CollisionSystem, ColliderRef } from "../physics/collision";
import type { CitySceneIndex } from "../assets/city-scene";

/**
 * “Точка столкновения” велосипедиста — кончик велосипеда.
 * Её можно получать:
 * - из именованной ноды/кости (если появится в rig)
 * - из оффсета относительно transform персонажа
 */
export interface BikerCollisionTipProvider {
  getTipWorldPosition(params: Readonly<{ bikerTransform: Transform }>): Vec3;
}

export type BuildingCollisionBinding = Readonly<{
  buildingId: WorldObjectId;
  collider: ColliderRef;
  /** Форма коллизии здания (как правило meshRef по ноде/мешу). */
  shape: CollisionShape;
}>;

/**
 * Биндинг коллизий домов:
 * - создаёт коллайдеры (или лениво создаёт при активации)
 * - подставляет meshRef форму при входе в proximity
 */
export interface BuildingCollisionBinder {
  /**
   * Инициализировать биндинг на основе индекса сцены.
   * Здесь “buildingId” — это id мира (может соответствовать WorldObjectId).
   */
  init(params: Readonly<{ scene: CitySceneIndex; collision: CollisionSystem }>): Result<void>;

  /**
   * Активировать mesh-коллизию для заданных домов.
   */
  enable(buildings: readonly WorldObjectId[], step: TimeStep): void;

  /**
   * Деактивировать mesh-коллизию (например, заменить на sphere/aabb или убрать вовсе).
   */
  disable(buildings: readonly WorldObjectId[], step: TimeStep): void;
}

