import { GNOMES_CONFIG } from "./config";
import { GnomesApp } from "./GnomesApp";

type _SavedStyles = {
  bodyOverflowY: string;
  htmlScrollSnapType: string;
  htmlOverscrollBehaviorY: string;
};

export function mountGnomesProject(host: HTMLElement): () => void {
  host.innerHTML = "";
  host.style.display = "block";
  host.style.padding = "0";

  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.inset = "0";
  wrapper.style.pointerEvents = "auto";
  host.appendChild(wrapper);

  const uiRoot = document.createElement("div");
  uiRoot.style.position = "absolute";
  uiRoot.style.inset = "0";
  uiRoot.style.pointerEvents = "none"; // сами компоненты внутри включат pointerEvents
  uiRoot.style.zIndex = "20";
  wrapper.appendChild(uiRoot);

  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  // Важно: иначе на мобильном свайп по canvas не будет скроллить страницу.
  canvas.style.touchAction = "pan-y";
  wrapper.appendChild(canvas);

  const saved: _SavedStyles = {
    bodyOverflowY: document.body.style.overflowY,
    htmlScrollSnapType: document.documentElement.style.scrollSnapType,
    htmlOverscrollBehaviorY: document.documentElement.style.overscrollBehaviorY,
  };
  let _scrollLocked = false;

  const _setStandaloneScrollLocked = (locked: boolean): void => {
    if (_scrollLocked === locked) return;
    _scrollLocked = locked;
    document.body.style.overflowY = locked ? "hidden" : "auto";
  };

  // Делаем нативный scroll страницы (не div), а камеру двигаем по scrollY.
  document.body.style.overflowY = "auto";
  document.documentElement.style.overscrollBehaviorY = "none";
  document.documentElement.style.scrollSnapType = "y mandatory";

  // Создаём \"пустой\" контент в body, чтобы страница реально скроллилась на 3 экрана.
  const prevScrollRoot = document.getElementById("gnomes-scroll-root");
  if (prevScrollRoot) prevScrollRoot.remove();

  const scrollRoot = document.createElement("div");
  scrollRoot.id = "gnomes-scroll-root";
  scrollRoot.style.position = "relative";
  scrollRoot.style.width = "1px";
  scrollRoot.style.pointerEvents = "none";
  scrollRoot.style.opacity = "0";
  scrollRoot.style.userSelect = "none";
  document.body.appendChild(scrollRoot);

  for (let i = 0; i < GNOMES_CONFIG.pages; i++) {
    const snap = document.createElement("div");
    snap.style.height = "100vh";
    snap.style.scrollSnapAlign = "start";
    scrollRoot.appendChild(snap);
  }

  // Всегда стартуем с первого гнома.
  window.scrollTo(0, 0);

  const app = new GnomesApp({
    canvas,
    interactionEl: wrapper,
    uiRoot,
    setScrollY: (scrollY, behavior = "smooth") => {
      window.scrollTo({ top: scrollY, behavior });
    },
    setScrollLocked: _setStandaloneScrollLocked,
  });
  let disposed = false;
  void app.start().catch((e) => {
    if (disposed) return;
    // eslint-disable-next-line no-console
    console.error(e);
  });

  return () => {
    disposed = true;
    app.dispose();

    scrollRoot.remove();
    wrapper.remove();

    document.body.style.overflowY = saved.bodyOverflowY;
    document.documentElement.style.scrollSnapType = saved.htmlScrollSnapType;
    document.documentElement.style.overscrollBehaviorY = saved.htmlOverscrollBehaviorY;
  };
}
