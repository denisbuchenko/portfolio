import { LottieSegmentsController, type OsminogUiMode } from "./LottieSegmentsController";

function _setActiveBtn(btn: HTMLButtonElement, active: boolean): void {
  if (active) btn.classList.add("btn--active");
  else btn.classList.remove("btn--active");
}

export function mountOsminogProject(host: HTMLElement): () => void {
  host.innerHTML = "";
  host.style.display = "block";
  host.style.padding = "0";
  host.classList.add("launcher--puzzle");

  const root = document.createElement("div");
  root.className = "osminog";
  host.appendChild(root);

  const stage = document.createElement("div");
  stage.className = "osminog__stage";
  root.appendChild(stage);

  const animContainer = document.createElement("div");
  animContainer.className = "osminog__anim";
  stage.appendChild(animContainer);

  const loading = document.createElement("div");
  loading.className = "osminog__loading";
  loading.textContent = "Загрузка…";
  animContainer.appendChild(loading);

  // UI слой
  const uiRoot = document.createElement("div");
  uiRoot.className = "osminog__ui";
  root.appendChild(uiRoot);

  const btnMenu = document.createElement("button");
  btnMenu.className = "btn osminog__menu";
  btnMenu.type = "button";
  btnMenu.textContent = "В меню";
  btnMenu.addEventListener("click", () => window.location.reload());
  uiRoot.appendChild(btnMenu);

  const controls = document.createElement("div");
  controls.className = "osminog__controls";
  uiRoot.appendChild(controls);

  const btn1 = document.createElement("button");
  btn1.className = "btn osminog__seg-btn";
  btn1.type = "button";
  btn1.textContent = "1";
  btn1.setAttribute("aria-label", "Анимация 1");
  controls.appendChild(btn1);

  const btn2 = document.createElement("button");
  btn2.className = "btn osminog__seg-btn";
  btn2.type = "button";
  btn2.textContent = "2";
  btn2.setAttribute("aria-label", "Переход");
  controls.appendChild(btn2);

  const btn3 = document.createElement("button");
  btn3.className = "btn osminog__seg-btn";
  btn3.type = "button";
  btn3.textContent = "3";
  btn3.setAttribute("aria-label", "Анимация 3");
  controls.appendChild(btn3);

  btn1.disabled = true;
  btn2.disabled = true;
  btn3.disabled = true;

  let _disposed = false;
  let _unsubscribe: (() => void) | null = null;
  let _controller: LottieSegmentsController | null = null;
  let _anim: import("lottie-web").AnimationItem | null = null;

  void (async () => {
    try {
      const mod = await import("lottie-web");
      if (_disposed) return;

      _anim = mod.default.loadAnimation({
        container: animContainer,
        renderer: "svg",
        loop: false,
        autoplay: false,
        path: "/osminog/osminog.json"
      });

      _controller = new LottieSegmentsController(_anim);
      const updateUi = (mode: OsminogUiMode) => {
        _setActiveBtn(btn1, mode === 1);
        _setActiveBtn(btn2, mode === 2);
        _setActiveBtn(btn3, mode === 3);
      };
      _unsubscribe = _controller.onUiModeChange(updateUi);

      btn1.disabled = false;
      btn2.disabled = false;
      btn3.disabled = false;
      loading.remove();
    } catch (e) {
      loading.textContent = `Ошибка загрузки: ${e instanceof Error ? e.message : String(e)}`;
    }
  })();

  btn1.addEventListener("click", () => _controller?.request(1));
  btn2.addEventListener("click", () => _controller?.request(2));
  btn3.addEventListener("click", () => _controller?.request(3));

  return () => {
    _disposed = true;
    _unsubscribe?.();
    _controller?.dispose();
    _anim?.destroy();
    root.remove();
    host.classList.remove("launcher--puzzle");
  };
}

