export type DialogueCharacterId = "shoragran" | "fyfchik" | "pipiser" | (string & {});

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

export type DialogueReply = {
  id: string;
  text?: string;
  playerOptions?: DialoguePlayerOption[];
  isFinal?: boolean;
  isSilent?: boolean;
};

export type DialoguePlayerOption = {
  text: string;
  nextReplyId: string | null;
  requiredKnowledge?: string[];
  grantsKnowledge?: string[];
};

