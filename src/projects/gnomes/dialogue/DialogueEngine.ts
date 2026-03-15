import type { DialoguePlayerOption, DialogueReply, DialogueReplyPart } from "./types";
import { DialogueDatabase } from "./DialogueDatabase";
import { PlayerKnowledgeStore } from "./PlayerKnowledgeStore";
import { DialogueProgressStore } from "./DialogueProgressStore";

export type DialogueViewOption = {
  text: string;
  option: DialoguePlayerOption;
  isVisible: boolean;
  isEnabled: boolean;
  missingKnowledge: string[];
  lockHint: string;
};

export type DialogueViewState = {
  characterId: string;
  characterName: string;
  act: number;
  replyId: string;
  text: string;
  messages: DialogueViewMessage[];
  isSilent: boolean;
  isFinal: boolean;
  options: DialogueViewOption[];
};

export type DialogueViewMessage = {
  who: string;
  text: string;
  side: "left" | "right";
  kind: "speech" | "narration";
};

export class DialogueEngine {
  private _db: DialogueDatabase;
  private _knowledge: PlayerKnowledgeStore;
  private _progress: DialogueProgressStore;

  private _active: {
    characterId: string;
    act: number;
    replyId: string;
  } | null = null;

  constructor(opts: { db: DialogueDatabase; knowledge: PlayerKnowledgeStore; progress: DialogueProgressStore }) {
    this._db = opts.db;
    this._knowledge = opts.knowledge;
    this._progress = opts.progress;
  }

  get isActive(): boolean {
    return this._active !== null;
  }

  /** Получить отображаемое имя персонажа по его ID. */
  getCharacterName(characterId: string): string {
    const idx = this._db.getCharacter(characterId);
    return idx?.data.characterInfo.name ?? characterId;
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

    const resumeReplyId = this._progress.getReplyId(characterId);
    const firstReply = (resumeReplyId ? idx.replyById.get(resumeReplyId) : null) ?? entry.replies[0];

    // Ключи за вход в реплику (если они заданы на реплике).
    if (firstReply.grantsKnowledge && firstReply.grantsKnowledge.length > 0) {
      this._knowledge.addMany(firstReply.grantsKnowledge);
    }

    const view = this._buildViewState(idx, characterId, act, firstReply);

    this._active = { characterId, act, replyId: firstReply.id };
    this._progress.setReplyId(characterId, firstReply.id);
    return { state: view };
  }

  /** Выбрать вариант ответа (индекс в массиве options UI). */
  choose(visibleOption: DialogueViewOption): { state: DialogueViewState } | { ended: true } {
    if (!this._active) return { ended: true };

    const idx = this._db.getCharacter(this._active.characterId);
    if (!idx) return { ended: true };

    const option = visibleOption.option;
    // Защита от попытки выбрать "замок" (disabled) или скрытую опцию.
    const required = option.requiredKnowledge ?? [];
    const missing = required.filter((k) => !this._knowledge.has(k));
    if (missing.length > 0) {
      // Ничего не меняем — UI должен был не дать нажать, но пусть движок будет устойчивым.
      const actData = idx.actsByNumber.get(this._active.act);
      const current = actData ? idx.replyById.get(this._active.replyId) : null;
      if (!current) return { ended: true };
      return { state: this._buildViewState(idx, this._active.characterId, this._active.act, current) };
    }

    const grants = option.grantsKnowledge ?? [];
    if (grants.length > 0) this._knowledge.addMany(grants);

    // nextReplyId === null => конец диалога
    if (option.nextReplyId === null) {
      this._progress.setReplyId(this._active.characterId, this._active.replyId);
      this._active = null;
      return { ended: true };
    }

    const next = idx.replyById.get(option.nextReplyId);
    if (!next) {
      this._active = null;
      return { ended: true };
    }

    // Переходим на следующую реплику.
    this._active.replyId = next.id;
    this._progress.setReplyId(this._active.characterId, next.id);

    // Ключи за вход в реплику (если они заданы на реплике).
    if (next.grantsKnowledge && next.grantsKnowledge.length > 0) {
      this._knowledge.addMany(next.grantsKnowledge);
    }

    // Финал акта: выдаём ключ завершения, но даём UI показать финальный текст.
    // Закрытие происходит обычным путём через option.nextReplyId === null.
    if (next.isFinal) {
      this._knowledge.add(this._actCompleteKey(this._active.characterId, this._active.act));
    }

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
    const messages = this._buildReplyMessages(idx.data.characterInfo.name, reply);

    const options = (reply.playerOptions ?? []).map((opt) => {
      const required = opt.requiredKnowledge ?? [];
      const missingKnowledge = required.filter((k) => !this._knowledge.has(k));

      if (missingKnowledge.length === 0) {
        return {
          text: opt.text,
          option: opt,
          isVisible: true,
          isEnabled: true,
          missingKnowledge: [],
          lockHint: "",
        };
      }

      const lockMode = opt.lockMode ?? "hide";
      const isVisible = lockMode === "disable";
      const lockHint = opt.lockHint ?? "Нужно узнать кое-что ещё. Поговори с другими гномами.";
      return {
        text: opt.text,
        option: opt,
        isVisible,
        isEnabled: false,
        missingKnowledge,
        lockHint,
      };
    });

    return {
      characterId,
      characterName: idx.data.characterInfo.name,
      act,
      replyId: reply.id,
      text: reply.text ?? "",
      messages,
      isSilent: Boolean(reply.isSilent),
      isFinal: Boolean(reply.isFinal),
      options,
    };
  }

  private _buildReplyMessages(characterName: string, reply: DialogueReply): DialogueViewMessage[] {
    const parts = reply.parts && reply.parts.length > 0 ? reply.parts : this._parseLegacyReplyParts(characterName, reply);
    return parts
      .map((part) => this._partToMessage(characterName, part))
      .filter((part): part is DialogueViewMessage => part !== null);
  }

  private _parseLegacyReplyParts(characterName: string, reply: DialogueReply): DialogueReplyPart[] {
    const parts: DialogueReplyPart[] = [];

    if (reply.narration && reply.narration.trim().length > 0) {
      parts.push({
        kind: "narration",
        text: reply.narration.trim(),
        author: this._inferNarrationAuthor(reply.narration, characterName, characterName),
      });
    }

    const rawText = reply.text?.trim();
    if (!rawText) return parts;

    let currentSpeaker = characterName;
    const blocks = rawText
      .split(/\n\s*\n/g)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);

    for (const block of blocks) {
      const speakerMatch = block.match(/^(Ты|[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]{1,40}):\s*([\s\S]*)$/);
      if (speakerMatch) {
        currentSpeaker = speakerMatch[1].trim();
        const speakerText = speakerMatch[2]?.trim() ?? "";
        parts.push(...this._splitInlineParts(speakerText, currentSpeaker, currentSpeaker));
        continue;
      }

      const narrationAuthor = this._inferNarrationAuthor(block, currentSpeaker, characterName);
      parts.push(...this._splitInlineParts(block, currentSpeaker, narrationAuthor, true));
    }

    return parts;
  }

  private _splitInlineParts(
    rawText: string,
    speechAuthor: string,
    narrationAuthor: string,
    forceNarration = false
  ): DialogueReplyPart[] {
    const parts: DialogueReplyPart[] = [];
    const text = rawText.trim();
    if (!text) return parts;

    const starRe = /\*{1,2}([^*]+?)\*{1,2}/g;
    let lastIndex = 0;

    for (const match of text.matchAll(starRe)) {
      const matchIndex = match.index ?? 0;
      const before = text.slice(lastIndex, matchIndex).trim();
      if (before.length > 0) {
        parts.push({
          kind: forceNarration ? "narration" : "speech",
          text: before,
          author: forceNarration ? narrationAuthor : speechAuthor,
        });
      }

      const narrationText = (match[1] ?? "").trim();
      if (narrationText.length > 0) {
        parts.push({
          kind: "narration",
          text: narrationText,
          author: narrationAuthor,
        });
      }

      lastIndex = matchIndex + match[0].length;
    }

    const tail = text.slice(lastIndex).trim();
    if (tail.length > 0) {
      parts.push({
        kind: forceNarration ? "narration" : "speech",
        text: tail,
        author: forceNarration ? narrationAuthor : speechAuthor,
      });
    }

    if (parts.length === 0) {
      parts.push({
        kind: forceNarration ? "narration" : "speech",
        text,
        author: forceNarration ? narrationAuthor : speechAuthor,
      });
    }

    return parts;
  }

  private _inferNarrationAuthor(text: string, fallbackAuthor: string, characterName: string): string {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return fallbackAuthor;

    if (
      normalized.startsWith("ты ") ||
      normalized.startsWith("ты.") ||
      normalized.startsWith("ты,") ||
      normalized.startsWith("сначала ты") ||
      normalized.startsWith("потом ты") ||
      normalized.startsWith("и наконец") ||
      normalized.startsWith("достаёшь") ||
      normalized.startsWith("достаешь") ||
      normalized.startsWith("подходишь") ||
      normalized.startsWith("приходишь") ||
      normalized.startsWith("кладёшь") ||
      normalized.startsWith("кладешь") ||
      normalized.startsWith("чувствуешь") ||
      normalized.startsWith("замечаешь")
    ) {
      return "Ты";
    }

    if (normalized.startsWith(characterName.toLowerCase())) {
      return characterName;
    }

    return fallbackAuthor;
  }

  private _partToMessage(characterName: string, part: DialogueReplyPart): DialogueViewMessage | null {
    const text = part.text.trim();
    if (text.length === 0) return null;

    const who = (part.author ?? (part.kind === "speech" ? characterName : characterName)).trim() || characterName;
    return {
      who,
      text,
      side: who === "Ты" ? "right" : "left",
      kind: part.kind,
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

