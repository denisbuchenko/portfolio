import type { SunducAnimationCatalog, SunducInventoryItemId, SunducStoneItemId } from "../types";
import { SunducAnimationController } from "./SunducAnimationController";

const SEQUENCE_DELAY_MS = 1500;
const STONE_ITEM_IDS: SunducStoneItemId[] = ["stone1", "stone2", "stone3", "stone4"];

export interface SunducDropAcceptance {
  accepted: boolean;
  consumeItemId?: SunducInventoryItemId;
  closeInventory?: boolean;
  completion?: Promise<SunducDropCompletion>;
}

export interface SunducDropCompletion {
  rewardItemId?: SunducInventoryItemId;
}

interface SunducSequenceControllerOptions {
  animationCatalog: SunducAnimationCatalog;
  animationController: SunducAnimationController;
  onStatusChange: (text: string) => void;
  onOpen2Complete?: () => void;
}

export class SunducSequenceController {
  private readonly _animationCatalog: SunducAnimationCatalog;
  private readonly _animationController: SunducAnimationController;
  private readonly _onStatusChange: (text: string) => void;
  private readonly _onOpen2Complete?: () => void;
  private readonly _insertedStones = new Set<SunducStoneItemId>();

  private _busy = false;
  private _fluteGranted = false;
  private _awaitingKey = false;
  private _keyInserted = false;

  constructor(options: SunducSequenceControllerOptions) {
    this._animationCatalog = options.animationCatalog;
    this._animationController = options.animationController;
    this._onStatusChange = options.onStatusChange;
    this._onOpen2Complete = options.onOpen2Complete;
  }

  canAcceptItem(itemId: SunducInventoryItemId): boolean {
    if (this._busy) return false;

    if (_isStoneItem(itemId)) {
      return !this._awaitingKey && !this._insertedStones.has(itemId) && Boolean(this._animationCatalog.stoneClipNamesByItemId[itemId]);
    }

    if (itemId === "key") {
      return this._awaitingKey && !this._keyInserted && Boolean(this._animationCatalog.keyClipName);
    }

    return false;
  }

  acceptItem(itemId: SunducInventoryItemId): SunducDropAcceptance {
    if (!this.canAcceptItem(itemId)) {
      return { accepted: false };
    }

    const completion = _isStoneItem(itemId) ? this._runStoneSequence(itemId) : this._runKeySequence();
    return {
      accepted: true,
      consumeItemId: itemId,
      closeInventory: true,
      completion,
    };
  }

  private async _runStoneSequence(itemId: SunducStoneItemId): Promise<SunducDropCompletion> {
    this._busy = true;
    try {
      const clipName = this._animationCatalog.stoneClipNamesByItemId[itemId];
      if (!clipName) return {};

      this._onStatusChange(`Камень ${itemId} установлен.`);
      await this._animationController.playClip(clipName);
      this._insertedStones.add(itemId);

      if (this._insertedStones.size < STONE_ITEM_IDS.length) {
        this._onStatusChange(`Камней собрано: ${this._insertedStones.size}/${STONE_ITEM_IDS.length}.`);
        return {};
      }

      this._onStatusChange("Все камни собраны. Готовлю первое открытие сундука…");
      await _delay(SEQUENCE_DELAY_MS);

      if (this._animationCatalog.open1ClipName) {
        await this._animationController.playClip(this._animationCatalog.open1ClipName);
      }

      if (this._animationCatalog.duduClipName) {
        await this._animationController.playClip(this._animationCatalog.duduClipName);
      }

      this._awaitingKey = true;
      this._onStatusChange("Дудка найдена. Теперь можно вставить ключ.");

      if (this._fluteGranted) return {};
      this._fluteGranted = true;
      return { rewardItemId: "flute" };
    } finally {
      this._busy = false;
    }
  }

  private async _runKeySequence(): Promise<SunducDropCompletion> {
    this._busy = true;
    this._keyInserted = true;

    try {
      if (this._animationCatalog.keyClipName) {
        this._onStatusChange("Ключ вставлен. Запускаю анимацию ключа…");
        await this._animationController.playClip(this._animationCatalog.keyClipName);
      }

      this._onStatusChange("Сундук готовится ко второму открытию…");
      await _delay(SEQUENCE_DELAY_MS);

      if (this._animationCatalog.open2ClipName) {
        await this._animationController.playClip(this._animationCatalog.open2ClipName);
        this._onOpen2Complete?.();
      }

      this._awaitingKey = false;
      this._onStatusChange("Сундук открыт.");
      return {};
    } finally {
      this._busy = false;
    }
  }
}

function _isStoneItem(itemId: SunducInventoryItemId): itemId is SunducStoneItemId {
  return STONE_ITEM_IDS.includes(itemId as SunducStoneItemId);
}

function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
