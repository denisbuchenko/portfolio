import type { SunducStoneItemId } from "./types";

const SUNDUC_PROGRESS_STORAGE_KEY = "showcase_sunduc_progress_v1";
const STONE_ITEM_IDS: SunducStoneItemId[] = ["stone1", "stone2", "stone3", "stone4"];

export interface SunducPersistedProgressState {
  insertedStoneIds: SunducStoneItemId[];
  open1Played: boolean;
  duduPlayed: boolean;
  keyConsumed: boolean;
}

export class SunducProgressStore {
  private _storageKey: string;

  constructor(opts?: { storageKey?: string }) {
    this._storageKey = opts?.storageKey ?? SUNDUC_PROGRESS_STORAGE_KEY;
  }

  load(): SunducPersistedProgressState {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return _createEmptyProgressState();

      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return _createEmptyProgressState();

      const insertedStoneIds = Array.isArray((parsed as { insertedStoneIds?: unknown }).insertedStoneIds)
        ? (parsed as { insertedStoneIds: unknown[] }).insertedStoneIds
        : [];

      return {
        insertedStoneIds: _sanitizeStoneIds(insertedStoneIds),
        open1Played: Boolean((parsed as { open1Played?: unknown }).open1Played),
        duduPlayed: Boolean((parsed as { duduPlayed?: unknown }).duduPlayed),
        keyConsumed: Boolean((parsed as { keyConsumed?: unknown }).keyConsumed),
      };
    } catch {
      return _createEmptyProgressState();
    }
  }

  save(state: SunducPersistedProgressState): void {
    try {
      localStorage.setItem(
        this._storageKey,
        JSON.stringify({
          insertedStoneIds: _sanitizeStoneIds(state.insertedStoneIds),
          open1Played: Boolean(state.open1Played),
          duduPlayed: Boolean(state.duduPlayed),
          keyConsumed: Boolean(state.keyConsumed),
        })
      );
    } catch {
      // ignore
    }
  }

  clear(): void {
    this.save(_createEmptyProgressState());
  }
}

function _createEmptyProgressState(): SunducPersistedProgressState {
  return {
    insertedStoneIds: [],
    open1Played: false,
    duduPlayed: false,
    keyConsumed: false,
  };
}

function _sanitizeStoneIds(values: unknown[]): SunducStoneItemId[] {
  const result: SunducStoneItemId[] = [];

  for (const stoneId of STONE_ITEM_IDS) {
    if (!values.includes(stoneId)) continue;
    result.push(stoneId);
  }

  return result;
}
