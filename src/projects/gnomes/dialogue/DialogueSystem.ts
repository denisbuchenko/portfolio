import { DialogueDatabase } from "./DialogueDatabase";
import { DialogueEngine } from "./DialogueEngine";
import { PlayerKnowledgeStore } from "./PlayerKnowledgeStore";
import { loadAllDialogues } from "./loadDialogues";
import { DialogueUI } from "./DialogueUI";
import { DialogueProgressStore } from "./DialogueProgressStore";

export class DialogueSystem {
  private _ui: DialogueUI;
  private _engine: DialogueEngine;
  private _isOpen = false;
  private _onVisibilityChange: (isOpen: boolean) => void;

  constructor(opts: {
    uiRoot: HTMLElement;
    portraitUrls: Record<string, string>;
    defaultPortraitUrl?: string;
    onVisibilityChange?: (isOpen: boolean) => void;
  }) {
    const db = new DialogueDatabase(loadAllDialogues());
    const knowledge = new PlayerKnowledgeStore();
    const progress = new DialogueProgressStore();
    this._engine = new DialogueEngine({ db, knowledge, progress });
    this._ui = new DialogueUI({
      root: opts.uiRoot,
      portraitUrls: opts.portraitUrls,
      defaultPortraitUrl: opts.defaultPortraitUrl,
    });
    this._onVisibilityChange = opts.onVisibilityChange ?? (() => {});

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
      const displayName = this._engine.getCharacterName(characterId);
      this._ui.show({
        characterId,
        characterName: displayName,
        act: 0,
        replyId: "locked",
        text: res.lockedReason,
        isSilent: false,
        isFinal: false,
        options: [],
      });
      this._setOpen(true);
      return;
    }
    this._ui.show(res.state);
    this._setOpen(true);
  }

  close(): void {
    if (!this._isOpen) return;
    this._engine.end();
    this._ui.hide();
    this._setOpen(false);
  }

  private _setOpen(isOpen: boolean): void {
    if (this._isOpen === isOpen) return;
    this._isOpen = isOpen;
    this._onVisibilityChange(isOpen);
  }
}

