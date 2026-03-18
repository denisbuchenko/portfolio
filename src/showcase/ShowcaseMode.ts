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
import { CITY_CAMERA } from "../projects/city/cityConfig";
import { mountOsminogProject } from "../projects/osminog";
import { mountSunducProject } from "../projects/sunduc";
import type { Overlay } from "../ui/overlay";
import { ShowcaseInventory } from "./ShowcaseInventory";
import { ShowcaseBackdrop } from "./ShowcaseBackdrop";

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
  viewportEl: HTMLElement;
  containerEl: HTMLElement;
  mounted: boolean;
  hot: boolean;
  interacting: boolean;
  blocker: HTMLElement | null;
  interactBtn: HTMLElement | null;
  disposeProject: (() => void) | null;
  activateProject: (() => void) | null;
  deactivateProject: (() => void) | null;
  cleanupSection: (() => void) | null;
  projectRef: unknown;
  readyPromise: Promise<void> | null;
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

// ─── activation tuning ──────────────────────────────────────────────────────

const ACTIVATION_STAGGER_MS = 80;
const FAST_SCROLL_VELOCITY_PX_S = 3000;
const SCROLL_SETTLE_MS = 120;

// ─── preload manifest ───────────────────────────────────────────────────────

const PRELOAD_ITEMS: Array<{ url: string; weight: number }> = [
  { url: "/city/city.glb", weight: 59 },
  { url: "/gnomes/export.glb", weight: 50 },
  { url: "/city/Chel.glb", weight: 8 },
  { url: "/3dmodels/3d_props_-_adorable_foods/scene.bin", weight: 4 },
  { url: "/sunduc/sunduc.glb", weight: 3 },
  { url: "/city/Girl.glb", weight: 2 },
  { url: "/sunduc/dudu.glb", weight: 1 },
  { url: "/osminog/osminog%20.json", weight: 1 },
  { url: "/3dmodels/3d_props_-_adorable_foods/scene.gltf", weight: 1 },
  { url: "/img-lol.jpg", weight: 1 },
  { url: "/gnomes/hor.jpg", weight: 1 },
  { url: "/gnomes/fi.jpg", weight: 1 },
  { url: "/gnomes/pi.jpg", weight: 1 },
  { url: "/paths/treble-clef.svg", weight: 1 },
];
const LOTTIE_IMPORT_WEIGHT = 2;

// ─── ShowcaseMode ────────────────────────────────────────────────────────────

export class ShowcaseMode {
  private _host: HTMLElement;
  private _showcaseEl!: HTMLElement;
  private _backdrop: ShowcaseBackdrop | null = null;
  private _sections: SectionState[] = [];
  private _inventoryUi!: ShowcaseInventory;
  private _exitBtn!: HTMLElement;
  private _interactingIdx = -1;
  private _pendingInteractionIdx = -1;
  private _osminogAligning = false;
  private _warmObserver!: IntersectionObserver;
  private _hotObserver!: IntersectionObserver;
  private _activeObserver!: IntersectionObserver;

  private _activationQueue = new Set<number>();
  private _activationTimer = 0;
  private _scrollSettleTimer = 0;
  private _prevScrollTop = 0;
  private _prevScrollTs = 0;
  private _scrollVelocityPxS = 0;
  private _resizeObserver: ResizeObserver | null = null;
  private _resizeRaf = 0;

  private _loadingEl: HTMLElement | null = null;
  private _disposed = false;
  private _preloadDone = false;

  constructor(opts: ShowcaseOpts) {
    this._host = opts.host;
    void opts.onBack;

    this._hideExistingUI();
    this._host.classList.add("showcase-active");

    this._loadingEl = this._buildLoadingScreen();
    this._host.appendChild(this._loadingEl);

    void this._preloadAndStart();
  }

  // ── preloading ──────────────────────────────────────────────────────────────

  private _buildLoadingScreen(): HTMLElement {
    const overlay = _el("div", "showcase__loading");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "1000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#070a10",
    });

    const content = _el("div");
    content.style.cssText = "text-align:center;width:260px;";

    const label = _el("p");
    label.textContent = "Скачиваем весь контент";
    label.style.cssText =
      "color:#fff;font-size:14px;margin:0 0 16px;font-family:system-ui,sans-serif;opacity:.7;letter-spacing:.02em;";

    const track = _el("div");
    track.style.cssText =
      "width:100%;height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;";

    const fill = _el("div");
    fill.style.cssText =
      "width:0%;height:100%;background:#fff;border-radius:2px;transition:width .3s ease;";
    fill.dataset.role = "fill";

    const pct = _el("p");
    pct.textContent = "0%";
    pct.style.cssText =
      "color:#fff;font-size:12px;margin:10px 0 0;font-family:system-ui,sans-serif;opacity:.5;";
    pct.dataset.role = "percent";

    track.appendChild(fill);
    content.appendChild(label);
    content.appendChild(track);
    content.appendChild(pct);
    overlay.appendChild(content);

    return overlay;
  }

  private _updateLoadingProgress(percent: number): void {
    if (!this._loadingEl) return;
    const fill = this._loadingEl.querySelector<HTMLElement>('[data-role="fill"]');
    const pct = this._loadingEl.querySelector<HTMLElement>('[data-role="percent"]');
    if (fill) fill.style.width = `${percent}%`;
    if (pct) pct.textContent = `${percent}%`;
  }

  private async _preloadAssets(): Promise<void> {
    const totalWeight = PRELOAD_ITEMS.reduce((s, i) => s + i.weight, 0) + LOTTIE_IMPORT_WEIGHT;
    let completedWeight = 0;

    const tick = (weight: number): void => {
      completedWeight += weight;
      if (!this._disposed)
        this._updateLoadingProgress(Math.min(100, Math.round((completedWeight / totalWeight) * 100)));
    };

    const fetchOne = async (item: { url: string; weight: number }): Promise<void> => {
      try {
        await (await fetch(item.url)).blob();
      } catch {
        /* project handles its own errors */
      }
      tick(item.weight);
    };

    const importLottie = async (): Promise<void> => {
      try {
        await import("lottie-web");
      } catch {
        /* ignore */
      }
      tick(LOTTIE_IMPORT_WEIGHT);
    };

    await Promise.all([...PRELOAD_ITEMS.map(fetchOne), importLottie()]);
  }

  private async _preloadAndStart(): Promise<void> {
    await this._preloadAssets();
    if (this._disposed) return;

    this._initShowcase();
    if (this._disposed) return;

    for (let i = 0; i < this._sections.length; i++) {
      this._ensureSectionWarm(i);
    }

    const readyPromises = this._sections
      .map((s) => s.readyPromise)
      .filter((p): p is Promise<void> => p !== null);
    if (readyPromises.length > 0) {
      await Promise.all(readyPromises);
      if (this._disposed) return;
    }

    if (this._loadingEl) {
      this._loadingEl.style.transition = "opacity .4s ease";
      this._loadingEl.style.opacity = "0";
      await new Promise<void>((r) => setTimeout(r, 420));
      if (this._disposed) return;
      this._loadingEl.remove();
      this._loadingEl = null;
    }
  }

  private _initShowcase(): void {
    this._showcaseEl = _el("div", "showcase");
    this._host.appendChild(this._showcaseEl);

    this._buildSections();
    this._backdrop = new ShowcaseBackdrop({
      host: this._showcaseEl,
      sections: this._sections.map((section) => ({
        key: section.def.key,
        el: section.el,
      })),
    });

    this._exitBtn = this._buildExitBtn();
    this._inventoryUi = new ShowcaseInventory({ host: this._host });

    this._warmObserver = this._createWarmObserver();
    this._hotObserver = this._createHotObserver();
    this._activeObserver = this._createActiveObserver();

    this._host.addEventListener("scroll", this._onHostScroll, { passive: true });
    window.addEventListener("resize", this._onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", this._onResize, { passive: true });
    this._resizeObserver = new ResizeObserver(() => this._scheduleResizeSync());
    this._resizeObserver.observe(this._host);
    this._resizeObserver.observe(this._showcaseEl);

    this._updateActiveSection(0);
    this._forceActivateSection(0);

    this._prevScrollTop = this._host.scrollTop;
    this._prevScrollTs = performance.now();
    this._preloadDone = true;
  }

  public async alignProject(projectKeyOrIdx: string | number, behavior: ScrollBehavior = "smooth"): Promise<boolean> {
    const idx = this._resolveSectionIdx(projectKeyOrIdx);
    if (idx < 0) return false;

    await this._alignSectionToViewport(idx, behavior);
    return true;
  }

  // ── cleanup ────────────────────────────────────────────────────────────────

  dispose(): void {
    this._disposed = true;

    this._loadingEl?.remove();
    this._loadingEl = null;

    if (this._activationTimer) { window.clearTimeout(this._activationTimer); this._activationTimer = 0; }
    if (this._scrollSettleTimer) { window.clearTimeout(this._scrollSettleTimer); this._scrollSettleTimer = 0; }
    this._activationQueue.clear();

    if (this._preloadDone) {
      this._host.removeEventListener("scroll", this._onHostScroll);
      window.removeEventListener("resize", this._onResize);
      window.visualViewport?.removeEventListener("resize", this._onResize);
      if (this._resizeRaf) {
        cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = 0;
      }
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
      this._warmObserver.disconnect();
      this._hotObserver.disconnect();
      this._activeObserver.disconnect();
      this._backdrop?.dispose();
      this._backdrop = null;

      for (const s of this._sections) {
        s.cleanupSection?.();
        s.deactivateProject?.();
        s.disposeProject?.();
      }

      this._showcaseEl.remove();
      this._exitBtn.remove();
      this._inventoryUi.dispose();
    }

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
        sectionEl.style.height = `calc(var(--app-visible-height) * ${(def.heightVh ?? 100) / 100})`;
      } else {
        sectionEl.classList.add("showcase__section--flow");
      }
      sectionEl.dataset.showcaseIdx = String(i);

      const stickyEl = _el("div", "showcase__sticky");
      if (layout === "flow") stickyEl.classList.add("showcase__sticky--flow");
      sectionEl.appendChild(stickyEl);

      const viewportEl = _el("div", "showcase__viewport");
      if (layout === "flow") viewportEl.classList.add("showcase__viewport--flow");
      stickyEl.appendChild(viewportEl);

      const containerEl = _el("div", "showcase__project-container");
      if (layout === "flow") containerEl.classList.add("showcase__project-container--flow");
      viewportEl.appendChild(containerEl);

      // Loading placeholder
      const loader = _el("div", "showcase__loader");
      loader.textContent = "Загрузка…";
      containerEl.appendChild(loader);

      let blocker: HTMLElement | null = null;
      let interactBtn: HTMLElement | null = null;

      if (def.needsGate) {
        blocker = _el("div", "showcase__event-blocker");
        viewportEl.appendChild(blocker);

        interactBtn = document.createElement("button");
        interactBtn.className = "btn showcase__interact-btn";
        (interactBtn as HTMLButtonElement).type = "button";
        interactBtn.textContent = def.interactLabel;
        viewportEl.appendChild(interactBtn);

        const idx = i;
        interactBtn.addEventListener("click", () => {
          void this._startInteraction(idx);
        });
      }

      this._showcaseEl.appendChild(sectionEl);

      this._sections.push({
        def,
        el: sectionEl,
        stickyEl,
        viewportEl,
        containerEl,
        mounted: false,
        hot: false,
        interacting: false,
        blocker,
        interactBtn,
        disposeProject: null,
        activateProject: null,
        deactivateProject: null,
        cleanupSection: null,
        projectRef: null,
        readyPromise: null,
      });
    }
  }

  // ── DOM: fixed UI ──────────────────────────────────────────────────────────

  private _buildExitBtn(): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "btn showcase__exit-btn showcase__exit-btn--hidden";
    btn.type = "button";
    btn.textContent = "← Вернуться к просмотру";
    btn.addEventListener("click", () => this._stopInteraction());
    this._host.appendChild(btn);
    return btn;
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
      { root: this._host, rootMargin: "15% 0px" }
    );
    for (const s of this._sections) obs.observe(s.el);
    return obs;
  }

  private _createActiveObserver(): IntersectionObserver {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.showcaseIdx ?? -1);
          if (idx >= 0 && entry.isIntersecting) this._updateActiveSection(idx);
        }
      },
      { root: this._host, rootMargin: "-40% 0px -40% 0px" }
    );
    for (const s of this._sections) obs.observe(s.el);
    return obs;
  }

  private _updateActiveSection(idx: number): void {
    void idx;
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
      if (this._shouldActivateImmediatelyOnHot(s.def.key)) {
        this._activationQueue.delete(idx);
        s.activateProject?.();
        if (s.def.key === "city" && !s.interacting) this._updateCityProgress();
        return;
      }
      this._activationQueue.add(idx);
      this._scheduleActivation();
      return;
    }
    this._activationQueue.delete(idx);
    s.deactivateProject?.();
  }

  private _forceActivateSection(idx: number): void {
    const s = this._sections[idx];
    if (!s) return;
    this._ensureSectionWarm(idx);
    if (!s.mounted) return;
    s.hot = true;
    this._activationQueue.delete(idx);
    s.activateProject?.();
    if (s.def.key === "city" && !s.interacting) this._updateCityProgress();
  }

  private _shouldActivateImmediatelyOnHot(sectionKey: string): boolean {
    return sectionKey === "gnomes" || sectionKey === "city";
  }

  private _scheduleActivation(): void {
    if (this._activationTimer) return;
    if (this._scrollVelocityPxS > FAST_SCROLL_VELOCITY_PX_S) {
      this._scheduleScrollSettle();
      return;
    }

    this._activationTimer = window.setTimeout(() => {
      this._activationTimer = 0;
      this._processNextActivation();
    }, ACTIVATION_STAGGER_MS);
  }

  private _scheduleScrollSettle(): void {
    if (this._scrollSettleTimer) window.clearTimeout(this._scrollSettleTimer);
    this._scrollSettleTimer = window.setTimeout(() => {
      this._scrollSettleTimer = 0;
      this._scrollVelocityPxS = 0;
      if (this._activationQueue.size > 0) this._scheduleActivation();
    }, SCROLL_SETTLE_MS);
  }

  private _processNextActivation(): void {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (const idx of this._activationQueue) {
      const s = this._sections[idx];
      if (!s?.hot || !s.mounted) {
        this._activationQueue.delete(idx);
        continue;
      }
      const dist = this._distToViewportCenter(idx);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      this._activationQueue.delete(bestIdx);
      const s = this._sections[bestIdx];
      s.activateProject?.();
      if (s.def.key === "city" && !s.interacting) this._updateCityProgress();
    }
    if (this._activationQueue.size > 0) this._scheduleActivation();
  }

  private _distToViewportCenter(idx: number): number {
    const s = this._sections[idx];
    if (!s) return Infinity;
    const sRect = s.el.getBoundingClientRect();
    const hRect = this._host.getBoundingClientRect();
    return Math.abs(sRect.top + sRect.height * 0.5 - hRect.top - hRect.height * 0.5);
  }

  private _updateScrollVelocity(): void {
    const now = performance.now();
    const dtSec = Math.max(0.001, (now - this._prevScrollTs) * 0.001);
    const dPx = Math.abs(this._host.scrollTop - this._prevScrollTop);
    this._prevScrollTop = this._host.scrollTop;
    this._prevScrollTs = now;
    this._scrollVelocityPxS = this._scrollVelocityPxS * 0.7 + (dPx / dtSec) * 0.3;
  }

  private _resolveSectionIdx(projectKeyOrIdx: string | number): number {
    if (typeof projectKeyOrIdx === "number") {
      return projectKeyOrIdx >= 0 && projectKeyOrIdx < this._sections.length ? projectKeyOrIdx : -1;
    }

    return this._sections.findIndex((section) => section.def.key === projectKeyOrIdx);
  }

  private async _alignSectionToViewport(idx: number, behavior: ScrollBehavior): Promise<void> {
    const s = this._sections[idx];
    if (!s) return;

    const sectionTop = this._getSectionAlignScrollTop(s);
    const viewportHeight = this._host.clientHeight;
    const maxScrollTop = Math.max(0, this._host.scrollHeight - viewportHeight);
    this._ensureSectionWarm(idx);
    const nextScrollTop = Math.max(0, Math.min(sectionTop, maxScrollTop));
    await this._scrollHostTo(nextScrollTop, behavior);
    this._updateActiveSection(idx);
    this._updateCityProgress();
  }

  private _getSectionMiddleScrollTop(idx: number): number {
    const s = this._sections[idx];
    if (!s) return this._host.scrollTop;

    const localMaxScroll = Math.max(0, s.el.offsetHeight - this._host.clientHeight);
    return s.el.offsetTop + localMaxScroll * 0.5;
  }

  private async _centerCitySectionInShowcase(behavior: ScrollBehavior): Promise<void> {
    const cityIdx = this._resolveSectionIdx("city");
    if (cityIdx < 0) return;

    this._ensureSectionWarm(cityIdx);
    const citySection = this._sections[cityIdx];
    const cityApp = citySection?.projectRef as CityApp | null;
    cityApp?.setOverviewProgress(0.5);

    const targetScrollTop = this._getSectionMiddleScrollTop(cityIdx);
    await this._scrollHostTo(targetScrollTop, behavior);
    this._updateActiveSection(cityIdx);
    this._updateCityProgress();
  }

  private _restoreViewingMode(idx: number): void {
    const s = this._sections[idx];
    if (!s) return;

    s.interacting = false;
    this._interactingIdx = -1;

    this._host.style.overflow = "";
    if (s.blocker) s.blocker.style.display = "";
    if (s.interactBtn) s.interactBtn.style.display = "";

    this._exitBtn.classList.add("showcase__exit-btn--hidden");
    this._inventoryUi.setHidden(false);
  }

  private _exitCityInteraction(opts?: { resetProject?: boolean; centerSection?: boolean; behavior?: ScrollBehavior }): void {
    const cityIdx = this._resolveSectionIdx("city");
    if (cityIdx < 0) return;

    const s = this._sections[cityIdx];
    const cityApp = s?.projectRef as CityApp | null;
    if (!s || !s.interacting) return;

    this._pendingInteractionIdx = -1;
    this._restoreViewingMode(cityIdx);

    if (opts?.resetProject !== false) {
      cityApp?.resetToOverview(0.5);
    }
    cityApp?.setScrollInputEnabled(false);

    if (opts?.centerSection !== false) {
      void this._centerCitySectionInShowcase(opts?.behavior ?? "auto");
    }
  }

  private _updateOsminogVisibilityState(): void {
    const osminogIdx = this._resolveSectionIdx("osminog");
    if (osminogIdx < 0) return;

    const s = this._sections[osminogIdx];
    if (!s?.mounted) return;
    if (this._osminogAligning) return;

    const hostRect = this._host.getBoundingClientRect();
    const animEl = s.containerEl.querySelector(".osminog__anim");
    if (!(animEl instanceof HTMLElement)) return;

    const animRect = animEl.getBoundingClientRect();
    const thresholdPx = 4;
    const isAnimFullyVisible =
      animRect.top >= hostRect.top - thresholdPx && animRect.bottom <= hostRect.bottom + thresholdPx;
    if (isAnimFullyVisible) return;

    const project = s.projectRef as
      | { isDuduInteractionActive?: () => boolean; cancelDuduInteraction?: () => void }
      | null;
    if (!project?.isDuduInteractionActive?.()) return;

    project.cancelDuduInteraction?.();
  }

  private _getSectionAlignScrollTop(s: SectionState): number {
    const hostRect = this._host.getBoundingClientRect();
    const sectionRect = s.el.getBoundingClientRect();
    return this._host.scrollTop + (sectionRect.top - hostRect.top);
  }

  private _getLockedInteractionScrollTop(idx: number): number {
    const s = this._sections[idx];
    if (!s) return this._host.scrollTop;
    return s.def.key === "city" ? this._getSectionMiddleScrollTop(idx) : this._getSectionAlignScrollTop(s);
  }

  private async _scrollHostTo(top: number, behavior: ScrollBehavior): Promise<void> {
    const thresholdPx = 2;
    const currentTop = this._host.scrollTop;
    if (Math.abs(currentTop - top) <= thresholdPx) {
      this._host.scrollTop = top;
      return;
    }

    if (behavior === "auto") {
      this._host.scrollTop = top;
      return;
    }

    this._host.scrollTo({ top, behavior });

    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const maxWaitMs = 1200;

      const _waitForScrollEnd = (): void => {
        if (Math.abs(this._host.scrollTop - top) <= thresholdPx) {
          this._host.scrollTop = top;
          resolve();
          return;
        }

        if (performance.now() - startedAt >= maxWaitMs) {
          this._host.scrollTop = top;
          resolve();
          return;
        }

        requestAnimationFrame(_waitForScrollEnd);
      };

      requestAnimationFrame(_waitForScrollEnd);
    });
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

    const project = mountSunducProject(container, {
      embedded: true,
      onRestoreKeyRequest: () => {
        this._inventoryUi.restoreItem("key");
      },
    });
    let rotationResetRequestedForDrag = false;
    const unsubscribeInventoryDrag = this._inventoryUi.subscribeDrag((event) => {
      if (event.phase === "start") {
        rotationResetRequestedForDrag = false;
      }

      if (!rotationResetRequestedForDrag && event.phase !== "end" && project.canAcceptInventoryItem(event.itemId)) {
        rotationResetRequestedForDrag = true;
        project.resetRotationToInitial(0.5);
      }

      if (event.phase !== "end") return;
      rotationResetRequestedForDrag = false;
      if (!project.hitTestInventoryDrop(event.clientX, event.clientY)) return;

      const dropResult = project.acceptInventoryItem(event.itemId);
      if (!dropResult.accepted) return;

      if (dropResult.consumeItemId) {
        this._inventoryUi.consumeItem(dropResult.consumeItemId);
      }
      if (dropResult.closeInventory) {
        this._inventoryUi.close();
      }

      void dropResult.completion?.then((completion) => {
        if (!completion?.rewardItemId) return;
        this._inventoryUi.addItem(completion.rewardItemId);
      });
    });

    project.setRenderActive(s.hot);
    s.projectRef = project;
    s.cleanupSection = unsubscribeInventoryDrag;
    s.disposeProject = () => {
      unsubscribeInventoryDrag();
      s.cleanupSection = null;
      project.dispose();
    };
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

    let _stoneRewardTimeoutId: number | null = null;
    const _scheduleStoneReward = (): void => {
      if (_stoneRewardTimeoutId !== null) return;
      if (this._inventoryUi.wasItemGranted("stone1")) return;
      _stoneRewardTimeoutId = window.setTimeout(() => {
        _stoneRewardTimeoutId = null;
        if (this._inventoryUi.wasItemGranted("stone1")) return;
        this._inventoryUi.addItem("stone1");
      }, 3000);
    };
    const _clearStoneRewardTimer = (): void => {
      if (_stoneRewardTimeoutId === null) return;
      window.clearTimeout(_stoneRewardTimeoutId);
      _stoneRewardTimeoutId = null;
    };

    const app = new ParticleApp({
      canvas,
      gl,
      overlay: dummyOverlay,
      onTraceComplete: _scheduleStoneReward,
    });
    // ParticleApp appends canvas to #app — move it into our section
    s.containerEl.appendChild(canvas);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    app.resize();
    app.setRenderActive(s.hot);

    s.projectRef = app;
    s.disposeProject = () => {
      _clearStoneRewardTimer();
      app.dispose();
    };
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

    const project = new PuzzleProject(host, {
      onGameComplete: () => {
        this._inventoryUi.addItem("stone2");
      },
    });
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
    container.style.touchAction = "pan-y";

    const wrapper = _el("div");
    wrapper.style.cssText = "position:absolute;inset:0;pointer-events:auto;touch-action:pan-y;";
    container.appendChild(wrapper);

    const uiRoot = _el("div");
    uiRoot.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:20;touch-action:pan-y;";
    wrapper.appendChild(uiRoot);

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;touch-action:pan-y;pointer-events:none;";
    wrapper.appendChild(canvas);

    // getScrollY: map host scrollTop → section-local scroll
    const sectionEl = s.el;
    const hostEl = this._host;
    const getScrollY = (): number => Math.max(0, hostEl.scrollTop - sectionEl.offsetTop);
    const setScrollY = async (scrollY: number, behavior: ScrollBehavior = "smooth"): Promise<void> => {
      const maxLocalScrollY = Math.max(0, sectionEl.clientHeight - hostEl.clientHeight);
      const clampedLocalScrollY = Math.max(0, Math.min(scrollY, maxLocalScrollY));
      const targetScrollTop = sectionEl.offsetTop + clampedLocalScrollY;

      await this._scrollHostTo(targetScrollTop, behavior);
      this._updateActiveSection(this._resolveSectionIdx("gnomes"));
    };
    const setScrollLocked = (locked: boolean): void => {
      hostEl.style.overflow = locked ? "hidden" : "";
    };

    const app = new GnomesApp({
      canvas,
      interactionEl: wrapper,
      uiRoot,
      getScrollY,
      setScrollY,
      setScrollLocked,
      scrollSyncMode: "instant",
      onDialogueVisibilityChange: (isOpen) => {
        this._inventoryUi.setDialogueShifted(isOpen);
      },
      onGameComplete: () => {
        this._inventoryUi.addItem("stone3");
      },
    });
    app.setRenderActive(s.hot);

    let disposed = false;
    s.readyPromise = app.start().catch((e) => {
      if (disposed) return;
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

    let app: CityApp | null = null;
    app = new CityApp({
      host: wrapper,
      canvas,
      uiRoot,
      showStartButton: false,
      onResetToOverview: (reason) => {
        app?.setScrollInputEnabled(false);
        if (reason !== "crash") return;
        this._exitCityInteraction({ resetProject: false, centerSection: true, behavior: "smooth" });
      },
      onGameComplete: () => {
        this._exitCityInteraction({ resetProject: true, centerSection: true, behavior: "smooth" });
        this._inventoryUi.addItem("stone4");
      },
    });
    app?.setScrollInputEnabled(false);
    s.readyPromise = app?.start().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[Showcase] city start failed:", e);
    }) ?? Promise.resolve();

    s.projectRef = app;
    s.disposeProject = () => app?.dispose();
    s.activateProject = () => {
      if (!app) return;
      this._callProjectMethod(app, ["resume", "wake"]);
      this._callProjectMethod(app, ["setRenderActive", "setAnimationActive"], ["setRenderActive", "setAnimationActive"], true);
      if (!s.interacting) app.setScrollInputEnabled(false);
    };
    s.deactivateProject = () => {
      if (!app) return;
      app.setScrollInputEnabled(false);
      this._callProjectMethod(app, ["pause", "sleep", "suspend"]);
      this._callProjectMethod(app, ["setRenderActive", "setAnimationActive"], ["setRenderActive", "setAnimationActive"], false);
    };
  }

  /* ── Osminog ── */

  private _mountOsminog(s: SectionState): void {
    const container = s.containerEl;
    container.innerHTML = "";

    const project = mountOsminogProject(container, {
      onRewardItem: (itemId) => {
        this._inventoryUi.addItem(itemId);
      },
      onDuduHit: () => {
        if (this._osminogAligning) return;
        this._osminogAligning = true;
        void this.alignProject("osminog", "smooth").finally(() => {
          this._osminogAligning = false;
        });
      },
    });
    const unsubscribeInventoryDrag = this._inventoryUi.subscribeDrag((event) => {
      if (event.phase !== "end") return;
      if (event.itemId !== "flute") return;
      if (!project.hitTestInventoryDrop(event.clientX, event.clientY)) return;

      const triggered = project.triggerDuduFromInventory();
      if (!triggered) return;
      this._inventoryUi.close();
    });

    // Убираем кнопку «В меню» из осьминога (в витрине она не нужна)
    const menuBtn = container.querySelector(".osminog__menu");
    menuBtn?.remove();

    project.setRenderActive(s.hot);

    s.projectRef = project;
    s.cleanupSection = unsubscribeInventoryDrag;
    s.disposeProject = () => {
      unsubscribeInventoryDrag();
      s.cleanupSection = null;
      project.dispose();
    };
    s.activateProject = () => {
      project.resume();
    };
    s.deactivateProject = () => {
      project.pause();
    };
  }

  // ── interaction gate ───────────────────────────────────────────────────────

  private async _startInteraction(idx: number): Promise<void> {
    const s = this._sections[idx];
    if (!s || s.interacting || this._pendingInteractionIdx >= 0) return;

    this._pendingInteractionIdx = idx;
    if (s.def.key === "city") {
      await this._centerCitySectionInShowcase("smooth");
    } else {
      await this._alignSectionToViewport(idx, "smooth");
    }
    if (this._pendingInteractionIdx !== idx) return;

    this._forceActivateSection(idx);
    s.interacting = true;
    this._interactingIdx = idx;
    this._pendingInteractionIdx = -1;

    // Block page scroll
    this._host.style.overflow = "hidden";

    // Hide gate UI
    if (s.blocker) s.blocker.style.display = "none";
    if (s.interactBtn) s.interactBtn.style.display = "none";

    // Show exit and hide inventory while the project is in full interaction mode.
    this._exitBtn.classList.remove("showcase__exit-btn--hidden");
    this._inventoryUi.setHidden(true);

    // Project-specific activation
    if (s.def.key === "city") {
      const cityApp = s.projectRef as CityApp | null;
      cityApp?.setScrollInputEnabled(false);
      cityApp?.startGame();
    }
  }

  private _stopInteraction(): void {
    this._pendingInteractionIdx = -1;
    const idx = this._interactingIdx;
    if (idx < 0) return;
    const s = this._sections[idx];
    if (!s) return;

    if (s.def.key === "city") {
      this._exitCityInteraction({ resetProject: true, centerSection: true, behavior: "smooth" });
      return;
    }

    this._restoreViewingMode(idx);
  }

  // ── per-frame / per-scroll updates ─────────────────────────────────────────

  private _onHostScroll = (): void => {
    this._updateScrollVelocity();
    this._updateCityProgress();
    this._updateOsminogVisibilityState();

    if (this._scrollVelocityPxS > FAST_SCROLL_VELOCITY_PX_S && this._activationQueue.size > 0) {
      this._scheduleScrollSettle();
    }
  };

  private _onResize = (): void => {
    this._scheduleResizeSync();
  };

  private _scheduleResizeSync(): void {
    if (this._disposed || !this._preloadDone) return;
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = 0;
      this._syncScrollAfterResize();
    });
  }

  private _syncScrollAfterResize(): void {
    const lockedIdx = this._interactingIdx >= 0 ? this._interactingIdx : this._pendingInteractionIdx;
    if (lockedIdx >= 0) {
      this._ensureSectionWarm(lockedIdx);
      this._host.scrollTop = this._getLockedInteractionScrollTop(lockedIdx);
      this._updateActiveSection(lockedIdx);
    }
    this._updateCityProgress();
    this._prevScrollTop = this._host.scrollTop;
    this._prevScrollTs = performance.now();
  }

  private _updateCityProgress(): void {
    const cityIdx = this._sections.findIndex((s) => s.def.key === "city");
    if (cityIdx < 0) return;
    const s = this._sections[cityIdx];
    if (!s.mounted || s.interacting) return;

    const app = s.projectRef as CityApp | null;
    if (!app) return;

    const sectionTop = s.el.offsetTop;
    const sectionHeight = s.el.clientHeight;
    const vh = this._host.clientHeight;
    const maxScroll = Math.max(1, sectionHeight - vh);
    const localScroll = Math.max(0, this._host.scrollTop - sectionTop);
    const rawProgress = Math.min(1, localScroll / maxScroll);
    const showcaseScrollSpeed = Math.max(0.01, CITY_CAMERA.overview.input?.showcaseScrollSpeed ?? 1);
    const progress = Math.min(1, rawProgress * showcaseScrollSpeed);

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
