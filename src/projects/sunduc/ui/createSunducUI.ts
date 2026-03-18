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
  const additionalInfoContacts = SUNDUC_CONFIG.additionalInfo.contacts
    .map(
      (contact) => `
        <li class="sunduc__modal-list-item">
          <span class="sunduc__modal-list-label">${contact.label}</span>
          <a class="sunduc__modal-link" href="${contact.href}" target="_blank" rel="noreferrer">${contact.value}</a>
        </li>
      `
    )
    .join("");
  const borrowedAssets = SUNDUC_CONFIG.additionalInfo.borrowedAssets
    .map(
      (asset) => `
        <li class="sunduc__modal-list-item sunduc__modal-list-item--stacked">
          <a class="sunduc__modal-link" href="${asset.href}" target="_blank" rel="noreferrer">${asset.title}</a>
          <span class="sunduc__modal-list-note">${asset.note}</span>
        </li>
      `
    )
    .join("");
  const commissionedAssets = SUNDUC_CONFIG.additionalInfo.commissionedAssets
    .map(
      (asset) => `
        <li class="sunduc__modal-list-item">
          <a class="sunduc__modal-link" href="${asset.href}" target="_blank" rel="noreferrer">${asset.title}</a>
        </li>
      `
    )
    .join("");
  const resetButtons = SUNDUC_CONFIG.additionalInfo.resetButtons
    .map(
      (label, index) => `
        <button class="btn sunduc__reset-btn" type="button" data-reset-action="${index === 0 ? "gnomes" : "all"}">
          ${label}
        </button>
      `
    )
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
        <div class="sunduc__modal-section">
          <h3 class="sunduc__modal-section-title">Контакты</h3>
          <ul class="sunduc__modal-list">
            ${additionalInfoContacts}
          </ul>
        </div>
        <div class="sunduc__modal-section">
          <h3 class="sunduc__modal-section-title">${SUNDUC_CONFIG.additionalInfo.borrowedAssetsTitle}</h3>
          <ul class="sunduc__modal-list">
            ${borrowedAssets}
          </ul>
        </div>
        <div class="sunduc__modal-section">
          <h3 class="sunduc__modal-section-title">${SUNDUC_CONFIG.additionalInfo.commissionedAssetsTitle}</h3>
          <ul class="sunduc__modal-list">
            ${commissionedAssets}
          </ul>
        </div>
        <p class="sunduc__modal-note">${SUNDUC_CONFIG.additionalInfo.ownershipNote}</p>
        ${
          additionalInfoRows
            ? `<div class="sunduc__modal-paragraphs">${additionalInfoRows}</div>`
            : ""
        }
        <div class="sunduc__modal-actions">
          ${resetButtons}
        </div>
      </div>
    </div>
    <div class="sunduc__confirm" hidden aria-hidden="true">
      <div
        class="sunduc__confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sunduc-confirm-title"
      >
        <div class="sunduc__modal-eyebrow">Подтверждение</div>
        <h3 class="sunduc__confirm-title" id="sunduc-confirm-title"></h3>
        <p class="sunduc__confirm-text"></p>
        <div class="sunduc__confirm-actions">
          <button class="btn sunduc__confirm-cancel" type="button">Нет</button>
          <button class="btn sunduc__confirm-approve" type="button">Да</button>
        </div>
      </div>
    </div>
  `;

  host.appendChild(root);

  const canvas = _requireElement(root, ".sunduc__canvas") as HTMLCanvasElement;
  const canvasWrap = _requireElement(root, ".sunduc__canvas-wrap") as HTMLDivElement;
  const status = _requireElement(root, ".sunduc__status") as HTMLDivElement;
  const additionalInfoButton = _requireElement(root, ".sunduc__info-btn") as HTMLButtonElement;
  const modal = _requireElement(root, ".sunduc__modal") as HTMLDivElement;
  const modalCard = _requireElement(root, ".sunduc__modal-card") as HTMLDivElement;
  const modalCloseButton = _requireElement(root, ".sunduc__modal-close") as HTMLButtonElement;
  const resetActionButtons = Array.from(root.querySelectorAll(".sunduc__reset-btn")) as HTMLButtonElement[];
  const confirmModal = _requireElement(root, ".sunduc__confirm") as HTMLDivElement;
  const confirmTitle = _requireElement(root, ".sunduc__confirm-title") as HTMLHeadingElement;
  const confirmText = _requireElement(root, ".sunduc__confirm-text") as HTMLParagraphElement;
  const confirmCancelButton = _requireElement(root, ".sunduc__confirm-cancel") as HTMLButtonElement;
  const confirmApproveButton = _requireElement(root, ".sunduc__confirm-approve") as HTMLButtonElement;
  const appRoot = document.getElementById("app");
  const initialAppOverflow = appRoot?.style.overflow ?? "";
  const initialAppOverscrollBehavior = appRoot?.style.overscrollBehavior ?? "";
  let pendingResetAction: "gnomes" | "all" | null = null;
  if (options.embedded) {
    status.style.display = "none";
  }

  const _setAppScrollLocked = (locked: boolean): void => {
    if (!appRoot) return;

    if (locked) {
      appRoot.style.overflow = "hidden";
      appRoot.style.overscrollBehavior = "none";
      return;
    }

    appRoot.style.overflow = initialAppOverflow;
    appRoot.style.overscrollBehavior = initialAppOverscrollBehavior;
  };

  const _syncAppScrollLock = (): void => {
    _setAppScrollLocked(!modal.hidden || !confirmModal.hidden);
  };

  const _closeConfirm = (): void => {
    confirmModal.hidden = true;
    confirmModal.setAttribute("aria-hidden", "true");
    pendingResetAction = null;
    _syncAppScrollLock();
  };

  const _openConfirm = (action: "gnomes" | "all"): void => {
    pendingResetAction = action;
    if (action === "gnomes") {
      confirmTitle.textContent = "Удалить прогресс у гномов?";
      confirmText.textContent =
        "Будет удален только прогресс проекта с гномами. После этого страница перезагрузится.";
      confirmApproveButton.textContent = "Да, удалить";
    } else {
      confirmTitle.textContent = "Удалить весь игровой процесс?";
      confirmText.textContent =
        "Будет полностью очищен прогресс всего портфолио. После этого страница перезагрузится.";
      confirmApproveButton.textContent = "Да, удалить все";
    }

    confirmModal.hidden = false;
    confirmModal.setAttribute("aria-hidden", "false");
    _syncAppScrollLock();
  };

  const _runPendingReset = (): void => {
    if (!pendingResetAction) return;

    if (pendingResetAction === "gnomes") {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith("gnomes_")) continue;
        localStorage.removeItem(key);
      }
    } else {
      localStorage.clear();
    }

    window.location.reload();
  };

  const _openAdditionalInfo = (): void => {
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    _syncAppScrollLock();
    modalCard.scrollTop = 0;
  };

  const _closeAdditionalInfo = (): void => {
    _closeConfirm();
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    _syncAppScrollLock();
  };

  const _onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (!confirmModal.hidden) {
      _closeConfirm();
      return;
    }
    if (modal.hidden) return;
    _closeAdditionalInfo();
  };

  const _onModalClick = (event: MouseEvent): void => {
    if (event.target !== modal) return;
    _closeAdditionalInfo();
  };

  const _onConfirmClick = (event: MouseEvent): void => {
    if (event.target !== confirmModal) return;
    _closeConfirm();
  };

  const _onResetActionClick = (event: MouseEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.resetAction;
    if (action === "gnomes" || action === "all") {
      _openConfirm(action);
    }
  };

  additionalInfoButton.addEventListener("click", _openAdditionalInfo);
  modalCloseButton.addEventListener("click", _closeAdditionalInfo);
  modal.addEventListener("click", _onModalClick);
  confirmCancelButton.addEventListener("click", _closeConfirm);
  confirmApproveButton.addEventListener("click", _runPendingReset);
  confirmModal.addEventListener("click", _onConfirmClick);
  for (const button of resetActionButtons) {
    button.addEventListener("click", _onResetActionClick);
  }
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
      _setAppScrollLocked(false);
      additionalInfoButton.removeEventListener("click", _openAdditionalInfo);
      modalCloseButton.removeEventListener("click", _closeAdditionalInfo);
      modal.removeEventListener("click", _onModalClick);
      confirmCancelButton.removeEventListener("click", _closeConfirm);
      confirmApproveButton.removeEventListener("click", _runPendingReset);
      confirmModal.removeEventListener("click", _onConfirmClick);
      for (const button of resetActionButtons) {
        button.removeEventListener("click", _onResetActionClick);
      }
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
