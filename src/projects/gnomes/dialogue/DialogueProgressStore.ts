export type DialogueProgressState = Record<string, { replyId: string }>;

export class DialogueProgressStore {
  private _storageKey: string;

  constructor(opts?: { storageKey?: string }) {
    this._storageKey = opts?.storageKey ?? "gnomes_dialogue_progress_v2";
  }

  getReplyId(characterId: string): string | null {
    const state = this._load();
    const v = state[characterId]?.replyId;
    return typeof v === "string" && v.length > 0 ? v : null;
  }

  setReplyId(characterId: string, replyId: string): void {
    if (!characterId || !replyId) return;
    const state = this._load();
    state[characterId] = { replyId };
    this._save(state);
  }

  clear(characterId?: string): void {
    if (!characterId) {
      this._save({});
      return;
    }
    const state = this._load();
    delete state[characterId];
    this._save(state);
  }

  private _load(): DialogueProgressState {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as DialogueProgressState;
    } catch {
      return {};
    }
  }

  private _save(state: DialogueProgressState): void {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(state));
    } catch {
      // ignore
    }
  }
}

