/**
 * Конфигурация для системы фруктов.
 */

/**
 * Настройки одного продукта.
 */
export type ProductConfig = {
  /** Имя продукта из GLTF */
  productName: string;
  /** Количество инстансов */
  count: number;
  /** Размер продукта (диапазон или фиксированное значение) */
  size?: { min: number; max: number } | number;
  /** Позиция (опционально, если не указано - случайная) */
  position?: { x?: number; y?: number; z?: number };
  /** Масштаб (опционально) */
  scale?: number;
  /** Вращение (опционально) */
  rotation?: { x?: number; y?: number; z?: number };
};

/**
 * Полная конфигурация системы фруктов.
 */
export type FruitsConfig = {
  /** URL к GLTF файлу */
  gltfUrl: string;
  /** Цвет фона (hex строка) */
  backgroundColor: string;
  /** Параметры движения (опционально). */
  motion?: {
    /**
     * Направление движения.
     * - если задан `angleDeg`/`angleRad` — вычисляется из угла
     * - иначе используется `direction` (вектор)
     */
    direction?: { x: number; y: number };
    /** Угол направления в градусах (0° = вправо, 90° = вверх). */
    angleDeg?: number;
    /** Угол направления в радианах (0 = вправо, PI/2 = вверх). */
    angleRad?: number;
    /**
     * Скорость в CSS-пикселях/сек. (при наличии dpr конвертируется в world-units/сек)
     * Рекомендуется для бэкграундов, где скорость должна ощущаться одинаково на разных DPI.
     */
    speedCssPxPerSec?: number;
    /**
     * Скорость в world-units/сек. Если задана, имеет приоритет над `speedCssPxPerSec`.
     */
    speedWorldUnitsPerSec?: number;
    /** Разброс множителя скорости по инстансам (для небольшого разнообразия). */
    speedMul?: { min: number; max: number };
  };
  /** Настройки камеры */
  camera: {
    /** Поле зрения (градусы) */
    fov: number;
  };
  /** Список продуктов для отображения */
  products: ProductConfig[];
  /** Seed для детерминированного размещения */
  seed?: number;
};
