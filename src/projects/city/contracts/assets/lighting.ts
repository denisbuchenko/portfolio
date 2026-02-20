import type { Result } from "../core/types";

/**
 * В `city.gltf` мы не нашли `KHR_lights_punctual`.
 * Поэтому “свет как в файле” может означать:
 * - запечённый свет/шейдинг в материалах
 * - или ожидаемая конфигурация света задаётся вне glTF
 *
 * Этот контракт оставляет решение реализации, но фиксирует точку входа.
 */
export type LightingPreset = Readonly<{
  kind: "gltfEmbedded" | "enginePreset";
  /**
   * Если `enginePreset`: имя пресета, например "sunnyNoon".
   * Если `gltfEmbedded`: можно оставить пустым.
   */
  name?: string;
  /** Хотим ли тени. */
  shadows: boolean;
  /** “Яркий свет” — просто параметр намерения, не реализация. */
  intensityHint?: number;
}>;

export interface LightingDirector {
  /**
   * Выбрать/вернуть конфигурацию света для сцены.
   */
  getLightingPreset(): Result<LightingPreset>;
}

