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

