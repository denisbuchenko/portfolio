type GoalCounterOverlayConfig = Readonly<{
  hud: Readonly<{
    topPx: number;
    rightPx: number;
    minWidthPx: number;
    paddingX: number;
    paddingY: number;
    borderRadiusPx: number;
    fontSizePx: number;
    fontWeight: number;
    color: string;
    background: string;
    border: string;
    boxShadow: string;
  }>;
  popup: Readonly<{
    anchorXPercent: number;
    anchorYPercent: number;
    offsetXPx: number;
    offsetYPx: number;
    travelYPx: number;
    fontSizePx: number;
    fontWeight: number;
    color: string;
    textShadow: string;
    startScale: number;
    peakScale: number;
    endScale: number;
    startOpacity: number;
    peakOpacity: number;
    endOpacity: number;
    fadeInSec: number;
    holdSec: number;
    fadeOutSec: number;
  }>;
}>;

export class GoalCounterOverlay {
  private _root: HTMLDivElement;
  private _hud: HTMLDivElement;
  private _popup: HTMLDivElement;
  private _cfg: GoalCounterOverlayConfig;
  private _popupState: null | { elapsedSec: number } = null;

  constructor(host: HTMLElement, cfg: GoalCounterOverlayConfig) {
    this._cfg = cfg;

    this._root = document.createElement("div");
    this._root.style.position = "absolute";
    this._root.style.inset = "0";
    this._root.style.pointerEvents = "none";
    this._root.style.zIndex = "38";
    this._root.style.display = "none";

    this._hud = document.createElement("div");
    this._hud.style.position = "absolute";
    this._hud.style.top = `${this._cfg.hud.topPx}px`;
    this._hud.style.right = `${this._cfg.hud.rightPx}px`;
    this._hud.style.minWidth = `${this._cfg.hud.minWidthPx}px`;
    this._hud.style.padding = `${this._cfg.hud.paddingY}px ${this._cfg.hud.paddingX}px`;
    this._hud.style.borderRadius = `${this._cfg.hud.borderRadiusPx}px`;
    this._hud.style.color = this._cfg.hud.color;
    this._hud.style.background = this._cfg.hud.background;
    this._hud.style.border = this._cfg.hud.border;
    this._hud.style.boxShadow = this._cfg.hud.boxShadow;
    this._hud.style.fontSize = `${this._cfg.hud.fontSizePx}px`;
    this._hud.style.fontWeight = String(this._cfg.hud.fontWeight);
    this._hud.style.fontVariantNumeric = "tabular-nums";
    this._hud.style.textAlign = "center";
    this._hud.style.userSelect = "none";
    this._hud.textContent = "0/0";

    this._popup = document.createElement("div");
    this._popup.style.position = "absolute";
    this._popup.style.left = `${this._cfg.popup.anchorXPercent}%`;
    this._popup.style.top = `${this._cfg.popup.anchorYPercent}%`;
    this._popup.style.display = "none";
    this._popup.style.color = this._cfg.popup.color;
    this._popup.style.fontSize = `${this._cfg.popup.fontSizePx}px`;
    this._popup.style.fontWeight = String(this._cfg.popup.fontWeight);
    this._popup.style.lineHeight = "1";
    this._popup.style.userSelect = "none";
    this._popup.style.whiteSpace = "nowrap";
    this._popup.style.textShadow = this._cfg.popup.textShadow;
    this._popup.style.transformOrigin = "center center";
    this._popup.style.willChange = "transform, opacity";

    this._root.appendChild(this._hud);
    this._root.appendChild(this._popup);
    host.appendChild(this._root);
  }

  setVisible(visible: boolean): void {
    this._root.style.display = visible ? "block" : "none";
  }

  setProgress(current: number, total: number): void {
    this._hud.textContent = `${Math.max(0, Math.floor(current))}/${Math.max(0, Math.floor(total))}`;
  }

  showScore(score: number): void {
    this._popupState = { elapsedSec: 0 };
    this._popup.textContent = String(Math.max(0, Math.floor(score)));
    this._popup.style.display = "block";
    this._applyPopupFrame(0);
  }

  reset(current: number, total: number): void {
    this.setProgress(current, total);
    this._popupState = null;
    this._popup.style.display = "none";
  }

  update(dtSec: number): void {
    if (!this._popupState) return;

    this._popupState.elapsedSec += Math.max(0, dtSec);
    const totalDurationSec = this._cfg.popup.fadeInSec + this._cfg.popup.holdSec + this._cfg.popup.fadeOutSec;

    if (this._popupState.elapsedSec >= totalDurationSec) {
      this._popupState = null;
      this._popup.style.display = "none";
      return;
    }

    this._applyPopupFrame(this._popupState.elapsedSec);
  }

  dispose(): void {
    this._root.remove();
  }

  private _applyPopupFrame(elapsedSec: number): void {
    const cfg = this._cfg.popup;
    const fadeInEndSec = cfg.fadeInSec;
    const holdEndSec = fadeInEndSec + cfg.holdSec;

    let opacity = cfg.peakOpacity;
    let scale = cfg.peakScale;
    let travel01 = 0;

    if (elapsedSec <= fadeInEndSec) {
      const t01 = fadeInEndSec <= 0 ? 1 : elapsedSec / fadeInEndSec;
      opacity = this._lerp(cfg.startOpacity, cfg.peakOpacity, t01);
      scale = this._lerp(cfg.startScale, cfg.peakScale, t01);
      travel01 = t01 * 0.35;
    } else if (elapsedSec <= holdEndSec) {
      opacity = cfg.peakOpacity;
      scale = cfg.peakScale;
      travel01 = 0.35;
    } else {
      const fadeOutSec = Math.max(0.0001, cfg.fadeOutSec);
      const t01 = (elapsedSec - holdEndSec) / fadeOutSec;
      opacity = this._lerp(cfg.peakOpacity, cfg.endOpacity, t01);
      scale = this._lerp(cfg.peakScale, cfg.endScale, t01);
      travel01 = this._lerp(0.35, 1, t01);
    }

    const translateY = cfg.offsetYPx + cfg.travelYPx * travel01;
    this._popup.style.opacity = String(opacity);
    this._popup.style.transform = `translate(-50%, -50%) translate(${cfg.offsetXPx}px, ${translateY}px) scale(${scale})`;
  }

  private _lerp(from: number, to: number, t01: number): number {
    const clamped = Math.max(0, Math.min(1, t01));
    return from + (to - from) * clamped;
  }
}
