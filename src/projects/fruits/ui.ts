/**
 * UI компоненты для проекта фруктов.
 */

export type FruitsUI = {
  /** Canvas элемент для рендера */
  canvas: HTMLCanvasElement;
  /** Элемент статуса (показывает информацию о загрузке/рендере) */
  statusEl: HTMLDivElement;
};

/**
 * Создаёт и монтирует UI для проекта фруктов.
 *
 * @param host - Родительский элемент, куда будет вставлен UI
 * @returns Объект с canvas и statusEl
 */
export function createFruitsUI(host: HTMLElement): FruitsUI {
  host.classList.add("launcher--puzzle");
  host.innerHTML = `
    <div class="puzzle">
      <canvas class="puzzle__canvas"></canvas>
      <div class="puzzle__panel">
        <div class="puzzle__title">Фрукты (debug)</div>
        <div class="puzzle__hint">Показывает все объекты из glTF рандомно на экране.</div>
      </div>
      <div class="puzzle__status" id="puzzle-status">Загрузка...</div>
    </div>
  `;

  const canvas = host.querySelector("canvas.puzzle__canvas") as HTMLCanvasElement | null;
  const statusEl = host.querySelector("#puzzle-status") as HTMLDivElement | null;

  if (!canvas) throw new Error("Fruits canvas not found");
  if (!statusEl) throw new Error("Fruits status not found");

  return { canvas, statusEl };
}
