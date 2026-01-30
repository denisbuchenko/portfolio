import type { ColorKey } from "../runtimeTypes";
import { CONFIG } from "../../../../config";

export type PuzzleUI = {
  canvas: HTMLCanvasElement;
  statusEl: HTMLDivElement;
  colorsRoot: HTMLDivElement;
  getActiveColor(): ColorKey;
  setActiveColor(c: ColorKey): void;
  destroy(): void;
};

export function mountPuzzleUI(opts: { host: HTMLElement; config: typeof CONFIG }): PuzzleUI {
  const { host, config } = opts;
  host.classList.add("launcher--puzzle");
  host.innerHTML = `
    <div class="puzzle">
      <canvas class="puzzle__canvas"></canvas>
      <div class="puzzle__panel">
        <div class="puzzle__title">Пазл 4×4</div>
        <div class="puzzle__hint">Перетаскивай кусочки мышкой или пальцем.</div>
      </div>
      <div class="puzzle__colors" aria-label="Выбор цвета">
        <button class="puzzle__color puzzle__color--r puzzle__color--active" data-color="r" type="button" aria-label="Красный"></button>
        <button class="puzzle__color puzzle__color--g" data-color="g" type="button" aria-label="Зелёный"></button>
        <button class="puzzle__color puzzle__color--b" data-color="b" type="button" aria-label="Синий"></button>
      </div>
      <div class="puzzle__status" id="puzzle-status">Загрузка...</div>
    </div>
  `;

  const canvas = host.querySelector("canvas.puzzle__canvas") as HTMLCanvasElement | null;
  const statusEl = host.querySelector("#puzzle-status") as HTMLDivElement | null;
  const colorsRoot = host.querySelector(".puzzle__colors") as HTMLDivElement | null;
  if (!canvas) throw new Error("Puzzle canvas not found");
  if (!statusEl) throw new Error("Puzzle status not found");
  if (!colorsRoot) throw new Error("Puzzle colors element not found");
  const colorsRootEl: HTMLDivElement = colorsRoot;

  colorsRootEl.style.setProperty("--puzzle-color-btn-size", `${config.puzzle.ui.colorButtonCssPx}px`);

  let activeColor: ColorKey = "r";

  function syncActiveClass(): void {
    const buttons = Array.from(colorsRootEl.querySelectorAll("button.puzzle__color"));
    for (const b of buttons) {
      const bc = b.getAttribute("data-color") as ColorKey | null;
      if (bc === activeColor) b.classList.add("puzzle__color--active");
      else b.classList.remove("puzzle__color--active");
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    // чтобы нажатия по UI не запускали рисование на канвасе
    e.preventDefault();
    e.stopPropagation();
  };
  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest("button.puzzle__color") as HTMLButtonElement | null;
    if (!btn) return;
    const c = btn.getAttribute("data-color") as ColorKey | null;
    if (!c) return;
    activeColor = c;
    syncActiveClass();
  };

  colorsRootEl.addEventListener("pointerdown", onPointerDown);
  colorsRootEl.addEventListener("click", onClick);

  return {
    canvas,
    statusEl,
    colorsRoot: colorsRootEl,
    getActiveColor: () => activeColor,
    setActiveColor: (c) => {
      activeColor = c;
      syncActiveClass();
    },
    destroy: () => {
      colorsRootEl.removeEventListener("pointerdown", onPointerDown);
      colorsRootEl.removeEventListener("click", onClick);
    }
  };
}


