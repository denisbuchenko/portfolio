const INVENTORY_REWARD_STYLE_ID = "showcase-inventory-reward-styles";

export interface InventoryRewardViewModel {
  id: string;
  label: string;
  imageSrc: string;
}

interface RewardQueueEntry {
  item: InventoryRewardViewModel;
}

export class ShowcaseInventoryRewardOverlay {
  private _rootEl: HTMLDivElement;
  private _imageEl: HTMLImageElement;
  private _textEl: HTMLDivElement;
  private _okButtonEl: HTMLButtonElement;
  private _queue: RewardQueueEntry[] = [];
  private _active = false;
  private _disposed = false;
  private _timeouts = new Set<number>();

  constructor() {
    _ensureRewardStyles();

    this._rootEl = document.createElement("div");
    this._rootEl.className = "showcase-inventory-reward";
    this._rootEl.innerHTML = `
      <div class="showcase-inventory-reward__backdrop"></div>
      <div class="showcase-inventory-reward__vignette"></div>
      <div class="showcase-inventory-reward__content">
        <div class="showcase-inventory-reward__glow"></div>
        <div class="showcase-inventory-reward__card">
          <img class="showcase-inventory-reward__image" alt="" />
        </div>
        <div class="showcase-inventory-reward__footer">
          <div class="showcase-inventory-reward__text"></div>
          <button class="btn showcase-inventory-reward__ok" type="button">Ок</button>
        </div>
      </div>
    `;

    const backdropEl = this._rootEl.querySelector(".showcase-inventory-reward__backdrop");
    const vignetteEl = this._rootEl.querySelector(".showcase-inventory-reward__vignette");
    const glowEl = this._rootEl.querySelector(".showcase-inventory-reward__glow");
    const cardEl = this._rootEl.querySelector(".showcase-inventory-reward__card");
    const imageEl = this._rootEl.querySelector(".showcase-inventory-reward__image");
    const textEl = this._rootEl.querySelector(".showcase-inventory-reward__text");
    const okButtonEl = this._rootEl.querySelector(".showcase-inventory-reward__ok");

    if (
      !(backdropEl instanceof HTMLDivElement) ||
      !(vignetteEl instanceof HTMLDivElement) ||
      !(glowEl instanceof HTMLDivElement) ||
      !(cardEl instanceof HTMLDivElement) ||
      !(imageEl instanceof HTMLImageElement) ||
      !(textEl instanceof HTMLDivElement) ||
      !(okButtonEl instanceof HTMLButtonElement)
    ) {
      throw new Error("Inventory reward overlay mount failed");
    }

    this._imageEl = imageEl;
    this._textEl = textEl;
    this._okButtonEl = okButtonEl;

    this._okButtonEl.addEventListener("click", this._onOkClick);
    document.body.appendChild(this._rootEl);
  }

  dispose(): void {
    this._disposed = true;
    this._clearTimers();
    this._okButtonEl.removeEventListener("click", this._onOkClick);
    this._rootEl.remove();
  }

  enqueue(item: InventoryRewardViewModel): void {
    if (this._disposed) return;
    this._queue.push({ item });
    if (this._active) return;
    this._showNext();
  }

  private _showNext(): void {
    if (this._active || this._disposed) return;
    const nextEntry = this._queue.shift();
    if (!nextEntry) return;

    this._active = true;
    this._imageEl.src = nextEntry.item.imageSrc;
    this._imageEl.alt = nextEntry.item.label;
    this._textEl.textContent = `Поздравляю у вас появился ${nextEntry.item.label}`;

    this._rootEl.className = "showcase-inventory-reward showcase-inventory-reward--visible";

    this._schedule(() => {
      this._rootEl.classList.add("showcase-inventory-reward--item-visible");
    }, 110);

    this._schedule(() => {
      this._rootEl.classList.add("showcase-inventory-reward--footer-visible");
    }, 560);

    this._schedule(() => {
      this._rootEl.classList.add("showcase-inventory-reward--glow-fade");
      this._okButtonEl.focus({ preventScroll: true });
    }, 720);
  }

  private _hideImmediate(): void {
    this._clearTimers();
    this._active = false;
    this._rootEl.className = "showcase-inventory-reward";
    this._showNext();
  }

  private _schedule(callback: () => void, delayMs: number): void {
    const timeoutId = window.setTimeout(() => {
      this._timeouts.delete(timeoutId);
      if (this._disposed) return;
      callback();
    }, delayMs);
    this._timeouts.add(timeoutId);
  }

  private _clearTimers(): void {
    for (const timeoutId of this._timeouts) {
      window.clearTimeout(timeoutId);
    }
    this._timeouts.clear();
  }

  private _onOkClick = (): void => {
    this._hideImmediate();
  };
}

function _ensureRewardStyles(): void {
  if (document.getElementById(INVENTORY_REWARD_STYLE_ID)) return;

  const styleEl = document.createElement("style");
  styleEl.id = INVENTORY_REWARD_STYLE_ID;
  styleEl.textContent = `
    .showcase-inventory-reward {
      position: fixed;
      inset: 0;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
    }

    .showcase-inventory-reward--visible {
      opacity: 1;
      pointer-events: auto;
    }

    .showcase-inventory-reward__backdrop,
    .showcase-inventory-reward__vignette,
    .showcase-inventory-reward__content {
      position: absolute;
      inset: 0;
    }

    .showcase-inventory-reward__backdrop {
      background: rgba(2, 5, 10, 0);
      transition: background 220ms ease;
    }

    .showcase-inventory-reward__vignette {
      background:
        radial-gradient(circle at center, rgba(0, 0, 0, 0) 10%, rgba(0, 0, 0, 0.24) 62%, rgba(0, 0, 0, 0.84) 100%);
      opacity: 0;
      transition: opacity 260ms ease;
    }

    .showcase-inventory-reward__content {
      display: grid;
      place-items: center;
      padding: 24px;
      overflow: hidden;
    }

    .showcase-inventory-reward__glow {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(52vw, 520px);
      height: min(52vw, 520px);
      transform: translate(-50%, -22%) scale(0.82);
      border-radius: 50%;
      background:
        radial-gradient(circle, rgba(255, 235, 157, 0.98) 0%, rgba(255, 179, 83, 0.78) 28%, rgba(255, 128, 32, 0.38) 48%, rgba(255, 128, 32, 0) 72%);
      filter: blur(8px);
      opacity: 0;
      transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 360ms ease;
    }

    .showcase-inventory-reward__card {
      position: relative;
      width: min(40vw, 260px);
      aspect-ratio: 1;
      border-radius: 28px;
      padding: 18px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(14px);
      transform: translateY(34vh) scale(0.82);
      opacity: 0;
      transition: transform 480ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 320ms ease;
    }

    .showcase-inventory-reward__image {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 20px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
    }

    .showcase-inventory-reward__footer {
      position: absolute;
      left: 50%;
      bottom: 12vh;
      transform: translateX(-50%) translateY(16px);
      width: min(92vw, 760px);
      display: grid;
      justify-items: center;
      gap: 18px;
      opacity: 0;
      transition: opacity 260ms ease, transform 260ms ease;
      text-align: center;
    }

    .showcase-inventory-reward__text {
      font-size: clamp(24px, 3vw, 40px);
      font-weight: 800;
      line-height: 1.14;
      color: #fff6db;
      text-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    }

    .showcase-inventory-reward__ok {
      min-width: 132px;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 700;
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32);
    }

    .showcase-inventory-reward--visible .showcase-inventory-reward__backdrop {
      background: rgba(2, 5, 10, 0.7);
    }

    .showcase-inventory-reward--visible .showcase-inventory-reward__vignette {
      opacity: 1;
    }

    .showcase-inventory-reward--item-visible .showcase-inventory-reward__glow {
      transform: translate(-50%, -22%) scale(1);
      opacity: 1;
    }

    .showcase-inventory-reward--item-visible .showcase-inventory-reward__card {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    .showcase-inventory-reward--footer-visible .showcase-inventory-reward__footer {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .showcase-inventory-reward--glow-fade .showcase-inventory-reward__glow {
      opacity: 0.42;
      transition-duration: 1400ms;
    }

    @media (max-width: 900px) {
      .showcase-inventory-reward__content {
        padding: 18px;
      }

      .showcase-inventory-reward__glow {
        width: min(86vw, 420px);
        height: min(86vw, 420px);
        transform: translate(-50%, -18%) scale(0.82);
      }

      .showcase-inventory-reward__card {
        width: min(64vw, 220px);
        border-radius: 24px;
        padding: 14px;
      }

      .showcase-inventory-reward__image {
        border-radius: 16px;
      }

      .showcase-inventory-reward__footer {
        bottom: 10vh;
        gap: 14px;
      }

      .showcase-inventory-reward__text {
        font-size: clamp(20px, 6vw, 30px);
      }

      .showcase-inventory-reward__ok {
        min-width: 120px;
        padding: 11px 22px;
        font-size: 15px;
      }
    }
  `;

  document.head.appendChild(styleEl);
}
