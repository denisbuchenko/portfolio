import type { DialogueViewState, DialogueViewOption, DialogueViewMessage } from "./DialogueEngine";

const HIDE_ANIMATION_MS = 380;
const OPTIONS_HIDE_MS = 180;
const LOG_EXPAND_MS = 180;
const MESSAGE_ENTER_MS = 260;
const MESSAGE_GAP_MS = 500;
const OPTIONS_SHOW_MS = 220;

type DialogueChooseResult = { state: DialogueViewState } | { ended: true };
type MaybePromise<T> = T | Promise<T>;

export class DialogueUI {
  private _panel: HTMLDivElement;
  private _portrait: HTMLImageElement;
  private _content: HTMLDivElement;
  private _title: HTMLDivElement;
  private _log: HTMLDivElement;
  private _options: HTMLDivElement;
  private _closeBtn: HTMLButtonElement;
  private _portraitUrls: Record<string, string>;
  private _defaultPortraitUrl: string;

  private _onChoose: ((o: DialogueViewOption) => MaybePromise<DialogueChooseResult>) | null = null;
  private _onClose: (() => void) | null = null;
  private _lastReplyId: string | null = null;
  private _isVisible = false;
  private _isTransitioning = false;
  private _hideTimer = 0;
  private _sequenceId = 0;

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

    this._content = document.createElement("div");
    this._content.className = "gnomes-dialogue__content";
    card.appendChild(this._content);

    const head = document.createElement("div");
    head.className = "gnomes-dialogue__head";
    this._content.appendChild(head);

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
    this._content.appendChild(this._log);

    this._options = document.createElement("div");
    this._options.className = "gnomes-dialogue__options";
    this._content.appendChild(this._options);

    opts.root.appendChild(this._panel);
  }

  setHandlers(opts: { onChoose: (o: DialogueViewOption) => MaybePromise<DialogueChooseResult>; onClose: () => void }): void {
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

    this._content.classList.remove("is-options-hidden", "is-log-expanded");

    // Добавляем новую реплику гнома в лог, если это реально новая реплика.
    if (this._lastReplyId !== state.replyId) {
      this._lastReplyId = state.replyId;
      if (!state.isSilent) {
        const messages = state.messages.filter((message) => message.text.trim().length > 0);
        if (messages.length > 0) {
          for (const message of messages) {
            this._appendBubble(message, false);
          }
        } else if (state.text.trim().length > 0) {
          this._appendBubble({ who: state.characterName, text: state.text, side: "left", kind: "speech" }, false);
        }
      }
    }

    this._renderOptions(state.options.filter((o) => o.isVisible));
    const _animateIn = () => {
      requestAnimationFrame(() => {
        this._panel.classList.remove("is-hiding");
        this._panel.classList.add("is-visible");
      });
    };
    _animateIn();
  }

  hide(): void {
    if (!this._isVisible) return;

    this._cancelHide();
    this._sequenceId += 1;
    this._isTransitioning = false;
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

  private _renderOptions(options: DialogueViewOption[]): void {
    this._options.innerHTML = "";

    if (options.length === 0) {
      const btn = document.createElement("button");
      btn.className = "gnomes-dialogue__option";
      btn.type = "button";
      btn.textContent = "Продолжить";
      btn.addEventListener("click", () => this._onClose?.());
      this._options.appendChild(btn);
      return;
    }

    for (const opt of options) {
      const btn = document.createElement("button");
      btn.className = "gnomes-dialogue__option";
      btn.type = "button";
      btn.disabled = !opt.isEnabled;

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
          void this._runChoiceTransition(opt);
        });
      }

      this._options.appendChild(btn);
    }
  }

  private async _runChoiceTransition(opt: DialogueViewOption): Promise<void> {
    if (this._isTransitioning || !this._onChoose) return;
    this._isTransitioning = true;
    const sequenceId = ++this._sequenceId;

    try {
      this._options.classList.add("is-busy");

      const result = await this._onChoose(opt);
      if (!this._isSequenceCurrent(sequenceId)) return;

      await this._hideOptions(sequenceId);
      if (!this._isSequenceCurrent(sequenceId)) return;

      await this._expandLog(sequenceId);
      if (!this._isSequenceCurrent(sequenceId)) return;

      await this._appendBubbleSequence(
        [{ who: "Ты", text: opt.text, side: "right", kind: "speech" }, ...("state" in result ? this._getMessages(result.state) : [])],
        sequenceId
      );
      if (!this._isSequenceCurrent(sequenceId)) return;

      if ("ended" in result) {
        this._onClose?.();
        return;
      }

      this._lastReplyId = result.state.replyId;
      this._title.textContent = result.state.characterName;
      this._renderOptions(result.state.options.filter((option) => option.isVisible));

      await this._showOptions(sequenceId);
    } finally {
      if (this._isSequenceCurrent(sequenceId)) {
        this._isTransitioning = false;
        this._options.classList.remove("is-busy");
      }
    }
  }

  private _getMessages(state: DialogueViewState): DialogueViewMessage[] {
    const messages = state.messages.filter((message) => message.text.trim().length > 0);
    if (messages.length > 0 || state.isSilent) return messages;
    if (state.text.trim().length === 0) return [];
    return [{ who: state.characterName, text: state.text, side: "left", kind: "speech" }];
  }

  private async _hideOptions(sequenceId: number): Promise<void> {
    this._content.classList.add("is-options-hidden");
    this._smoothScrollToBottom("smooth");
    await this._delay(OPTIONS_HIDE_MS, sequenceId);
  }

  private async _expandLog(sequenceId: number): Promise<void> {
    this._content.classList.add("is-log-expanded");
    this._smoothScrollToBottom("smooth");
    await this._delay(LOG_EXPAND_MS, sequenceId);
  }

  private async _showOptions(sequenceId: number): Promise<void> {
    this._options.classList.add("is-entering");
    const releasePin = this._pinLogToBottom(OPTIONS_SHOW_MS + 220, sequenceId);

    await this._nextFrame();
    if (!this._isSequenceCurrent(sequenceId)) {
      releasePin();
      return;
    }

    this._content.classList.remove("is-log-expanded", "is-options-hidden");
    this._smoothScrollToBottom("auto");

    await this._nextFrame();
    if (!this._isSequenceCurrent(sequenceId)) {
      releasePin();
      return;
    }

    this._options.classList.remove("is-entering");
    this._smoothScrollToBottom("auto");
    await this._delay(OPTIONS_SHOW_MS, sequenceId);
    releasePin();
    this._smoothScrollToBottom("auto");
  }

  private async _appendBubbleSequence(messages: DialogueViewMessage[], sequenceId: number): Promise<void> {
    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      await this._appendBubble(message, true, sequenceId);
      if (!this._isSequenceCurrent(sequenceId)) return;
      if (i < messages.length - 1) {
        await this._delay(MESSAGE_GAP_MS, sequenceId);
        if (!this._isSequenceCurrent(sequenceId)) return;
      }
    }
  }

  private async _appendBubble(opts: DialogueViewMessage, animated: boolean, sequenceId?: number): Promise<void> {
    const wrap = document.createElement("div");
    wrap.className = `gnomes-dialogue__bubble-wrap gnomes-dialogue__bubble-wrap--${opts.side}`;
    if (animated) wrap.classList.add("is-entering");

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
    this._smoothScrollToBottom(animated ? "smooth" : "auto");

    if (!animated) return;

    await this._nextFrame();
    if (sequenceId !== undefined && !this._isSequenceCurrent(sequenceId)) return;
    wrap.classList.add("is-visible");
    this._smoothScrollToBottom("smooth");
    await this._delay(MESSAGE_ENTER_MS, sequenceId);
  }

  private _smoothScrollToBottom(behavior: ScrollBehavior): void {
    this._log.scrollTo({ top: this._log.scrollHeight, behavior });
  }

  private _pinLogToBottom(durationMs: number, sequenceId?: number): () => void {
    let isActive = true;
    const startedAt = performance.now();

    const tick = () => {
      if (!isActive) return;
      if (sequenceId !== undefined && !this._isSequenceCurrent(sequenceId)) {
        isActive = false;
        return;
      }

      this._smoothScrollToBottom("auto");
      if (performance.now() - startedAt < durationMs) {
        requestAnimationFrame(tick);
      } else {
        isActive = false;
      }
    };

    requestAnimationFrame(tick);
    return () => {
      isActive = false;
    };
  }

  private _isSequenceCurrent(sequenceId: number): boolean {
    return this._sequenceId === sequenceId;
  }

  private _delay(ms: number, sequenceId?: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (sequenceId === undefined || this._isSequenceCurrent(sequenceId)) resolve();
        else resolve();
      }, ms);
    });
  }

  private _nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  private _cancelHide(): void {
    if (this._hideTimer === 0) return;
    window.clearTimeout(this._hideTimer);
    this._hideTimer = 0;
  }

  private _resetForFreshSession(): void {
    this._content.classList.remove("is-options-hidden", "is-log-expanded");
    this._options.classList.remove("is-busy");
    this._options.classList.remove("is-entering");
    this._options.innerHTML = "";
    this._log.innerHTML = "";
    this._lastReplyId = null;
  }
}

