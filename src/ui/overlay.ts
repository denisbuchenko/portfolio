import { assert } from "../utils/assert";

export type Overlay = ReturnType<typeof createOverlay>;

export function createOverlay() {
  const overlay = document.getElementById("overlay");
  assert(overlay, "overlay element not found");

  return {
    show(title: string, text: string) {
      overlay.classList.remove("overlay--hidden");
      overlay.innerHTML = `
        <div class="overlay__card">
          <h2 class="overlay__title">${title}</h2>
          <p class="overlay__text"></p>
        </div>
      `;
      const p = overlay.querySelector(".overlay__text");
      if (p) p.textContent = text;
    },
    hide() {
      overlay.classList.add("overlay--hidden");
      overlay.innerHTML = "";
    }
  };
}


