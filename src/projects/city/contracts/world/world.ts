import type { Aabb, Result, Transform, Vec3, WorldObjectId } from "../core/types";

/**
 * Объект мира: “то, во что можно упереться / что можно анимировать / что можно трансформировать”.
 * Это не про рендер и не про физику — только идентичность и геометрию/трансформ.
 */
export interface WorldObject {
  readonly id: WorldObjectId;
  readonly name: string;
  readonly tags: readonly string[];

  getTransform(): Transform;
  getBounds(): Aabb | null;
}

export interface World {
  /**
   * Возвращает объект мира по id, если он существует.
   */
  getObject(id: WorldObjectId): WorldObject | null;

  /**
   * Примитивный запрос по AABB: вернуть объекты, чьи bounds пересекают `area`.
   * Реализация может быть grid/quadtree/bvh — контракт не задаёт.
   */
  queryAabb(area: Aabb): readonly WorldObject[];

  /**
   * Поиск ближайшего “опорного” объекта (например, spawn marker, waypoint).
   * Это **не** навигация — просто запрос.
   */
  findNearest(position: Vec3, predicate: (obj: WorldObject) => boolean): WorldObject | null;
}

/**
 * Результат создания мира — объект `World` + список ключевых объектов (например, точки спавна).
 */
export type WorldBuild = Readonly<{
  world: World;
  anchors?: Readonly<Record<string, WorldObjectId>>;
}>;

export type WorldBlueprint = Readonly<{
  /**
   * В будущем здесь можно хранить “описание” мира (сцены), но пока это контракт.
   * Например: seed, имя карты, набор слоёв/чанков.
   */
  name: string;
  seed?: number;
}>;

export interface WorldFactory {
  build(blueprint: WorldBlueprint): Result<WorldBuild>;
}

