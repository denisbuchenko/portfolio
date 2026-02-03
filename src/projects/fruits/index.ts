/**
 * 🍎 Фруктовый рендерер — оптимизированная версия
 *
 * Код разделён по файлам:
 * ├── ./core/utils.ts          (математика, рандом, фильтрация)
 * ├── ./core/scene.ts          (FruitsScene, ProductPlacement, ProductFactory, renderer)
 * ├── ./core/instancing.ts     (работа с инстансами)
 * ├── ./background/renderer.ts (BackgroundRenderer)
 * ├── ./debug/texture.ts       (showTextureDebug)
 * ├── ./project.ts             (FruitsProject)
 * └── ./mount.ts               (mountFruitsProject)
 */

// Реэкспорт всех публичных API из модулей
export * from "./core/utils";
export * from "./core/scene";
export * from "./core/instancing";
export * from "./debug/texture";
export * from "./background/renderer";
export * from "./background/maskedRenderer";
export * from "./project";
export * from "./mount";

// Реэкспорт типов
export type { FruitBackgroundRenderer } from "./types";
