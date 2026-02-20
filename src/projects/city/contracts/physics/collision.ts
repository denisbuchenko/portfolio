import type { Aabb, EntityId, Ray, Transform, Vec3, WorldObjectId } from "../core/types";

export type ColliderId = string & { readonly __brand: "ColliderId" };

export type CollisionLayer = string & { readonly __brand: "CollisionLayer" };

export type ColliderKind = "character" | "npc" | "world" | "sensor";

export type ColliderRef = Readonly<{
  id: ColliderId;
  kind: ColliderKind;
  ownerEntityId?: EntityId;
  ownerWorldObjectId?: WorldObjectId;
  layer?: CollisionLayer;
  isTrigger?: boolean;
}>;

export type Hit = Readonly<{
  collider: ColliderRef;
  point: Vec3;
  normal: Vec3;
  distance: number;
}>;

export type SweepResult = Readonly<{
  /** 0..1 — доля пройденного пути до столкновения. 1 означает “без столкновения”. */
  fraction: number;
  hit: Hit | null;
}>;

export type CollisionShape =
  | Readonly<{ kind: "point" }>
  | Readonly<{ kind: "sphere"; radius: number }>
  | Readonly<{ kind: "aabb"; aabb: Aabb }>
  | Readonly<{
      kind: "meshRef";
      /**
       * Ссылка на меш (например, меш здания в `city.gltf`).
       * Мы не тащим сюда геометрию — реализация может хранить её где угодно.
       */
      ref: Readonly<{ assetName: string; nodeName?: string; meshName?: string }>;
    }>;

/**
 * Контракт системы столкновений.
 * Реализация может быть физическим движком, кастомным broadphase или чем угодно.
 */
export interface CollisionSystem {
  /**
   * Зарегистрировать/создать коллайдер и получить ссылку.
   * Форма/геометрия намеренно не задаётся — это архитектурная заглушка.
   */
  createCollider(
    params: Readonly<{ kind: ColliderKind; layer?: CollisionLayer; isTrigger?: boolean; shape?: CollisionShape }>
  ): ColliderRef;

  destroyCollider(id: ColliderId): void;

  /**
   * Обновить transform коллайдера (например, по transform объекта).
   * Нужен для meshRef и для точек (кончик велосипеда).
   */
  setColliderTransform(id: ColliderId, transform: Transform): void;

  /**
   * Задать/заменить форму коллайдера (например, когда объект “активируется” для коллизий).
   */
  setColliderShape(id: ColliderId, shape: CollisionShape): void;

  /**
   * Проверка пересечений AABB (для “кто рядом”).
   */
  queryAabb(aabb: Aabb, filter?: (c: ColliderRef) => boolean): readonly ColliderRef[];

  /**
   * Лучевой тест.
   */
  raycast(ray: Ray, maxDistance: number, filter?: (c: ColliderRef) => boolean): Hit | null;

  /**
   * “Протаскивание” точки/капсулы по вектору.
   * Мы не задаём форму — контракт описывает общий смысл для CharacterMotor.
   */
  sweep(params: Readonly<{ colliderId: ColliderId; from: Vec3; delta: Vec3 }>): SweepResult;
}

