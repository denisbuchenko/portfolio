import { ShowcaseInventoryRewardOverlay } from "./ShowcaseInventoryRewardOverlay";

const INVENTORY_STYLE_ID = "showcase-inventory-styles";
const INVENTORY_SLOT_COUNT = 4;

export type InventoryItemId = "key" | "stone1" | "stone2" | "stone3" | "stone4" | "flute";
export type InventoryDragPhase = "start" | "move" | "end";

export interface InventoryItemDef {
  id: InventoryItemId;
  label: string;
  imageSrc: string;
}

export interface InventoryDragSnapshot {
  itemId: InventoryItemId;
  clientX: number;
  clientY: number;
  phase: InventoryDragPhase;
  hitTarget: Element | null;
}

export interface ShowcaseInventoryOptions {
  host: HTMLElement;
  initialSectionTitle?: string;
}

export type InventoryDragListener = (snapshot: InventoryDragSnapshot) => void;

export interface InventoryConsoleApi {
  addItem: (itemId: InventoryItemId) => boolean;
  removeItem: (itemId: InventoryItemId) => boolean;
  hasItem: (itemId: InventoryItemId) => boolean;
  listItems: () => InventoryItemId[];
  listCatalog: () => InventoryItemDef[];
  clear: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  subscribeDrag: (listener: InventoryDragListener) => () => void;
  addKey: () => boolean;
  removeKey: () => boolean;
  addStone1: () => boolean;
  removeStone1: () => boolean;
  addStone2: () => boolean;
  removeStone2: () => boolean;
  addStone3: () => boolean;
  removeStone3: () => boolean;
  addStone4: () => boolean;
  removeStone4: () => boolean;
  addFlute: () => boolean;
  removeFlute: () => boolean;
}

declare global {
  interface Window {
    showcaseInventory?: InventoryConsoleApi;
  }
}

const INVENTORY_CATALOG: Readonly<Record<InventoryItemId, InventoryItemDef>> = Object.freeze({
  key: { id: "key", label: "Ключ", imageSrc: "/inventory/ключ.png" },
  stone1: { id: "stone1", label: "Камень 1", imageSrc: "/inventory/Камень1.jpg" },
  stone2: { id: "stone2", label: "Камень 2", imageSrc: "/inventory/Камень2.jpg" },
  stone3: { id: "stone3", label: "Камень 3", imageSrc: "/inventory/Камень3.jpg" },
  stone4: { id: "stone4", label: "Камень 4", imageSrc: "/inventory/Камень4.jpg" },
  flute: { id: "flute", label: "Дудка", imageSrc: "/inventory/дудка.png" },
});

interface ActiveDragState {
  itemId: InventoryItemId;
  pointerId: number;
  ghostEl: HTMLDivElement;
  sourceEl: HTMLButtonElement;
  sourceSlotEl: HTMLDivElement;
}

export class ShowcaseInventory {
  private _rootEl: HTMLDivElement;
  private _sectionValueEl: HTMLSpanElement;
  private _slots: HTMLDivElement[] = [];
  private _items: InventoryItemId[] = [];
  private _subscribers = new Set<InventoryDragListener>();
  private _expanded = false;
  private _activeDrag: ActiveDragState | null = null;
  private _consoleApi: InventoryConsoleApi;
  private _rewardOverlay: ShowcaseInventoryRewardOverlay;

  constructor(opts: ShowcaseInventoryOptions) {
    _ensureInventoryStyles();
    this._rewardOverlay = new ShowcaseInventoryRewardOverlay();

    this._rootEl = document.createElement("div");
    this._rootEl.className = "showcase-inventory";

    const toggleEl = document.createElement("button");
    toggleEl.className = "showcase-inventory__toggle";
    toggleEl.type = "button";
    toggleEl.textContent = "Инвентарь";
    toggleEl.addEventListener("click", () => this.toggle());
    this._rootEl.appendChild(toggleEl);

    const panelEl = document.createElement("div");
    panelEl.className = "showcase-inventory__panel";
    panelEl.innerHTML = `
      <div class="showcase-inventory__header">
        <span class="showcase-inventory__title">Инвентарь</span>
        <span class="showcase-inventory__screen-label">Экран: <span class="showcase-inventory__screen-value"></span></span>
      </div>
      <div class="showcase-inventory__grid"></div>
      <p class="showcase-inventory__hint">Тяни предмет пальцем или мышкой.</p>
    `;
    this._rootEl.appendChild(panelEl);

    const sectionValueEl = panelEl.querySelector(".showcase-inventory__screen-value");
    const gridEl = panelEl.querySelector(".showcase-inventory__grid");
    if (!(sectionValueEl instanceof HTMLSpanElement) || !(gridEl instanceof HTMLDivElement)) {
      throw new Error("Inventory UI mount failed");
    }
    this._sectionValueEl = sectionValueEl;

    for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
      const slotEl = document.createElement("div");
      slotEl.className = "showcase-inventory__slot showcase-inventory__slot--empty";
      gridEl.appendChild(slotEl);
      this._slots.push(slotEl);
    }

    opts.host.appendChild(this._rootEl);
    this.setActiveSectionTitle(opts.initialSectionTitle ?? "");
    this._render();

    this._consoleApi = this._createConsoleApi();
    window.showcaseInventory = this._consoleApi;
  }

  dispose(): void {
    this._finishActiveDrag();
    if (window.showcaseInventory === this._consoleApi) delete window.showcaseInventory;
    this._rewardOverlay.dispose();
    this._rootEl.remove();
    this._subscribers.clear();
  }

  setActiveSectionTitle(title: string): void {
    this._sectionValueEl.textContent = title || "Не выбран";
  }

  setHidden(hidden: boolean): void {
    this._rootEl.classList.toggle("showcase-inventory--hidden", hidden);
  }

  open(): void {
    this._expanded = true;
    this._syncExpandedState();
  }

  close(): void {
    this._expanded = false;
    this._syncExpandedState();
  }

  toggle(): void {
    this._expanded = !this._expanded;
    this._syncExpandedState();
  }

  addItem(itemId: InventoryItemId): boolean {
    if (this._items.includes(itemId)) return false;
    if (this._items.length >= INVENTORY_SLOT_COUNT) {
      // eslint-disable-next-line no-console
      console.warn(`[Inventory] Нет свободных слотов для «${INVENTORY_CATALOG[itemId].label}»`);
      return false;
    }
    this._items.push(itemId);
    this._render();
    this._rewardOverlay.enqueue(INVENTORY_CATALOG[itemId]);
    return true;
  }

  removeItem(itemId: InventoryItemId): boolean {
    const nextItems = this._items.filter((id) => id !== itemId);
    if (nextItems.length === this._items.length) return false;
    this._items = nextItems;
    this._render();
    return true;
  }

  clear(): void {
    if (this._items.length === 0) return;
    this._items = [];
    this._render();
  }

  hasItem(itemId: InventoryItemId): boolean {
    return this._items.includes(itemId);
  }

  listItems(): InventoryItemId[] {
    return [...this._items];
  }

  subscribeDrag(listener: InventoryDragListener): () => void {
    this._subscribers.add(listener);
    return () => {
      this._subscribers.delete(listener);
    };
  }

  private _syncExpandedState(): void {
    this._rootEl.classList.toggle("showcase-inventory--expanded", this._expanded);
  }

  private _render(): void {
    for (let i = 0; i < this._slots.length; i++) {
      const slotEl = this._slots[i];
      const itemId = this._items[i];
      slotEl.replaceChildren();
      slotEl.classList.toggle("showcase-inventory__slot--empty", !itemId);
      if (!itemId) continue;

      const itemDef = INVENTORY_CATALOG[itemId];
      const itemBtn = document.createElement("button");
      itemBtn.className = "showcase-inventory__item";
      itemBtn.type = "button";
      itemBtn.dataset.inventoryItem = itemId;
      itemBtn.setAttribute("aria-label", itemDef.label);
      itemBtn.addEventListener("pointerdown", this._onItemPointerDown);

      const img = document.createElement("img");
      img.className = "showcase-inventory__item-image";
      img.src = itemDef.imageSrc;
      img.alt = itemDef.label;
      itemBtn.appendChild(img);

      slotEl.appendChild(itemBtn);
    }
  }

  private _createConsoleApi(): InventoryConsoleApi {
    return {
      addItem: (itemId) => this.addItem(itemId),
      removeItem: (itemId) => this.removeItem(itemId),
      hasItem: (itemId) => this.hasItem(itemId),
      listItems: () => this.listItems(),
      listCatalog: () => Object.values(INVENTORY_CATALOG),
      clear: () => this.clear(),
      open: () => this.open(),
      close: () => this.close(),
      toggle: () => this.toggle(),
      subscribeDrag: (listener) => this.subscribeDrag(listener),
      addKey: () => this.addItem("key"),
      removeKey: () => this.removeItem("key"),
      addStone1: () => this.addItem("stone1"),
      removeStone1: () => this.removeItem("stone1"),
      addStone2: () => this.addItem("stone2"),
      removeStone2: () => this.removeItem("stone2"),
      addStone3: () => this.addItem("stone3"),
      removeStone3: () => this.removeItem("stone3"),
      addStone4: () => this.addItem("stone4"),
      removeStone4: () => this.removeItem("stone4"),
      addFlute: () => this.addItem("flute"),
      removeFlute: () => this.removeItem("flute"),
    };
  }

  private _onItemPointerDown = (event: PointerEvent): void => {
    const sourceEl = event.currentTarget;
    if (!(sourceEl instanceof HTMLButtonElement)) return;
    const itemId = sourceEl.dataset.inventoryItem as InventoryItemId | undefined;
    if (!itemId) return;

    const sourceSlotEl = sourceEl.parentElement;
    if (!(sourceSlotEl instanceof HTMLDivElement)) return;

    event.preventDefault();

    const ghostEl = this._createGhost(itemId);
    document.body.appendChild(ghostEl);
    sourceEl.style.opacity = "0";

    this._activeDrag = {
      itemId,
      pointerId: event.pointerId,
      ghostEl,
      sourceEl,
      sourceSlotEl,
    };

    this._moveGhost(event.clientX, event.clientY);
    this._emitDrag(itemId, "start", event.clientX, event.clientY);

    window.addEventListener("pointermove", this._onWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", this._onWindowPointerUp);
    window.addEventListener("pointercancel", this._onWindowPointerUp);
  };

  private _onWindowPointerMove = (event: PointerEvent): void => {
    const drag = this._activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this._moveGhost(event.clientX, event.clientY);
    this._emitDrag(drag.itemId, "move", event.clientX, event.clientY);
  };

  private _onWindowPointerUp = (event: PointerEvent): void => {
    const drag = this._activeDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this._emitDrag(drag.itemId, "end", event.clientX, event.clientY);
    this._finishActiveDrag();
  };

  private _finishActiveDrag(): void {
    const drag = this._activeDrag;
    if (!drag) return;
    this._activeDrag = null;

    window.removeEventListener("pointermove", this._onWindowPointerMove);
    window.removeEventListener("pointerup", this._onWindowPointerUp);
    window.removeEventListener("pointercancel", this._onWindowPointerUp);

    const slotRect = drag.sourceSlotEl.getBoundingClientRect();
    drag.ghostEl.style.transition = "left 180ms ease, top 180ms ease, transform 180ms ease, opacity 180ms ease";
    drag.ghostEl.style.left = `${slotRect.left + slotRect.width / 2}px`;
    drag.ghostEl.style.top = `${slotRect.top + slotRect.height / 2}px`;
    drag.ghostEl.style.transform = "translate(-50%, -50%) scale(0.92)";

    window.setTimeout(() => {
      drag.sourceEl.style.opacity = "";
      drag.ghostEl.remove();
    }, 190);
  }

  private _createGhost(itemId: InventoryItemId): HTMLDivElement {
    const ghostEl = document.createElement("div");
    ghostEl.className = "showcase-inventory__drag-ghost";

    const img = document.createElement("img");
    img.src = INVENTORY_CATALOG[itemId].imageSrc;
    img.alt = INVENTORY_CATALOG[itemId].label;
    ghostEl.appendChild(img);

    return ghostEl;
  }

  private _moveGhost(clientX: number, clientY: number): void {
    const ghostEl = this._activeDrag?.ghostEl;
    if (!ghostEl) return;
    ghostEl.style.left = `${clientX}px`;
    ghostEl.style.top = `${clientY}px`;
  }

  private _emitDrag(itemId: InventoryItemId, phase: InventoryDragPhase, clientX: number, clientY: number): void {
    const hitTarget = document.elementFromPoint(clientX, clientY);
    const snapshot: InventoryDragSnapshot = { itemId, clientX, clientY, phase, hitTarget };
    for (const listener of this._subscribers) listener(snapshot);
  }
}

function _ensureInventoryStyles(): void {
  if (document.getElementById(INVENTORY_STYLE_ID)) return;
  const styleEl = document.createElement("style");
  styleEl.id = INVENTORY_STYLE_ID;
  styleEl.textContent = `
    .showcase-inventory {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      z-index: 150;
      pointer-events: auto;
      width: 0;
      height: 0;
      overflow: visible;
    }

    .showcase-inventory--hidden {
      opacity: 0;
      pointer-events: none;
    }

    .showcase-inventory__toggle {
      position: absolute;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-right: none;
      border-radius: 16px 0 0 16px;
      min-width: 46px;
      min-height: 148px;
      padding: 16px 10px;
      background: rgba(10, 14, 24, 0.92);
      color: rgba(255, 255, 255, 0.82);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      backdrop-filter: blur(14px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
      writing-mode: vertical-rl;
      text-orientation: mixed;
      line-height: 1;
      white-space: nowrap;
      touch-action: manipulation;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      z-index: 2;
      transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
    }

    .showcase-inventory__toggle:hover {
      background: rgba(16, 22, 36, 0.96);
      border-color: rgba(255, 255, 255, 0.24);
      color: rgba(255, 255, 255, 0.96);
    }

    .showcase-inventory__toggle:focus-visible {
      outline: 2px solid rgba(110, 231, 255, 0.72);
      outline-offset: 3px;
    }

    .showcase-inventory__panel {
      position: absolute;
      top: 50%;
      right: 44px;
      width: 92px;
      padding: 8px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(8, 12, 20, 0.9);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(18px);
      opacity: 0;
      transform: translate(calc(100% + 12px), -50%);
      transition: transform 220ms ease, opacity 220ms ease;
    }

    .showcase-inventory--expanded .showcase-inventory__panel {
      opacity: 1;
      transform: translate(0, -50%);
    }

    .showcase-inventory__header {
      display: grid;
      gap: 3px;
      margin-bottom: 6px;
    }

    .showcase-inventory__title {
      font-size: 11px;
      font-weight: 700;
      color: #fff;
    }

    .showcase-inventory__screen-label {
      font-size: 9px;
      line-height: 1.2;
      color: rgba(255, 255, 255, 0.6);
    }

    .showcase-inventory__screen-value {
      color: rgba(255, 255, 255, 0.86);
    }

    .showcase-inventory__grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }

    .showcase-inventory__slot {
      aspect-ratio: 1;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
        rgba(18, 24, 36, 0.92);
      padding: 5px;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
    }

    .showcase-inventory__slot--empty::after {
      content: "";
      width: 100%;
      border-radius: 10px;
      border: 1px dashed rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.02);
    }

    .showcase-inventory__item {
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
      color: inherit;
    }

    .showcase-inventory__item:active {
      cursor: grabbing;
    }

    .showcase-inventory__item-image {
      width: 100%;
      height: 100%;
      max-width: none;
      aspect-ratio: 1;
      border-radius: 8px;
      object-fit: cover;
      pointer-events: none;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
    }

    .showcase-inventory__hint {
      margin: 6px 0 0;
      font-size: 9px;
      line-height: 1.35;
      color: rgba(255, 255, 255, 0.56);
    }

    .showcase-inventory__drag-ghost {
      position: fixed;
      left: 0;
      top: 0;
      width: 92px;
      height: 92px;
      padding: 8px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(10, 14, 24, 0.88);
      box-shadow: 0 24px 50px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(16px);
      transform: translate(-50%, -50%) scale(1.04);
      pointer-events: none;
    }

    .showcase-inventory__drag-ghost img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 12px;
    }

    @media (max-width: 900px) {
      .showcase-inventory__panel {
        width: 84px;
        padding: 7px;
        right: 40px;
      }

      .showcase-inventory__toggle {
        min-width: 42px;
        min-height: 132px;
        padding: 14px 9px;
        font-size: 10px;
      }

      .showcase-inventory__slot {
        border-radius: 10px;
      }
    }
  `;
  document.head.appendChild(styleEl);
}
