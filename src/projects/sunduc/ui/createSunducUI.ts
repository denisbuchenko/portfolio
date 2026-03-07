import { SUNDUC_CONFIG } from "../config";

export type SunducUI = {
  readonly canvas: HTMLCanvasElement;
  readonly canvasWrap: HTMLDivElement;
  setStatus(text: string): void;
  setButtonsEnabled(enabled: boolean): void;
  setClipButtonActive(clipName: string, active: boolean): void;
  renderAnimationControls(options: {
    stoneClipNames: string[];
    sequenceClipNames: string[];
    summary: string;
    onToggleClip: (clipName: string) => void;
    onResetAll: () => void;
  }): void;
  dispose(): void;
};

type CreateSunducUIOptions = {
  host: HTMLElement;
  embedded: boolean;
  onMenu: () => void;
};

export function createSunducUI(options: CreateSunducUIOptions): SunducUI {
  const host = options.host;
  host.innerHTML = "";
  host.style.display = "block";
  host.style.padding = "0";
  host.classList.add("launcher--puzzle");

  const root = document.createElement("div");
  root.className = `sunduc${options.embedded ? " sunduc--embedded" : ""}`;
  _applyCssVars(root);

  const infoRows = SUNDUC_CONFIG.paragraphs
    .map((paragraph) => `<p class="sunduc__paragraph">${paragraph}</p>`)
    .join("");
  const badges = SUNDUC_CONFIG.badges.map((badge) => `<span class="sunduc__badge">${badge}</span>`).join("");

  root.innerHTML = `
    <div class="sunduc__info">
      <div class="sunduc__info-card">
        <div class="sunduc__eyebrow">${SUNDUC_CONFIG.eyebrow}</div>
        <h1 class="sunduc__title">${SUNDUC_CONFIG.title}</h1>
        <p class="sunduc__lead">${SUNDUC_CONFIG.lead}</p>
        <div class="sunduc__paragraphs">${infoRows}</div>
        <div class="sunduc__badges">${badges}</div>
      </div>
      ${
        options.embedded
          ? ""
          : `<button class="btn sunduc__menu" type="button" aria-label="Вернуться в меню">В меню</button>`
      }
    </div>
    <div class="sunduc__viewer">
      <div class="sunduc__canvas-wrap">
        <canvas class="sunduc__canvas"></canvas>
        <div class="sunduc__status">Загрузка…</div>
        <div class="sunduc__gesture">Крути модель пальцем или мышкой</div>
      </div>
    </div>
    <aside class="sunduc__debug${SUNDUC_CONFIG.debug.showPanel ? "" : " sunduc__debug--hidden"}">
      <div class="sunduc__debug-title">Debug Animations</div>
      <div class="sunduc__debug-summary">Считываю клипы…</div>
      <div class="sunduc__debug-group">
        <div class="sunduc__debug-label">Камни</div>
        <div class="sunduc__debug-grid sunduc__debug-stones"></div>
      </div>
      <div class="sunduc__debug-group">
        <div class="sunduc__debug-label">Сценарий</div>
        <div class="sunduc__debug-grid sunduc__debug-sequence"></div>
      </div>
    </aside>
  `;

  host.appendChild(root);

  const canvas = _requireElement(root, ".sunduc__canvas") as HTMLCanvasElement;
  const canvasWrap = _requireElement(root, ".sunduc__canvas-wrap") as HTMLDivElement;
  const status = _requireElement(root, ".sunduc__status") as HTMLDivElement;
  const debugSummary = _requireElement(root, ".sunduc__debug-summary") as HTMLDivElement;
  const stoneButtonsWrap = _requireElement(root, ".sunduc__debug-stones") as HTMLDivElement;
  const sequenceButtonsWrap = _requireElement(root, ".sunduc__debug-sequence") as HTMLDivElement;
  const menuButton = root.querySelector(".sunduc__menu") as HTMLButtonElement | null;

  const clipButtons = new Map<string, HTMLButtonElement>();
  const onMenuClick = (): void => options.onMenu();
  menuButton?.addEventListener("click", onMenuClick);

  return {
    canvas,
    canvasWrap,
    setStatus(text: string): void {
      status.textContent = text;
    },
    setButtonsEnabled(enabled: boolean): void {
      const buttons = root.querySelectorAll(".sunduc__debug button");
      buttons.forEach((button) => {
        (button as HTMLButtonElement).disabled = !enabled;
      });
    },
    setClipButtonActive(clipName: string, active: boolean): void {
      const button = clipButtons.get(clipName);
      if (!button) return;

      button.classList.toggle("btn--active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    },
    renderAnimationControls(renderOptions): void {
      stoneButtonsWrap.innerHTML = "";
      sequenceButtonsWrap.innerHTML = "";
      clipButtons.clear();

      debugSummary.textContent = renderOptions.summary;

      for (const clipName of renderOptions.stoneClipNames) {
        stoneButtonsWrap.appendChild(_createClipButton(clipName, renderOptions.onToggleClip, clipButtons));
      }

      const resetButton = document.createElement("button");
      resetButton.className = "btn sunduc__debug-btn";
      resetButton.type = "button";
      resetButton.textContent = "Reset all";
      resetButton.addEventListener("click", () => renderOptions.onResetAll());
      sequenceButtonsWrap.appendChild(resetButton);

      for (const clipName of renderOptions.sequenceClipNames) {
        sequenceButtonsWrap.appendChild(_createClipButton(clipName, renderOptions.onToggleClip, clipButtons));
      }
    },
    dispose(): void {
      menuButton?.removeEventListener("click", onMenuClick);
      root.remove();
      host.classList.remove("launcher--puzzle");
    }
  };
}

function _applyCssVars(root: HTMLDivElement): void {
  root.style.setProperty("--sunduc-info-min-height", `${SUNDUC_CONFIG.layout.infoMinHeightVh}svh`);
  root.style.setProperty("--sunduc-viewer-min-height", `${SUNDUC_CONFIG.layout.viewerMinHeightVh}svh`);
  root.style.setProperty("--sunduc-info-max-width", `${SUNDUC_CONFIG.layout.infoMaxWidthPx}px`);
  root.style.setProperty("--sunduc-debug-width", `${SUNDUC_CONFIG.layout.debugPanelWidthPx}px`);
  root.style.setProperty("--sunduc-canvas-min-height", `${SUNDUC_CONFIG.layout.canvasMinHeightPx}px`);
}

function _createClipButton(
  clipName: string,
  onToggleClip: (clipName: string) => void,
  clipButtons: Map<string, HTMLButtonElement>
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "btn sunduc__debug-btn";
  button.type = "button";
  button.textContent = clipName;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => onToggleClip(clipName));
  clipButtons.set(clipName, button);
  return button;
}

function _requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector) as HTMLElement | null;
  if (!element) {
    throw new Error(`Sunduc UI element not found: ${selector}`);
  }

  return element;
}
