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
  const additionalInfoRows = SUNDUC_CONFIG.additionalInfo.paragraphs
    .map((paragraph) => `<p class="sunduc__modal-paragraph">${paragraph}</p>`)
    .join("");

  root.innerHTML = `
    <div class="sunduc__info">
      <div class="sunduc__info-card">
        <div class="sunduc__eyebrow">${SUNDUC_CONFIG.eyebrow}</div>
        <h1 class="sunduc__title">${SUNDUC_CONFIG.title}</h1>
        <p class="sunduc__lead">${SUNDUC_CONFIG.lead}</p>
        <div class="sunduc__paragraphs">${infoRows}</div>
        <div class="sunduc__badges">${badges}</div>
        <div class="sunduc__actions">
          <button class="btn btn--showcase sunduc__info-btn" type="button">
            ${SUNDUC_CONFIG.additionalInfo.buttonLabel}
          </button>
        </div>
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
        <div class="sunduc__status"></div>
      </div>
    </div>
    <div class="sunduc__modal" hidden aria-hidden="true">
      <div
        class="sunduc__modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sunduc-additional-info-title"
      >
        <button
          class="sunduc__modal-close"
          type="button"
          aria-label="${SUNDUC_CONFIG.additionalInfo.closeLabel}"
        >
          ${SUNDUC_CONFIG.additionalInfo.closeLabel}
        </button>
        <div class="sunduc__modal-eyebrow">${SUNDUC_CONFIG.additionalInfo.buttonLabel}</div>
        <h2 class="sunduc__modal-title" id="sunduc-additional-info-title">${SUNDUC_CONFIG.additionalInfo.title}</h2>
        <p class="sunduc__modal-lead">${SUNDUC_CONFIG.additionalInfo.lead}</p>
        <div class="sunduc__modal-paragraphs">${additionalInfoRows}</div>
      </div>
    </div>
  `;

  host.appendChild(root);

  const canvas = _requireElement(root, ".sunduc__canvas") as HTMLCanvasElement;
  const canvasWrap = _requireElement(root, ".sunduc__canvas-wrap") as HTMLDivElement;
  const status = _requireElement(root, ".sunduc__status") as HTMLDivElement;
  const additionalInfoButton = _requireElement(root, ".sunduc__info-btn") as HTMLButtonElement;
  const modal = _requireElement(root, ".sunduc__modal") as HTMLDivElement;
  const modalCloseButton = _requireElement(root, ".sunduc__modal-close") as HTMLButtonElement;
  if (options.embedded) {
    status.style.display = "none";
  }

  const _openAdditionalInfo = (): void => {
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  };

  const _closeAdditionalInfo = (): void => {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  };

  const _onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || modal.hidden) return;
    _closeAdditionalInfo();
  };

  const _onModalClick = (event: MouseEvent): void => {
    if (event.target !== modal) return;
    _closeAdditionalInfo();
  };

  additionalInfoButton.addEventListener("click", _openAdditionalInfo);
  modalCloseButton.addEventListener("click", _closeAdditionalInfo);
  modal.addEventListener("click", _onModalClick);
  document.addEventListener("keydown", _onDocumentKeydown);

  return {
    canvas,
    canvasWrap,
    setStatus(text: string): void {
      if (options.embedded) return;
      status.textContent = text;
      status.style.display = text ? "" : "none";
    },
    setButtonsEnabled(_enabled: boolean): void {
      // Debug controls are intentionally hidden in the minimalist showcase UI.
    },
    setClipButtonActive(_clipName: string, _active: boolean): void {
      // Debug controls are intentionally hidden in the minimalist showcase UI.
    },
    renderAnimationControls(_renderOptions): void {
      // Debug controls are intentionally hidden in the minimalist showcase UI.
    },
    dispose(): void {
      additionalInfoButton.removeEventListener("click", _openAdditionalInfo);
      modalCloseButton.removeEventListener("click", _closeAdditionalInfo);
      modal.removeEventListener("click", _onModalClick);
      document.removeEventListener("keydown", _onDocumentKeydown);
      root.remove();
      host.classList.remove("launcher--puzzle");
    }
  };
}

function _applyCssVars(root: HTMLDivElement): void {
  root.style.setProperty("--sunduc-info-min-height", `${SUNDUC_CONFIG.layout.infoMinHeightVh}svh`);
  root.style.setProperty("--sunduc-viewer-min-height", `${SUNDUC_CONFIG.layout.viewerMinHeightVh}svh`);
  root.style.setProperty("--sunduc-info-max-width", `${SUNDUC_CONFIG.layout.infoMaxWidthPx}px`);
  root.style.setProperty("--sunduc-canvas-min-height", `${SUNDUC_CONFIG.layout.canvasMinHeightPx}px`);
}

function _requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector) as HTMLElement | null;
  if (!element) {
    throw new Error(`Sunduc UI element not found: ${selector}`);
  }

  return element;
}
