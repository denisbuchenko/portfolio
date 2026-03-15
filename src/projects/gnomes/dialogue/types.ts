export type DialogueCharacterId = "horogran" | "fyfchik" | "pipiser" | (string & {});

export type DialogueData = {
  characterId: DialogueCharacterId;
  characterInfo: {
    name: string;
    age: number;
    description: string;
    arcTheme: string;
  };
  dialogueTree: DialogueAct[];
};

export type DialogueAct = {
  act: number;
  actTitle: string;
  actDescription: string;
  nodes: DialogueNode[];
};

export type DialogueNodeType = "entry" | "key_grantor" | "locked" | "final" | (string & {});

export type DialogueNode = {
  nodeId: string;
  nodeType: DialogueNodeType;
  replies: DialogueReply[];
};

export type DialogueReplyPart = {
  kind: "speech" | "narration";
  text: string;
  /**
   * Кто является источником этой части.
   * Для описательных частей можно явно указать "Ты" или имя гнома.
   */
  author?: string;
};

/**
 * Тон реплики игрока:
 * - "default"   — нейтральная, без прикрас
 * - "naive"     — наивная, мягкая, сочувствующая
 * - "sarcastic" — язвительная, колкая
 */
export type DialogueTone = "default" | "naive" | "sarcastic";

export type DialogueReply = {
  id: string;
  /** Авторское описание/ремарка (может быть показана в редакторе/в будущем в UI). */
  narration?: string;
  text?: string;
  /**
   * Явно заданные части реплики в порядке показа.
   * Нужны, когда в одном ответе чередуются описания и прямая речь.
   */
  parts?: DialogueReplyPart[];
  /**
   * Альтернативные тексты реплики, зависящие от тона предыдущего выбора игрока.
   * Ключ — тон (naive / sarcastic); значение — полный текст вместо `text`.
   * Если тон "default" или ключ отсутствует, используется основной `text`.
   */
  toneVariants?: Partial<Record<DialogueTone, string>>;
  playerOptions?: DialoguePlayerOption[];
  /**
   * Ключи, которые игрок получает за сам факт "дошёл до этой реплики" (прочитал/увидел).
   * Используется как "флаг знания", аналогично grantsKnowledge у playerOptions.
   */
  grantsKnowledge?: string[];
  isFinal?: boolean;
  isSilent?: boolean;
};

export type DialoguePlayerOption = {
  text: string;
  nextReplyId: string | null;
  /** Тон этой реплики (влияет на реакцию гнома в следующей реплике). */
  tone?: DialogueTone;
  requiredKnowledge?: string[];
  grantsKnowledge?: string[];
  /**
   * Как вести себя, если requiredKnowledge не хватает:
   * - "hide" (по умолчанию): опция вообще не показывается (текущее поведение)
   * - "disable": опция показывается, но недоступна (как "замок" в UI)
   */
  lockMode?: "hide" | "disable";
  /** Подсказка игроку, что нужно принести/узнать, чтобы открыть опцию. */
  lockHint?: string;
};

