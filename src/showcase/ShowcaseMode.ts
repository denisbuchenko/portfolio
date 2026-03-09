/**
 * ShowcaseMode — режим «Витрина»: все проекты на одной прокручиваемой странице.
 *
 * Порядок секций:
 *   1. Частицы   (1 viewport)
 *   2. Пазл      (1 viewport)
 *   3. Гномы     (3 viewports — камера связана со скроллом)
 *   4. Город     (2 viewports — обзорная камера связана со скроллом)
 *   5. Осьминог  (1 viewport)
 *
 * Для Частиц, Пазла и Города используется «interaction gate» —
 * пользователь сначала скроллит, а при желании нажимает «Взаимодействовать»
 * и получает полный контроль над проектом.
 *
 * Гномы и Осьминог интерактивны по умолчанию (скролл + тап / кнопки).
 */

import { tryCreateWebGL2Context } from "../webgl/context";
import { ParticleApp } from "../projects/particles";
import { PuzzleProject } from "../projects/puzzle/PuzzleProject";
import { GnomesApp } from "../projects/gnomes/GnomesApp";
import { GNOMES_CONFIG } from "../projects/gnomes/config";
import { CityApp } from "../projects/city/CityApp";
import { mountOsminogProject } from "../projects/osminog";
import { mountSunducProject } from "../projects/sunduc";
import type { Overlay } from "../ui/overlay";

// ─── типы ────────────────────────────────────────────────────────────────────

interface ShowcaseOpts {
  host: HTMLElement; // #app
  onBack: () => void;
}

interface SectionDef {
  key: string;
  title: string;
  heightVh?: number;
  needsGate: boolean;
  interactLabel: string;
  layout?: "sticky" | "flow";
}

interface SectionState {
  def: SectionDef;
  el: HTMLElement;
  stickyEl: HTMLElement;
  containerEl: HTMLElement;
  mounted: boolean;
  hot: boolean;
  interacting: boolean;
  blocker: HTMLElement | null;
  interactBtn: HTMLElement | null;
  disposeProject: (() => void) | null;
  activateProject: (() => void) | null;
  deactivateProject: (() => void) | null;
  projectRef: unknown;
}

// ─── секции ──────────────────────────────────────────────────────────────────

const SECTION_DEFS: SectionDef[] = [
  { key: "sunduc", title: "Сундук", needsGate: false, interactLabel: "", layout: "flow" },
  { key: "particles", title: "Частицы", heightVh: 100, needsGate: true, interactLabel: "Взаимодействовать" },
  { key: "puzzle", title: "Пазл", heightVh: 100, needsGate: true, interactLabel: "Взаимодействовать" },
  { key: "gnomes", title: "Гномы", heightVh: GNOMES_CONFIG.pages * 100, needsGate: false, interactLabel: "" },
  { key: "city", title: "Город", heightVh: 200, needsGate: true, interactLabel: "Играть" },
  { key: "osminog", title: "Осьминог", heightVh: 100, needsGate: false, interactLabel: "" },
];

// ─── ShowcaseMode ────────────────────────────────────────────────────────────

export class ShowcaseMode {
  private _host: HTMLElement;
  private _onBack: () => void;
  private _showcaseEl: HTMLElement;
  private _sections: SectionState[] = [];
  private _navEl: HTMLElement;
  private _navItems: HTMLElement[] = [];
  private _backBtn: HTMLElement;
  private _exitBtn: HTMLElement;
  private _raf = 0;
  private _interactingIdx = -1;
  private _warmObserver: IntersectionObserver;
  private _hotObserver: IntersectionObserver;
  private _activeObserver: IntersectionObserver;

  constructor(opts: ShowcaseOpts) {
    this._host = opts.host;
    this._onBack = opts.onBack;

    this._hideExistingUI();

    // Showcase container
    this._showcaseEl = _el("div", "showcase");
    this._host.appendChild(this._showcaseEl);
    this._host.classList.add("showcase-active");

    // Sections
    this._buildSections();

    // Fixed UI
    this._backBtn = this._buildBackBtn();
    this._exitBtn = this._buildExitBtn();
    this._navEl = this._buildNav();

    // Observers:
    // warm  — заранее подготавливает проект в памяти;
    // hot   — включает "живой" режим рядом с viewport;
    // active — обновляет навигацию.
    this._warmObserver = this._createWarmObserver();
    this._hotObserver = this._createHotObserver();
    this._activeObserver = this._createActiveObserver();

    // Scroll listener for scroll-dependent projects
    this._host.addEventListener("scroll", this._onHostScroll, { passive: true });

    // Initial active dot
    this._updateActiveDot(0);
    this._setSectionHot(0, true);

    // Animation loop (for per-frame updates)
    this._raf = requestAnimationFrame(this._tick);
  }

  // ── cleanup ────────────────────────────────────────────────────────────────

  dispose(): void {
    cancelAnimationFrame(this._raf);
    this._host.removeEventListener("scroll", this._onHostScroll);
    this._warmObserver.disconnect();
    this._hotObserver.disconnect();
    this._activeObserver.disconnect();

    for (const s of this._sections) {
      s.deactivateProject?.();
      s.disposeProject?.();
    }

    this._showcaseEl.remove();
    this._backBtn.remove();
    this._exitBtn.remove();
    this._navEl.remove();

    this._host.classList.remove("showcase-active");
    this._host.style.overflow = "";
    this._host.scrollTop = 0;
    this._showExistingUI();
  }

  // ── existing UI visibility ─────────────────────────────────────────────────

  private _hideExistingUI(): void {
    _hide("project-picker");
    _hide("hud");
    const overlay = document.getElementById("overlay");
    overlay?.classList.add("overlay--hidden");
  }

  private _showExistingUI(): void {
    _show("project-picker");
    // hud visibility controlled by individual projects, leave hidden
  }

  // ── DOM: sections ──────────────────────────────────────────────────────────

  private _buildSections(): void {
    for (let i = 0; i < SECTION_DEFS.length; i++) {
      const def = SECTION_DEFS[i];
      const sectionEl = _el("section", "showcase__section");
      const layout = def.layout ?? "sticky";
      if (layout === "sticky") {
        sectionEl.style.height = `${def.heightVh ?? 100}vh`;
      } else {
        sectionEl.classList.add("showcase__section--flow");
      }
      sectionEl.dataset.showcaseIdx = String(i);

      const stickyEl = _el("div", "showcase__sticky");
      if (layout === "flow") stickyEl.classList.add("showcase__sticky--flow");
      sectionEl.appendChild(stickyEl);

      const containerEl = _el("div", "showcase__project-container");
      if (layout === "flow") containerEl.classList.add("showcase__project-container--flow");
      stickyEl.appendChild(containerEl);

      // Loading placeholder
      const loader = _el("div", "showcase__loader");
      loader.textContent = "Загрузка…";
      containerEl.appendChild(loader);

      // Section header
      const header = _el("div", "showcase__section-header");
      header.innerHTML = `<span class="showcase__section-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="showcase__section-title-text">${def.title}</span>`;
      stickyEl.appendChild(header);

      let blocker: HTMLElement | null = null;
      let interactBtn: HTMLElement | null = null;

      if (def.needsGate) {
        blocker = _el("div", "showcase__event-blocker");
        stickyEl.appendChild(blocker);

        interactBtn = document.createElement("button");
        interactBtn.className = "btn showcase__interact-btn";
        (interactBtn as HTMLButtonElement).type = "button";
        interactBtn.textContent = def.interactLabel;
        stickyEl.appendChild(interactBtn);

        const idx = i;
        interactBtn.addEventListener("click", () => this._startInteraction(idx));
      }

      this._showcaseEl.appendChild(sectionEl);

      this._sections.push({
        def,
        el: sectionEl,
        stickyEl,
        containerEl,
        mounted: false,
        hot: false,
        interacting: false,
        blocker,
        interactBtn,
        disposeProject: null,
        activateProject: null,
        deactivateProject: null,
        projectRef: null,
      });
    }
  }

  // ── DOM: fixed UI ──────────────────────────────────────────────────────────

  private _buildBackBtn(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "btn showcase__back-btn";
    btn.type = "button";
    btn.textContent = "← В меню";
    btn.addEventListener("click", () => this._onBack());
    this._host.appendChild(btn);
    return btn;
  }

  private _buildExitBtn(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "btn showcase__exit-btn showcase__exit-btn--hidden";
    btn.type = "button";
    btn.textContent = "← Вернуться к просмотру";
    btn.addEventListener("click", () => this._stopInteraction());
    this._host.appendChild(btn);
    return btn;
  }

  private _buildNav(): HTMLElement {
    const nav = _el("div", "showcase__nav");

    for (let i = 0; i < SECTION_DEFS.length; i++) {
      const item = _el("div", "showcase__nav-item");

      const label = _el("span", "showcase__nav-label");
      label.textContent = SECTION_DEFS[i].title;

      const dot = _el("div", "showcase__nav-dot");

      item.appendChild(label);
      item.appendChild(dot);

      const sectionEl = this._sections[i].el;
      item.addEventListener("click", () => {
        sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      nav.appendChild(item);
      this._navItems.push(item);
    }

    this._host.appendChild(nav);
    return nav;
  }

  // ── observers ──────────────────────────────────────────────────────────────

  private _createWarmObserver(): IntersectionObserver {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.showcaseIdx ?? -1);
          if (idx >= 0) this._ensureSectionWarm(idx);
        }
      },
      { root: this._host, rootMargin: "175% 0px" }
    );
    for (const s of this._sections) obs.observe(s.el);
    return obs;
  }

  private _createHotObserver(): IntersectionObserver {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.showcaseIdx ?? -1);
          if (idx < 0) continue;
          this._setSectionHot(idx, entry.isIntersecting);
        }
      },
      { root: this._host, rootMargin: "75% 0px" }
    );
    for (const s of this._sections) obs.observe(s.el);
    return obs;
  }

  private _createActiveObserver(): IntersectionObserver {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.showcaseIdx ?? -1);
          if (idx >= 0 && entry.isIntersecting) this._updateActiveDot(idx);
        }
      },
      { root: this._host, rootMargin: "-40% 0px -40% 0px" }
    );
    for (const s of this._sections) obs.observe(s.el);
    return obs;
  }

  private _updateActiveDot(idx: number): void {
    for (let i = 0; i < this._navItems.length; i++) {
      this._navItems[i].classList.toggle("showcase__nav-item--active", i === idx);
    }
  }

  private _ensureSectionWarm(idx: number): void {
    const s = this._sections[idx];
    if (!s || s.mounted) return;
    this._mountSection(idx);
  }

  private _setSectionHot(idx: number, hot: boolean): void {
    const s = this._sections[idx];
    if (!s) return;

    if (hot) this._ensureSectionWarm(idx);
    if (!s.mounted) return;
    if (s.hot === hot) return;
    if (!hot && s.interacting) return;

    s.hot = hot;
    if (hot) {
      s.activateProject?.();
      if (s.def.key === "city" && !s.interacting) this._updateCityProgress();
      return;
    }
    s.deactivateProject?.();
  }

  private _callProjectMethod(
    project: unknown,
    trueMethodNames: string[],
    falseMethodNames?: string[],
    flag?: boolean
  ): void {
    if (!project) return;

    const methodNames = typeof flag === "boolean" ? (flag ? trueMethodNames : falseMethodNames ?? []) : trueMethodNames;
    for (const methodName of methodNames) {
      const candidate = (project as Record<string, unknown>)[methodName];
      if (typeof candidate !== "function") continue;
      if (typeof flag === "boolean" && candidate.length >= 1) {
        (candidate as (value: boolean) => void)(flag);
      } else {
        (candidate as () => void)();
      }
      return;
    }
  }

  // ── mount projects ─────────────────────────────────────────────────────────

  private _mountSection(idx: number): void {
    const s = this._sections[idx];
    if (s.mounted) return;
    s.mounted = true;
    // Remove loader
    const loader = s.containerEl.querySelector(".showcase__loader");
    loader?.remove();

    try {
      switch (s.def.key) {
        case "sunduc":
          this._mountSunduc(s);
          break;
        case "particles":
          this._mountParticles(s);
          break;
        case "puzzle":
          this._mountPuzzle(s);
          break;
        case "gnomes":
          this._mountGnomes(s);
          break;
        case "city":
          this._mountCity(s);
          break;
        case "osminog":
          this._mountOsminog(s);
          break;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[Showcase] mount «${s.def.key}» failed:`, e);
      s.containerEl.innerHTML = `<div class="showcase__error"><p>Ошибка: ${e instanceof Error ? e.message : String(e)}</p></div>`;
    }
  }

  /* ── Particles ── */

  private _mountSunduc(s: SectionState): void {
    const container = s.containerEl;
    container.innerHTML = "";

    const project = mountSunducProject(container, { embedded: true });
    project.setRenderActive(s.hot);
    s.projectRef = project;
    s.disposeProject = () => project.dispose();
    s.activateProject = () => {
      project.resume();
    };
    s.deactivateProject = () => {
      project.pause();
    };
  }

  /* ── Particles ── */

  private _mountParticles(s: SectionState): void {
    const { canvas, gl } = tryCreateWebGL2Context();
    if (!gl) {
      s.containerEl.innerHTML = '<div class="showcase__error"><p>WebGL2 не поддерживается</p></div>';
      return;
    }

    // Dummy overlay (showcase-local)
    const dummyOverlay: Overlay = {
      show(title: string, text: string) {
        // eslint-disable-next-line no-console
        console.warn(`[Particles] ${title}: ${text}`);
      },
      hide() {
        /* noop */
      },
    };

    const app = new ParticleApp({ canvas, gl, overlay: dummyOverlay });
    // ParticleApp appends canvas to #app — move it into our section
    s.containerEl.appendChild(canvas);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    app.setRenderActive(s.hot);

    s.projectRef = app;
    s.disposeProject = () => app.dispose();
    s.activateProject = () => {
      app.resume();
    };
    s.deactivateProject = () => {
      app.pause();
    };
  }

  /* ── Puzzle ── */

  private _mountPuzzle(s: SectionState): void {
    const host = s.containerEl;
    host.style.display = "grid";
    host.classList.add("launcher", "launcher--puzzle");

    const project = new PuzzleProject(host);
    project.setRenderActive(s.hot);
    s.projectRef = project;
    s.disposeProject = () => project.dispose();
    s.activateProject = () => {
      project.resume();
    };
    s.deactivateProject = () => {
      project.pause();
    };
  }

  /* ── Gnomes ── */

  private _mountGnomes(s: SectionState): void {
    const container = s.containerEl;
    container.innerHTML = "";

    const wrapper = _el("div");
    wrapper.style.cssText = "position:absolute;inset:0;pointer-events:auto;";
    container.appendChild(wrapper);

    const uiRoot = _el("div");
    uiRoot.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:20;";
    wrapper.appendChild(uiRoot);

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;touch-action:pan-y;";
    wrapper.appendChild(canvas);

    const status = _el("div");
    status.style.cssText = `
      position:absolute;left:14px;bottom:14px;z-index:6;
      font-size:12px;color:var(--muted);padding:8px 10px;
      border:1px solid var(--panel-border);border-radius:12px;
      background:var(--panel);backdrop-filter:blur(10px);
      pointer-events:none;
    `;
    status.textContent = "Загрузка…";
    wrapper.appendChild(status);

    // getScrollY: map host scrollTop → section-local scroll
    const sectionEl = s.el;
    const hostEl = this._host;
    const getScrollY = (): number => Math.max(0, hostEl.scrollTop - sectionEl.offsetTop);

    const app = new GnomesApp({ canvas, statusEl: status, uiRoot, getScrollY });
    app.setRenderActive(s.hot);

    let disposed = false;
    void app.start().catch((e) => {
      if (disposed) return;
      status.textContent = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error(e);
    });

    s.projectRef = app;
    s.disposeProject = () => {
      disposed = true;
      app.dispose();
    };
    s.activateProject = () => {
      app.resume();
    };
    s.deactivateProject = () => {
      app.pause();
    };
  }

  /* ── City ── */

  private _mountCity(s: SectionState): void {
    const container = s.containerEl;
    container.innerHTML = "";

    const wrapper = _el("div");
    wrapper.style.cssText = "position:absolute;inset:0;pointer-events:auto;";
    container.appendChild(wrapper);

    const uiRoot = document.createElement("div") as HTMLDivElement;
    uiRoot.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:30;";
    uiRoot.dataset.cityUi = "1";
    wrapper.appendChild(uiRoot);

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;touch-action:none;";
    wrapper.appendChild(canvas);

    const app = new CityApp({ host: wrapper, canvas, uiRoot });
    let started = false;
    const _ensureStarted = (): void => {
      if (started) return;
      started = true;
      // Отключаем внутренний скролл: в витрине прогресс задается извне.
      app.setScrollInputEnabled(false);
      void app.start();
    };

    s.projectRef = app;
    s.disposeProject = () => app.dispose();
    s.activateProject = () => {
      _ensureStarted();
      this._callProjectMethod(app, ["resume", "wake"]);
      this._callProjectMethod(app, ["setRenderActive", "setAnimationActive"], ["setRenderActive", "setAnimationActive"], true);
      if (!s.interacting) app.setScrollInputEnabled(false);
    };
    s.deactivateProject = () => {
      app.setScrollInputEnabled(false);
      this._callProjectMethod(app, ["pause", "sleep", "suspend"]);
      this._callProjectMethod(app, ["setRenderActive", "setAnimationActive"], ["setRenderActive", "setAnimationActive"], false);
    };
  }

  /* ── Osminog ── */

  private _mountOsminog(s: SectionState): void {
    const container = s.containerEl;
    container.innerHTML = "";

    const project = mountOsminogProject(container);

    // Убираем кнопку «В меню» из осьминога (в витрине она не нужна)
    const menuBtn = container.querySelector(".osminog__menu");
    menuBtn?.remove();

    project.setRenderActive(s.hot);

    s.projectRef = project;
    s.disposeProject = () => project.dispose();
    s.activateProject = () => {
      project.resume();
    };
    s.deactivateProject = () => {
      project.pause();
    };
  }

  // ── interaction gate ───────────────────────────────────────────────────────

  private _startInteraction(idx: number): void {
    const s = this._sections[idx];
    if (!s || s.interacting) return;
    this._setSectionHot(idx, true);
    s.interacting = true;
    this._interactingIdx = idx;

    // Block page scroll
    this._host.style.overflow = "hidden";

    // Hide gate UI
    if (s.blocker) s.blocker.style.display = "none";
    if (s.interactBtn) s.interactBtn.style.display = "none";

    // Show exit, hide back & nav
    this._exitBtn.classList.remove("showcase__exit-btn--hidden");
    this._backBtn.classList.add("showcase__back-btn--hidden");
    this._navEl.classList.add("showcase__nav--hidden");

    // Project-specific activation
    if (s.def.key === "city") {
      (s.projectRef as CityApp)?.setScrollInputEnabled(true);
    }
  }

  private _stopInteraction(): void {
    const idx = this._interactingIdx;
    if (idx < 0) return;
    const s = this._sections[idx];
    if (!s) return;

    s.interacting = false;
    this._interactingIdx = -1;

    // Resume page scroll
    this._host.style.overflow = "";

    // Restore gate UI
    if (s.blocker) s.blocker.style.display = "";
    if (s.interactBtn) s.interactBtn.style.display = "";

    // Restore fixed UI
    this._exitBtn.classList.add("showcase__exit-btn--hidden");
    this._backBtn.classList.remove("showcase__back-btn--hidden");
    this._navEl.classList.remove("showcase__nav--hidden");

    // Project-specific deactivation
    if (s.def.key === "city") {
      (s.projectRef as CityApp)?.setScrollInputEnabled(false);
    }
  }

  // ── per-frame / per-scroll updates ─────────────────────────────────────────

  private _onHostScroll = (): void => {
    this._updateCityProgress();
  };

  private _tick = (t: number): void => {
    this._raf = requestAnimationFrame(this._tick);
    // Gnomes scrollY обновляется внутри GnomesApp._frame через getScrollY().
    // Город обновляем при скролле (onHostScroll).
    void t;
  };

  private _updateCityProgress(): void {
    const cityIdx = this._sections.findIndex((s) => s.def.key === "city");
    if (cityIdx < 0) return;
    const s = this._sections[cityIdx];
    if (!s.mounted || s.interacting) return;

    const app = s.projectRef as CityApp | null;
    if (!app) return;

    const sectionTop = s.el.offsetTop;
    const sectionHeight = s.el.clientHeight;
    const vh = window.innerHeight;
    const maxScroll = Math.max(1, sectionHeight - vh);
    const localScroll = Math.max(0, this._host.scrollTop - sectionTop);
    const progress = Math.min(1, localScroll / maxScroll);

    app.setOverviewProgress(progress);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function _el(tag: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function _hide(id: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function _show(id: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}
