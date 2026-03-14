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

export function mountPuzzleUI(opts: { 
  host: HTMLElement; 
  config: typeof CONFIG;
  onColorSelect?: (color: ColorKey, wasAlreadyActive: boolean) => void;
}): PuzzleUI {
  const { host, config } = opts;
  host.classList.add("launcher--puzzle");
  host.innerHTML = `
    <div class="puzzle">
      <canvas class="puzzle__canvas"></canvas>
      <div class="puzzle__colors" aria-label="Выбор цвета">
        <button class="puzzle__color puzzle__color--r puzzle__color--active" data-color="r" type="button" aria-label="Красный"></button>
        <button class="puzzle__color puzzle__color--g" data-color="g" type="button" aria-label="Зелёный"></button>
        <button class="puzzle__color puzzle__color--b" data-color="b" type="button" aria-label="Синий"></button>
      </div>
      <div class="puzzle__status" id="puzzle-status"></div>
    </div>
  `;

  const canvas = host.querySelector("canvas.puzzle__canvas") as HTMLCanvasElement | null;
  const statusEl = host.querySelector("#puzzle-status") as HTMLDivElement | null;
  const colorsRoot = host.querySelector(".puzzle__colors") as HTMLDivElement | null;
  if (!canvas) throw new Error("Puzzle canvas not found");
  if (!statusEl) throw new Error("Puzzle status not found");
  if (!colorsRoot) throw new Error("Puzzle colors element not found");
  const colorsRootEl: HTMLDivElement = colorsRoot;

  colorsRootEl.style.setProperty("--puzzle-color-btn-size", `${Math.max(config.puzzle.ui.colorButtonCssPx, 26)}px`);

  let activeColor: ColorKey = "r";

  const buttons = Array.from(
    colorsRootEl.querySelectorAll<HTMLButtonElement>("button.puzzle__color"),
  );

  function _syncActiveClass(): void {
    for (const b of buttons) {
      b.classList.toggle(
        "puzzle__color--active",
        b.getAttribute("data-color") === activeColor,
      );
    }
  }

  function _selectColor(btn: HTMLButtonElement): void {
    const c = btn.getAttribute("data-color") as ColorKey | null;
    if (!c) return;
    const wasAlreadyActive = c === activeColor;
    activeColor = c;
    _syncActiveClass();
    opts.onColorSelect?.(c, wasAlreadyActive);
  }

  /** Общий обработчик: блокируем всплытие к canvas, обновляем цвет. */
  function _handleSelect(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    const btn = (e.currentTarget as HTMLElement).closest(
      "button.puzzle__color",
    ) as HTMLButtonElement | null;
    if (btn) _selectColor(btn);
  }

  // Вешаем на каждую кнопку отдельно, чтобы мобильный repaint класса был мгновенным.
  for (const btn of buttons) {
    btn.addEventListener("pointerdown", _handleSelect);
    btn.addEventListener("touchstart", _handleSelect, { passive: false });
  }

  return {
    canvas,
    statusEl,
    colorsRoot: colorsRootEl,
    getActiveColor: () => activeColor,
    setActiveColor: (c) => {
      activeColor = c;
      _syncActiveClass();
    },
    destroy: () => {
      for (const btn of buttons) {
        btn.removeEventListener("pointerdown", _handleSelect);
        btn.removeEventListener("touchstart", _handleSelect);
      }
    }
  };
}


