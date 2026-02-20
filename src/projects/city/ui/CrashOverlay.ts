export class CrashOverlay {
  private _root: HTMLDivElement;

  constructor(host: HTMLElement) {
    this._root = document.createElement("div");
    this._root.style.position = "absolute";
    this._root.style.inset = "0";
    this._root.style.display = "none";
    this._root.style.alignItems = "center";
    this._root.style.justifyContent = "center";
    this._root.style.zIndex = "40";
    this._root.style.background = "rgba(0,0,0,0.55)";
    this._root.style.backdropFilter = "blur(10px)";
    this._root.innerHTML = `
      <div class="overlay__card">
        <h2 class="overlay__title">:(</h2>
        <p class="overlay__text">Столкновение</p>
      </div>
    `;
    host.appendChild(this._root);
  }

  show(): void {
    this._root.style.display = "flex";
  }

  hide(): void {
    this._root.style.display = "none";
  }

  dispose(): void {
    this._root.remove();
  }
}

