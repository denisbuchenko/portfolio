export class CrashOverlay {
  private _root: HTMLDivElement;
  private _card: HTMLDivElement;
  private _cardAnimation: Animation | null = null;

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
    const card = this._root.querySelector(".overlay__card");
    if (!(card instanceof HTMLDivElement)) {
      throw new Error("Crash overlay card mount failed");
    }
    this._card = card;
    this._card.style.transformOrigin = "center center";
    host.appendChild(this._root);
  }

  show(): void {
    this._root.style.display = "flex";
    this._cardAnimation?.cancel();
    this._card.style.transform = "scale(0) rotate(0turn)";
    this._cardAnimation = this._card.animate(
      [
        { transform: "scale(0) rotate(0turn)" },
        { transform: "scale(1) rotate(2turn)" }
      ],
      {
        duration: 500,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards"
      }
    );
  }

  hide(): void {
    this._cardAnimation?.cancel();
    this._cardAnimation = null;
    this._root.style.display = "none";
  }

  dispose(): void {
    this._cardAnimation?.cancel();
    this._root.remove();
  }
}

