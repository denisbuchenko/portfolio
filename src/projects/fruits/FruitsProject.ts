import { CONFIG } from "../../config";
import { getDpr } from "../puzzle/app/utils";
import { createFruitsUI } from "./ui";
import { createFruitsRenderer, resizeRenderer } from "./renderer";
import { createFruitBackgroundRenderer, type FruitBackgroundRenderer } from "./core/index";

/**
 * Главная функция монтирования проекта фруктов.
 *
 * Что делает:
 * 1. Создаёт UI (canvas + статус)
 * 2. Настраивает WebGL рендер
 * 3. Загружает и компонует 3D модели фруктов
 * 4. Запускает рендер-луп с автопереключением пресетов
 *
 * @param host - Родительский элемент для монтирования
 */
export async function mountFruitsProject(host: HTMLElement): Promise<void> {
  // UI
  const ui = createFruitsUI(host);

  // Рендер
  const renderer = createFruitsRenderer(ui.canvas);

  // Рендерер фруктов (загрузка и управление фруктами)
  const scene: FruitBackgroundRenderer = createFruitBackgroundRenderer({ config: CONFIG.puzzle.background3d, ui });

  // Функция resize (обновляет canvas и сцену)
  function resize(): { w: number; h: number; dpr: number } {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    scene.resize(w, h, dpr);
    return { w, h, dpr };
  }

  // Загрузка моделей
  ui.statusEl.textContent = "Загружаю пресеты фруктов…";
  await scene.load();

  // Состояние для автопереключения пресетов (bits=1..7)
  let activeBits: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1;
  let lastSwitchSec = 0;
  let lastW = 0;
  let lastH = 0;

  // Рендер-луп
  let lastT = performance.now();
  function frame(tNow: number): void {
    requestAnimationFrame(frame);

    const dt = Math.min(0.033, Math.max(0.001, (tNow - lastT) * 0.001));
    lastT = tNow;
    const timeSec = tNow * 0.001;

    // Resize при изменении размеров
    const { w, h, dpr } = resize();
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
    }

    // Автопереключение пресетов для превью (каждые 2.4 сек)
    if (timeSec - lastSwitchSec > 2.4) {
      activeBits = (((activeBits % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7);
      lastSwitchSec = timeSec;
    }

    // Обновление анимации и рендер
    scene.update(timeSec, dpr);
    scene.renderLayerToScreen(renderer, activeBits);

    // Обновление статуса
    ui.statusEl.textContent = `Пресет bits=${activeBits} • dt=${(dt * 1000).toFixed(1)}ms • DPR=${dpr.toFixed(2)}`;
  }

  // Запуск рендер-лупа
  requestAnimationFrame(frame);

  // Обработка resize окна
  window.addEventListener("resize", () => resize());
}
