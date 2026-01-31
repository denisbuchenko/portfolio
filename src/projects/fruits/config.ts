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
