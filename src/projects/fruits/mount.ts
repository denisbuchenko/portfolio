/**
 * Главная функция монтирования проекта фруктов.
 */

import { FruitsProject } from "./products";
import { createFruitsUI } from "./ui";
import { createFruitsRenderer, resizeRenderer } from "./renderer";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";
import type { FruitsConfig } from "./config";

/**
 * Монтирует проект фруктов в указанный элемент.
 *
 * @param host - Родительский элемент для монтирования
 */
export async function mountFruitsProject(host: HTMLElement): Promise<void> {
  // UI
  const ui = createFruitsUI(host);

  // Рендер
  const renderer = createFruitsRenderer(ui.canvas);

  // Создаем проект
  const project = new FruitsProject();

  // Функция resize
  function resize(): { w: number; h: number; dpr: number } {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    project.resize(w, h);
    return { w, h, dpr };
  }

  // Загрузка моделей
  ui.statusEl.textContent = "Загружаю модели фруктов…";
  const products = await project.load(CONFIG.puzzle.background3d.gltfUrl);
  console.log(`Загружено продуктов: ${products.length}`);

  // Создаем простой конфиг для демонстрации
  // Берем несколько случайных продуктов
  const sampleProducts = products.slice(0, Math.min(5, products.length));
  console.log(`Используем продуктов: ${sampleProducts.length}`, sampleProducts.map(p => p.name));

  const config: FruitsConfig = {
    gltfUrl: CONFIG.puzzle.background3d.gltfUrl,
    backgroundColor: "#00506f",
    camera: {
      fov: CONFIG.puzzle.background3d.camera.fovDeg
    },
    products: sampleProducts.map((p, i) => ({
      productName: p.name,
      count: 3 + i * 2,
      size: { min: 2.0, max: 4.0 } // Увеличиваем размер продуктов
    })),
    seed: CONFIG.puzzle.background3d.seed
  };

  // Настройка
  const { w, h } = resize();
  project.setup(config, w, h);

  ui.statusEl.textContent = "Готово!";

  // Рендер-луп
  let lastT = performance.now();
  function frame(tNow: number): void {
    requestAnimationFrame(frame);

    const dt = Math.min(0.033, Math.max(0.001, (tNow - lastT) * 0.001));
    lastT = tNow;
    const timeSec = tNow * 0.001;

    // Resize при изменении размеров
    const { dpr } = resize();

    // Обновление анимации и рендер
    project.update(timeSec);
    project.render(renderer);

    // Обновление статуса
    ui.statusEl.textContent = `Фрукты • dt=${(dt * 1000).toFixed(1)}ms • DPR=${dpr.toFixed(2)}`;
  }

  // Запуск рендер-лупа
  requestAnimationFrame(frame);

  // Обработка resize окна
  window.addEventListener("resize", () => resize());
}
