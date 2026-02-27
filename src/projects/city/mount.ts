import { CityApp } from "./CityApp";

export function mountCityProject(host: HTMLElement): void {
  host.innerHTML = "";
  host.style.display = "block";
  host.style.padding = "0";
  host.classList.add("launcher--puzzle");

  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.inset = "0";
  wrapper.style.pointerEvents = "auto";
  host.appendChild(wrapper);

  const uiRoot = document.createElement("div");
  uiRoot.style.position = "absolute";
  uiRoot.style.inset = "0";
  uiRoot.style.pointerEvents = "none";
  uiRoot.style.zIndex = "30";
  uiRoot.dataset.cityUi = "1";
  wrapper.appendChild(uiRoot);

  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  wrapper.appendChild(canvas);

  // Кнопка “в меню” как в редакторе: перезагрузка страницы.
  const btnMenu = document.createElement("button");
  btnMenu.className = "btn";
  btnMenu.type = "button";
  btnMenu.textContent = "В меню";
  btnMenu.style.position = "absolute";
  btnMenu.style.left = "14px";
  btnMenu.style.top = "14px";
  btnMenu.style.zIndex = "45";
  btnMenu.style.pointerEvents = "auto";
  btnMenu.addEventListener("click", () => window.location.reload());
  uiRoot.appendChild(btnMenu);

  const app = new CityApp({ host: wrapper, canvas, uiRoot });
  void app.start();
}

