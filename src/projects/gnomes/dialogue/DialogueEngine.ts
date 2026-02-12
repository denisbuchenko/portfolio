import type { DialoguePlayerOption, DialogueReply } from "./types";
import { DialogueDatabase } from "./DialogueDatabase";
import { PlayerKnowledgeStore } from "./PlayerKnowledgeStore";

export type DialogueViewOption = {
  text: string;
  option: DialoguePlayerOption;
  isVisible: boolean;
};

export type DialogueViewState = {
  characterId: string;
  characterName: string;
  act: number;
  replyId: string;
  text: string;
  isSilent: boolean;
  isFinal: boolean;
  options: DialogueViewOption[];
};

export class DialogueEngine {
  private _db: DialogueDatabase;
  private _knowledge: PlayerKnowledgeStore;

  private _active: {
    characterId: string;
    act: number;
    replyId: string;
  } | null = null;

  constructor(opts: { db: DialogueDatabase; knowledge: PlayerKnowledgeStore }) {
    this._db = opts.db;
    this._knowledge = opts.knowledge;
  }

  get isActive(): boolean {
    return this._active !== null;
  }

  /** Начать диалог с персонажем. Возвращает состояние для UI или null если диалог недоступен. */
  start(characterId: string): { state: DialogueViewState } | { lockedReason: string } {
    const idx = this._db.getCharacter(characterId);
    if (!idx) return { lockedReason: `Не найден диалог персонажа: ${characterId}` };

    const act = this._getCurrentAct(characterId);
    const actData = idx.actsByNumber.get(act);
    if (!actData) return { lockedReason: `Не найден акт ${act} у ${characterId}` };

    const entry = actData.nodes.find((n) => n.nodeType === "entry") ?? actData.nodes[0];
    if (!entry || entry.replies.length === 0) return { lockedReason: `Пустой entry у ${characterId}` };

    const firstReply = entry.replies[0];

    // Проверка доступности (в духе ТЗ): если нет ни одного видимого варианта ответа — считаем акт закрытым.
    const view = this._buildViewState(idx, characterId, act, firstReply);
    const hasAnyVisible = view.options.some((o) => o.isVisible);
    if (!hasAnyVisible) {
      return { lockedReason: "Этот акт пока недоступен. Вернись позже, когда соберёшь нужные знания." };
    }

    this._active = { characterId, act, replyId: firstReply.id };
    return { state: view };
  }

  /** Выбрать вариант ответа (индекс в массиве options UI). */
  choose(visibleOption: DialogueViewOption): { state: DialogueViewState } | { ended: true } {
    if (!this._active) return { ended: true };

    const idx = this._db.getCharacter(this._active.characterId);
    if (!idx) return { ended: true };

    const option = visibleOption.option;
    const grants = option.grantsKnowledge ?? [];
    if (grants.length > 0) this._knowledge.addMany(grants);

    // nextReplyId === null => конец диалога
    if (option.nextReplyId === null) {
      this._active = null;
      return { ended: true };
    }

    const next = idx.replyById.get(option.nextReplyId);
    if (!next) {
      this._active = null;
      return { ended: true };
    }

    // Финал акта — выдаём ключ и закрываем.
    if (next.isFinal) {
      this._knowledge.add(this._actCompleteKey(this._active.characterId, this._active.act));
      this._active = null;
      return { ended: true };
    }

    this._active.replyId = next.id;
    return { state: this._buildViewState(idx, this._active.characterId, this._active.act, next) };
  }

  end(): void {
    this._active = null;
  }

  private _buildViewState(
    idx: NonNullable<ReturnType<DialogueDatabase["getCharacter"]>>,
    characterId: string,
    act: number,
    reply: DialogueReply
  ): DialogueViewState {
    const options = (reply.playerOptions ?? []).map((opt) => {
      const required = opt.requiredKnowledge ?? [];
      const isVisible = required.every((k) => this._knowledge.has(k));
      return { text: opt.text, option: opt, isVisible };
    });

    return {
      characterId,
      characterName: idx.data.characterInfo.name,
      act,
      replyId: reply.id,
      text: reply.text ?? "",
      isSilent: Boolean(reply.isSilent),
      isFinal: Boolean(reply.isFinal),
      options,
    };
  }

  private _getCurrentAct(characterId: string): number {
    // По умолчанию 1, дальше — если есть ключи завершения.
    // Для 3 актов: акт 2 доступен только если act1_complete; акт 3 — если act2_complete.
    const a1 = this._knowledge.has(this._actCompleteKey(characterId, 1));
    const a2 = this._knowledge.has(this._actCompleteKey(characterId, 2));
    if (a2) return 3;
    if (a1) return 2;
    return 1;
  }

  private _actCompleteKey(characterId: string, act: number): string {
    return `${characterId}_act${act}_complete`;
  }
}

