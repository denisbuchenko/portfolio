import type { DialogueViewState, DialogueViewOption, DialogueViewMessage } from "./DialogueEngine";

const HIDE_ANIMATION_MS = 380;

export class DialogueUI {
  private _panel: HTMLDivElement;
  private _portrait: HTMLImageElement;
  private _title: HTMLDivElement;
  private _log: HTMLDivElement;
  private _options: HTMLDivElement;
  private _closeBtn: HTMLButtonElement;
  private _portraitUrls: Record<string, string>;
  private _defaultPortraitUrl: string;

  private _onChoose: ((o: DialogueViewOption) => void) | null = null;
  private _onClose: (() => void) | null = null;
  private _lastReplyId: string | null = null;
  private _isVisible = false;
  private _hideTimer = 0;

  constructor(opts: { root: HTMLElement; portraitUrls: Record<string, string>; defaultPortraitUrl?: string }) {
    this._portraitUrls = opts.portraitUrls;
    this._defaultPortraitUrl = opts.defaultPortraitUrl ?? "";

    this._panel = document.createElement("div");
    this._panel.className = "gnomes-dialogue";

    const card = document.createElement("div");
    card.className = "gnomes-dialogue__card";
    this._panel.appendChild(card);

    this._portrait = document.createElement("img");
    this._portrait.className = "gnomes-dialogue__portrait";
    this._portrait.alt = "portrait";
    card.appendChild(this._portrait);

    const content = document.createElement("div");
    content.className = "gnomes-dialogue__content";
    card.appendChild(content);

    const head = document.createElement("div");
    head.className = "gnomes-dialogue__head";
    content.appendChild(head);

    this._title = document.createElement("div");
    this._title.className = "gnomes-dialogue__title";
    head.appendChild(this._title);

    this._closeBtn = document.createElement("button");
    this._closeBtn.className = "gnomes-dialogue__close";
    this._closeBtn.type = "button";
    this._closeBtn.textContent = "Закрыть";
    this._closeBtn.addEventListener("click", () => this._onClose?.());
    head.appendChild(this._closeBtn);

    this._log = document.createElement("div");
    this._log.className = "gnomes-dialogue__log";
    content.appendChild(this._log);

    this._options = document.createElement("div");
    this._options.className = "gnomes-dialogue__options";
    content.appendChild(this._options);

    opts.root.appendChild(this._panel);
  }

  setHandlers(opts: { onChoose: (o: DialogueViewOption) => void; onClose: () => void }): void {
    this._onChoose = opts.onChoose;
    this._onClose = opts.onClose;
  }

  show(state: DialogueViewState): void {
    this._cancelHide();
    if (!this._isVisible) this._resetForFreshSession();

    this._panel.setAttribute("aria-hidden", "false");
    this._panel.classList.remove("is-visible", "is-hiding");
    this._panel.classList.add("is-mounted");
    this._portrait.src = this._portraitUrls[state.characterId] ?? this._defaultPortraitUrl;
    this._title.textContent = state.characterName;
    this._isVisible = true;

    // Добавляем новую реплику гнома в лог, если это реально новая реплика.
    if (this._lastReplyId !== state.replyId) {
      this._lastReplyId = state.replyId;
      if (!state.isSilent) {
        const messages = state.messages.filter((message) => message.text.trim().length > 0);
        if (messages.length > 0) {
          for (const message of messages) {
            this._appendBubble(message);
          }
        } else if (state.text.trim().length > 0) {
          this._appendBubble({ who: state.characterName, text: state.text, side: "left", kind: "speech" });
        }
      }
    }

    this._options.innerHTML = "";
    const visible = state.options.filter((o) => o.isVisible);
    const _animateIn = () => {
      requestAnimationFrame(() => {
        this._panel.classList.remove("is-hiding");
        this._panel.classList.add("is-visible");
      });
    };

    // Если вариантов нет — показываем одну кнопку завершения.
    if (visible.length === 0) {
      const btn = document.createElement("button");
      btn.className = "gnomes-dialogue__option";
      btn.type = "button";
      btn.textContent = "Продолжить";
      btn.addEventListener("click", () => this._onClose?.());
      this._options.appendChild(btn);
      _animateIn();
      return;
    }

    for (const opt of visible) {
      const btn = document.createElement("button");
      btn.className = "gnomes-dialogue__option";
      btn.type = "button";
      btn.disabled = !opt.isEnabled;

      // Текст + (опционально) подсказка замка.
      const t = document.createElement("div");
      t.className = "gnomes-dialogue__option-text";
      t.textContent = opt.text;
      btn.appendChild(t);

      if (!opt.isEnabled && opt.lockHint) {
        const hint = document.createElement("div");
        hint.className = "gnomes-dialogue__option-hint";
        hint.textContent = opt.lockHint;
        btn.appendChild(hint);
      }

      if (opt.isEnabled) {
        btn.addEventListener("click", () => {
          // В стиле ММО: добавляем в лог реплику игрока, затем просим движок выдать следующую реплику гнома.
          this._appendBubble({ who: "Ты", text: opt.text, side: "right", kind: "speech" });
          this._onChoose?.(opt);
        });
      }
      this._options.appendChild(btn);
    }

    _animateIn();
  }

  hide(): void {
    if (!this._isVisible) return;

    this._cancelHide();
    this._isVisible = false;
    this._panel.classList.remove("is-visible");
    this._panel.classList.add("is-hiding");
    this._panel.setAttribute("aria-hidden", "true");

    this._hideTimer = window.setTimeout(() => {
      this._panel.classList.remove("is-hiding", "is-mounted");
      this._resetForFreshSession();
      this._hideTimer = 0;
    }, HIDE_ANIMATION_MS);
  }

  private _appendBubble(opts: DialogueViewMessage): void {
    const wrap = document.createElement("div");
    wrap.className = `gnomes-dialogue__bubble-wrap gnomes-dialogue__bubble-wrap--${opts.side}`;

    const bubble = document.createElement("div");
    bubble.className = `gnomes-dialogue__bubble gnomes-dialogue__bubble--${opts.side}`;
    if (opts.kind === "narration") bubble.classList.add("gnomes-dialogue__bubble--narration");

    const name = document.createElement("div");
    name.className = "gnomes-dialogue__bubble-name";
    name.textContent = opts.kind === "narration" ? "***" : opts.who;
    bubble.appendChild(name);

    const txt = document.createElement("div");
    txt.className = "gnomes-dialogue__bubble-text";
    txt.textContent = opts.text;
    bubble.appendChild(txt);

    wrap.appendChild(bubble);
    this._log.appendChild(wrap);
    this._log.scrollTop = this._log.scrollHeight;
  }

  private _cancelHide(): void {
    if (this._hideTimer === 0) return;
    window.clearTimeout(this._hideTimer);
    this._hideTimer = 0;
  }

  private _resetForFreshSession(): void {
    this._options.innerHTML = "";
    this._log.innerHTML = "";
    this._lastReplyId = null;
  }
}

