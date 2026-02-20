import type { Aabb, Result, Transform, Vec3 } from "../core/types";

/**
 * Мы будем работать с `public/city/city.gltf`.
 *
 * Наблюдаемое именование в сцене:
 * - `Building <N>_<Color>_0` — меш/нод варианта здания
 * - `Building <N>_CTRL...` — родитель/группа здания (удобно как “root”)
 * - Отдельная нода `Дорога` (меш дороги)
 */
export type CityGltfNodeName = string & { readonly __brand: "CityGltfNodeName" };

export type BuildingId = string & { readonly __brand: "BuildingId" };

export type BuildingColorVariant = "Blue" | "Orange" | "Red" | "White" | "Unknown";

export type CityBuilding = Readonly<{
  id: BuildingId;
  rootNode: CityGltfNodeName;
  meshNodes: readonly CityGltfNodeName[];
  bounds?: Aabb;
}>;

export type CitySceneIndex = Readonly<{
  /** Все здания сцены. */
  buildings: readonly CityBuilding[];

  /** Нода дороги, если она присутствует (в файле встречается "Дорога"). */
  roadNode?: CityGltfNodeName;

  /** Опциональный root/контейнер (в файле встречается "Empty"). */
  rootNode?: CityGltfNodeName;

  /** Границы карты/сцены (могут быть вычислены по зданиям+дороге). */
  mapBounds?: Aabb;
}>;

export interface CitySceneIndexer {
  /**
   * Построить индекс по загруженному ассету.
   * В контракте ассет — абстрактный, конкретный формат загрузки/парсинга не фиксируем.
   */
  buildIndex(): Result<CitySceneIndex>;
}

/**
 * Утилитарный контракт: переводить скаляр скролла/оси в 3D позицию на карте.
 * Нужен для “камера скроллится только по одной оси”.
 */
export interface MapAxisProjector {
  /** Нормализованный прогресс 0..1 → позиция на карте. */
  progressToPosition(progress01: number): Vec3;
  /** Позиция на карте → нормализованный прогресс 0..1. */
  positionToProgress(pos: Vec3): number;
}

export type WorldAnchor = Readonly<{
  /** Название якоря (например, "start"). */
  name: string;
  position: Vec3;
  transform?: Transform;
}>;

export interface WorldAnchorsProvider {
  /**
   * Дать список якорей (start‑точка, центр карты и т.д.).
   * Источник может быть: ноды сцены, метаданные, конфиг, “UV‑кнопка”.
   */
  getAnchors(): readonly WorldAnchor[];
}

