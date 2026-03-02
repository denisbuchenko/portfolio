import type { DialogueViewState, DialogueViewOption } from "./DialogueEngine";

export class DialogueUI {
  private _root: HTMLElement;
  private _panel: HTMLDivElement;
  private _portrait: HTMLImageElement;
  private _title: HTMLDivElement;
  private _log: HTMLDivElement;
  private _options: HTMLDivElement;
  private _closeBtn: HTMLButtonElement;

  private _onChoose: ((o: DialogueViewOption) => void) | null = null;
  private _onClose: (() => void) | null = null;
  private _lastReplyId: string | null = null;

  constructor(opts: { root: HTMLElement; portraitUrl: string }) {
    this._root = opts.root;

    this._panel = document.createElement("div");
    this._panel.style.position = "absolute";
    this._panel.style.left = "0";
    this._panel.style.right = "0";
    this._panel.style.bottom = "0";
    this._panel.style.zIndex = "20";
    this._panel.style.display = "none";
    this._panel.style.pointerEvents = "auto";
    this._panel.style.padding = "12px 12px calc(12px + env(safe-area-inset-bottom))";
    this._panel.style.background = "rgba(10, 12, 18, 0.78)";
    this._panel.style.borderTop = "1px solid var(--panel-border)";
    this._panel.style.backdropFilter = "blur(12px)";

    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "72px 1fr";
    row.style.gap = "12px";
    row.style.alignItems = "start";
    this._panel.appendChild(row);

    this._portrait = document.createElement("img");
    this._portrait.src = opts.portraitUrl;
    this._portrait.alt = "portrait";
    this._portrait.style.width = "72px";
    this._portrait.style.height = "72px";
    this._portrait.style.objectFit = "cover";
    this._portrait.style.borderRadius = "12px";
    this._portrait.style.border = "1px solid var(--panel-border)";
    row.appendChild(this._portrait);

    const content = document.createElement("div");
    content.style.minWidth = "0";
    row.appendChild(content);

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.gap = "12px";
    content.appendChild(head);

    this._title = document.createElement("div");
    this._title.style.fontSize = "13px";
    this._title.style.color = "var(--muted)";
    this._title.style.whiteSpace = "nowrap";
    this._title.style.overflow = "hidden";
    this._title.style.textOverflow = "ellipsis";
    head.appendChild(this._title);

    this._closeBtn = document.createElement("button");
    this._closeBtn.className = "btn";
    this._closeBtn.type = "button";
    this._closeBtn.textContent = "Закрыть";
    this._closeBtn.addEventListener("click", () => this._onClose?.());
    head.appendChild(this._closeBtn);

    this._log = document.createElement("div");
    this._log.style.marginTop = "8px";
    this._log.style.display = "grid";
    this._log.style.gap = "8px";
    this._log.style.maxHeight = "38vh";
    this._log.style.overflowY = "auto";
    this._log.style.paddingRight = "6px";
    content.appendChild(this._log);

    this._options = document.createElement("div");
    this._options.style.marginTop = "10px";
    this._options.style.display = "grid";
    this._options.style.gap = "8px";
    content.appendChild(this._options);

    this._root.appendChild(this._panel);
  }

  setHandlers(opts: { onChoose: (o: DialogueViewOption) => void; onClose: () => void }): void {
    this._onChoose = opts.onChoose;
    this._onClose = opts.onClose;
  }

  show(state: DialogueViewState): void {
    this._panel.style.display = "block";
    this._title.textContent = state.characterName;

    // Добавляем новую реплику гнома в лог, если это реально новая реплика.
    if (this._lastReplyId !== state.replyId) {
      this._lastReplyId = state.replyId;
      if (!state.isSilent && state.text.trim().length > 0) {
        this._appendBubble({ who: state.characterName, text: state.text, side: "left" });
      }
    }

    this._options.innerHTML = "";
    const visible = state.options.filter((o) => o.isVisible);

    // Если вариантов нет — показываем одну кнопку завершения.
    if (visible.length === 0) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = "Продолжить";
      btn.addEventListener("click", () => this._onClose?.());
      this._options.appendChild(btn);
      return;
    }

    for (const opt of visible) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.style.textAlign = "left";
      btn.style.whiteSpace = "normal";
      btn.style.lineHeight = "1.35";
      btn.disabled = !opt.isEnabled;
      btn.style.opacity = opt.isEnabled ? "1" : "0.55";
      btn.style.cursor = opt.isEnabled ? "pointer" : "not-allowed";

      // Текст + (опционально) подсказка замка.
      btn.innerHTML = "";
      const t = document.createElement("div");
      t.textContent = opt.text;
      btn.appendChild(t);

      if (!opt.isEnabled && opt.lockHint) {
        const hint = document.createElement("div");
        hint.textContent = opt.lockHint;
        hint.style.marginTop = "4px";
        hint.style.fontSize = "12px";
        hint.style.lineHeight = "1.25";
        hint.style.color = "var(--muted)";
        btn.appendChild(hint);
      }

      if (opt.isEnabled) {
        btn.addEventListener("click", () => {
          // В стиле ММО: добавляем в лог реплику игрока, затем просим движок выдать следующую реплику гнома.
          this._appendBubble({ who: "Ты", text: opt.text, side: "right" });
          this._onChoose?.(opt);
        });
      }
      this._options.appendChild(btn);
    }
  }

  hide(): void {
    this._panel.style.display = "none";
    this._options.innerHTML = "";
    this._log.innerHTML = "";
    this._lastReplyId = null;
  }

  private _appendBubble(opts: { who: string; text: string; side: "left" | "right" }): void {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.justifyContent = opts.side === "left" ? "flex-start" : "flex-end";

    const bubble = document.createElement("div");
    bubble.style.maxWidth = "92%";
    bubble.style.padding = "10px 12px";
    bubble.style.borderRadius = "12px";
    bubble.style.border = "1px solid var(--panel-border)";
    bubble.style.background = opts.side === "left" ? "rgba(255,255,255,0.06)" : "rgba(53, 157, 255, 0.18)";
    bubble.style.color = "var(--text)";

    const name = document.createElement("div");
    name.textContent = opts.who;
    name.style.fontSize = "12px";
    name.style.marginBottom = "4px";
    name.style.opacity = "0.75";
    bubble.appendChild(name);

    const txt = document.createElement("div");
    txt.textContent = opts.text;
    txt.style.whiteSpace = "pre-wrap";
    txt.style.fontSize = "15px";
    txt.style.lineHeight = "1.45";
    bubble.appendChild(txt);

    wrap.appendChild(bubble);
    this._log.appendChild(wrap);
    this._log.scrollTop = this._log.scrollHeight;
  }
}

