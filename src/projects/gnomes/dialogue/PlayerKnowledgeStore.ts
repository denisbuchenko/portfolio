export class PlayerKnowledgeStore {
  private _storageKey: string;
  private _set = new Set<string>();

  constructor(opts?: { storageKey?: string }) {
    // v3: полностью новый набор контента/ID персонажей и отказ от "актов" как концепции контента.
    // Бамп версии нужен, чтобы старые ключи не уводили игрока в неожиданные состояния.
    this._storageKey = opts?.storageKey ?? "gnomes_knowledge_v3";
    this._set = this._load();
  }

  get all(): ReadonlySet<string> {
    return this._set;
  }

  has(key: string): boolean {
    return this._set.has(key);
  }

  addMany(keys: string[]): void {
    let changed = false;
    for (const k of keys) {
      if (!k) continue;
      if (this._set.has(k)) continue;
      this._set.add(k);
      changed = true;
    }
    if (changed) this._save();
  }

  add(key: string): void {
    this.addMany([key]);
  }

  clear(): void {
    this._set.clear();
    this._save();
  }

  private _load(): Set<string> {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return new Set<string>();
      const out = new Set<string>();
      for (const v of arr) if (typeof v === "string") out.add(v);
      return out;
    } catch {
      return new Set<string>();
    }
  }

  private _save(): void {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(Array.from(this._set)));
    } catch {
      // ignore
    }
  }
}

