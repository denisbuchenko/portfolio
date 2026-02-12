import type { DialogueAct, DialogueData, DialogueNode, DialogueReply } from "./types";

export type CharacterDialogueIndex = {
  data: DialogueData;
  actsByNumber: Map<number, DialogueAct>;
  replyById: Map<string, DialogueReply>;
  nodeById: Map<string, DialogueNode>;
};

export class DialogueDatabase {
  private _characters = new Map<string, CharacterDialogueIndex>();

  constructor(allDialogues: DialogueData[]) {
    for (const d of allDialogues) {
      this._characters.set(d.characterId, this._buildCharacterIndex(d));
    }
  }

  getCharacter(characterId: string): CharacterDialogueIndex | null {
    return this._characters.get(characterId) ?? null;
  }

  private _buildCharacterIndex(data: DialogueData): CharacterDialogueIndex {
    const actsByNumber = new Map<number, DialogueAct>();
    const replyById = new Map<string, DialogueReply>();
    const nodeById = new Map<string, DialogueNode>();

    for (const act of data.dialogueTree) {
      actsByNumber.set(act.act, act);
      for (const node of act.nodes) {
        nodeById.set(node.nodeId, node);
        for (const reply of node.replies) {
          replyById.set(reply.id, reply);
        }
      }
    }

    return { data, actsByNumber, replyById, nodeById };
  }
}

