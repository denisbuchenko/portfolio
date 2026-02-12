import { GNOMES_CONFIG } from "./config";
import { GnomeFactory } from "./GnomeFactory";
import { SceneComposer } from "./SceneComposer";
import { ScrollCameraRig } from "./ScrollCameraRig";
import type { GnomeInstance } from "./GnomeInstance";

export class GnomesApp {
  private _canvas: HTMLCanvasElement;
  private _statusEl: HTMLElement | null;

  private _composer: SceneComposer;
  private _cameraRig: ScrollCameraRig;
  private _factory: GnomeFactory;
  private _gnomes: GnomeInstance[] = [];

  private _raf = 0;
  private _lastTs = 0;

  private _onResize = () => this._handleResize();
  private _onScroll = () => this._handleScroll();

  constructor(opts: { canvas: HTMLCanvasElement; statusEl?: HTMLElement | null }) {
    this._canvas = opts.canvas;
    this._statusEl = opts.statusEl ?? null;

    this._composer = new SceneComposer({ canvas: this._canvas });
    this._cameraRig = new ScrollCameraRig({ pages: GNOMES_CONFIG.pages });
    this._factory = new GnomeFactory();
  }

  async start(): Promise<void> {
    this._setStatus("Загрузка гномов…");

    await this._factory.load();
    this._cameraRig.setFocusOffsetY(this._factory.focusOffsetY);

    // Создаём 3 гнома с чередующимися анимациями: 1-2-1.
    const animIndices = [0, 1, 0];
    this._gnomes = animIndices.map((animationIndex) => this._factory.createInstance({ animationIndex }));
    for (const g of this._gnomes) this._composer.scene.add(g.root);

    // Небольшой наклон, чтобы ощущался объём/перспектива.
    for (const g of this._gnomes) {
      // Повернуть на 90° против часовой стрелки (вокруг оси Y) относительно текущего направления.
      g.controller.setRotationEuler(0, Math.PI * 1.5, 0);
    }

    this._handleResize();
    this._layoutPages();
    this._handleScroll();

    window.addEventListener("resize", this._onResize);
    window.addEventListener("scroll", this._onScroll, { passive: true });

    this._lastTs = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
    this._setStatus("Готово • Скролль вниз, чтобы перейти к следующему гному");
  }

  dispose(): void {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("scroll", this._onScroll);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;

    this._composer.dispose();
  }

  private _frame(ts: number): void {
    this._raf = requestAnimationFrame((t) => this._frame(t));
    const deltaSec = Math.min(0.05, Math.max(0.001, (ts - this._lastTs) * 0.001));
    this._lastTs = ts;

    // Подтягиваем scrollY на каждом кадре — если браузер не триггерит scroll event (иногда на iOS).
    this._cameraRig.setScrollY(window.scrollY);
    this._cameraRig.update(deltaSec);

    for (const g of this._gnomes) g.controller.update(deltaSec);

    this._composer.renderer.render(this._composer.scene, this._cameraRig.camera);
  }

  private _handleResize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    this._composer.resize(w, h, dpr);
    this._cameraRig.resize(w, h);
    this._layoutPages();
  }

  private _handleScroll(): void {
    this._cameraRig.setScrollY(window.scrollY);
  }

  private _layoutPages(): void {
    if (this._gnomes.length === 0) return;

    const spacing = this._cameraRig.pageWorldHeight;
    for (let i = 0; i < this._gnomes.length; i++) {
      this._gnomes[i].controller.setPosition(0, -i * spacing, 0);
    }
  }

  private _setStatus(text: string): void {
    if (!this._statusEl) return;
    this._statusEl.textContent = text;
  }
}

