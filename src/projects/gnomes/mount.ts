import "./gnomes.css";
import { GNOMES_CONFIG } from "./config";
import { GnomesApp } from "./GnomesApp";

export function mountGnomesProject(host: HTMLElement): () => void {
  host.innerHTML = "";
  host.classList.add("gnomes-project-host");

  const wrapper = document.createElement("div");
  wrapper.className = "gnomes-project";
  host.appendChild(wrapper);

  const uiRoot = document.createElement("div");
  uiRoot.className = "gnomes-project__ui";
  wrapper.appendChild(uiRoot);

  const canvas = document.createElement("canvas");
  canvas.className = "gnomes-project__canvas";
  wrapper.appendChild(canvas);

  let _scrollLocked = false;

  const _setStandaloneScrollLocked = (locked: boolean): void => {
    if (_scrollLocked === locked) return;
    _scrollLocked = locked;
    document.body.classList.toggle("gnomes-project-scroll-locked", locked);
  };

  // Делаем нативный scroll страницы (не div), а камеру двигаем по scrollY.
  document.body.classList.add("gnomes-project-scroll");
  document.documentElement.classList.add("gnomes-project-scroll");

  // Создаём \"пустой\" контент в body, чтобы страница реально скроллилась на 3 экрана.
  const prevScrollRoot = document.getElementById("gnomes-scroll-root");
  if (prevScrollRoot) prevScrollRoot.remove();

  const scrollRoot = document.createElement("div");
  scrollRoot.id = "gnomes-scroll-root";
  scrollRoot.className = "gnomes-project__scroll-root";
  document.body.appendChild(scrollRoot);

  for (let i = 0; i < GNOMES_CONFIG.pages; i++) {
    const snap = document.createElement("div");
    snap.className = "gnomes-project__scroll-snap";
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
    host.classList.remove("gnomes-project-host");
    document.body.classList.remove("gnomes-project-scroll", "gnomes-project-scroll-locked");
    document.documentElement.classList.remove("gnomes-project-scroll");
  };
}
