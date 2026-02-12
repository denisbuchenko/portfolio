import { DialogueDatabase } from "./DialogueDatabase";
import { DialogueEngine } from "./DialogueEngine";
import { PlayerKnowledgeStore } from "./PlayerKnowledgeStore";
import { loadAllDialogues } from "./loadDialogues";
import { DialogueUI } from "./DialogueUI";

export class DialogueSystem {
  private _ui: DialogueUI;
  private _engine: DialogueEngine;

  constructor(opts: { uiRoot: HTMLElement; portraitUrl: string }) {
    const db = new DialogueDatabase(loadAllDialogues());
    const knowledge = new PlayerKnowledgeStore();
    this._engine = new DialogueEngine({ db, knowledge });
    this._ui = new DialogueUI({ root: opts.uiRoot, portraitUrl: opts.portraitUrl });

    this._ui.setHandlers({
      onChoose: (opt) => {
        const res = this._engine.choose(opt);
        if ("ended" in res) {
          this.close();
          return;
        }
        this._ui.show(res.state);
      },
      onClose: () => this.close(),
    });
  }

  open(characterId: string): void {
    const res = this._engine.start(characterId);
    if ("lockedReason" in res) {
      // Просто покажем причину в UI как текст без вариантов.
      this._ui.show({
        characterId,
        characterName: characterId,
        act: 0,
        replyId: "locked",
        text: res.lockedReason,
        isSilent: false,
        isFinal: false,
        options: [],
      });
      return;
    }
    this._ui.show(res.state);
  }

  close(): void {
    this._engine.end();
    this._ui.hide();
  }
}

