export class StartButton {
  private _btn: HTMLButtonElement;
  private _handler: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this._btn = document.createElement("button");
    this._btn.className = "btn";
    this._btn.type = "button";
    this._btn.textContent = "Start";
    this._btn.style.position = "absolute";
    this._btn.style.zIndex = "35";
    this._btn.style.transform = "translate(-50%, -50%)";
    this._btn.style.display = "none";
    this._btn.style.pointerEvents = "auto";
    host.appendChild(this._btn);

    this._btn.addEventListener("click", () => this._handler?.());
  }

  onClick(handler: () => void): void {
    this._handler = handler;
  }

  setVisible(visible: boolean): void {
    this._btn.style.display = visible ? "block" : "none";
  }

  setScreenPosition(px: Readonly<{ x: number; y: number }>): void {
    this._btn.style.left = `${px.x}px`;
    this._btn.style.top = `${px.y}px`;
  }

  dispose(): void {
    this._btn.remove();
  }
}

