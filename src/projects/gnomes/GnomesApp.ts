import { GNOMES_CONFIG } from "./config";
import { GnomeFactory, type GnomePalette } from "./GnomeFactory";
import { SceneComposer } from "./SceneComposer";
import { ScrollCameraRig } from "./ScrollCameraRig";
import type { GnomeInstance } from "./GnomeInstance";
import * as THREE from "three";
import { DialogueSystem } from "./dialogue/DialogueSystem";
import type { GnomeCharacterKey } from "./GnomeController";

export class GnomesApp {
  private _canvas: HTMLCanvasElement;
  private _statusEl: HTMLElement | null;
  private _dialogue: DialogueSystem;

  private _composer: SceneComposer;
  private _cameraRig: ScrollCameraRig;
  private _factory: GnomeFactory;
  private _gnomes: GnomeInstance[] = [];
  private _gnomeDefs: Array<{ id: string; key: GnomeCharacterKey; sitName: string }> = [
    { id: "shoragran", key: "hor", sitName: "hor sit" },
    { id: "fyfchik", key: "fi", sitName: "fi sit" },
    { id: "pipiser", key: "pi", sitName: "pi sit" },
  ];
  private _raycaster = new THREE.Raycaster();
  private _ndc = new THREE.Vector2();
  private _clickTargets: THREE.Object3D[] = [];
  private _pickOffsetY = 0.8;

  private _tapStart: { x: number; y: number; t: number } | null = null;

  private _raf = 0;
  private _lastTs = 0;

  private _onResize = () => this._handleResize();
  private _onScroll = () => this._handleScroll();
  private _onPointerDown = (e: PointerEvent) => this._handlePointerDown(e);
  private _onPointerUp = (e: PointerEvent) => this._handlePointerUp(e);

  constructor(opts: { canvas: HTMLCanvasElement; statusEl?: HTMLElement | null; uiRoot: HTMLElement }) {
    this._canvas = opts.canvas;
    this._statusEl = opts.statusEl ?? null;

    this._composer = new SceneComposer({ canvas: this._canvas });
    this._cameraRig = new ScrollCameraRig({ pages: GNOMES_CONFIG.pages });
    this._factory = new GnomeFactory();
    this._dialogue = new DialogueSystem({ uiRoot: opts.uiRoot, portraitUrl: "/fr.jpg" });
  }

  async start(): Promise<void> {
    this._setStatus("Загрузка гномов…");

    await this._factory.load();
    this._cameraRig.setFocusOffsetY(this._factory.focusOffsetY);
    this._pickOffsetY = this._factory.focusOffsetY;

    // Создаём 3 гнома: ветку передаём в фабрику как конкретный объект из glTF (template).
    this._gnomes = this._gnomeDefs.map((d) => {
      const sit = this._factory.getSitObjectByName(d.sitName);
      const palette = this._paletteFor(d.id);
      return this._factory.createInstance({ characterKey: d.key, sitObject: sit, palette });
    });
    for (let i = 0; i < this._gnomes.length; i++) {
      const g = this._gnomes[i];
      const id = this._gnomeDefs[i]?.id ?? `gnome-${i}`;
      g.root.userData.characterId = id;
      this._composer.scene.add(g.root);
    }

    this._rebuildClickTargets();

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
    this._canvas.addEventListener("pointerdown", this._onPointerDown);
    this._canvas.addEventListener("pointerup", this._onPointerUp, { passive: true });

    this._lastTs = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
    this._setStatus("Готово • Скролль вниз, чтобы перейти к следующему гному");
  }

  private _paletteFor(characterId: string): GnomePalette {
    const fromCfg = (GNOMES_CONFIG.gnomes.palette.byId as Record<string, { clothColor: number; hatColor?: number } | undefined>)[
      characterId
    ];
    const hatColor = fromCfg?.hatColor ?? GNOMES_CONFIG.gnomes.palette.defaultHatColor;
    const clothColor = fromCfg?.clothColor ?? 0xffffff;
    return { hatColor, clothColor };
  }

  dispose(): void {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("scroll", this._onScroll);
    this._canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._canvas.removeEventListener("pointerup", this._onPointerUp);
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

    const spacing = this._cameraRig.pageWorldHeight * GNOMES_CONFIG.gnomes.pageSpacingMultiplier;
    for (let i = 0; i < this._gnomes.length; i++) {
      const base = GNOMES_CONFIG.gnomes.basePosition;
      this._gnomes[i].controller.setPosition(base.x, base.y - i * spacing, base.z);
    }
  }

  private _rebuildClickTargets(): void {
    this._clickTargets = [];
    for (const g of this._gnomes) {
      // Приоритет: кликаем по невидимому pick collider'у, если он есть.
      const colliders: THREE.Object3D[] = [];
      g.root.traverse((o) => {
        if (o.name === "GnomePickCollider") colliders.push(o);
      });
      if (colliders.length > 0) {
        for (const c of colliders) this._clickTargets.push(c);
        continue;
      }

      // Фолбэк: все меши гнома.
      g.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        this._clickTargets.push(mesh);
      });
    }
  }

  private _handlePointerDown(e: PointerEvent): void {
    // На мобильных pointerdown часто начинается как скролл — считаем кликом только tap (pointerup без смещения).
    this._tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  private _handlePointerUp(e: PointerEvent): void {
    if (!this._tapStart) return;
    const dt = performance.now() - this._tapStart.t;
    const dx = e.clientX - this._tapStart.x;
    const dy = e.clientY - this._tapStart.y;
    this._tapStart = null;

    // Если это был свайп/скролл — игнор.
    const dist = Math.hypot(dx, dy);
    if (dist > 10) return;
    if (dt > 650) return;

    const id = this._pickCharacterIdAt(e.clientX, e.clientY);
    if (!id) return;

    // При входе в диалог — проигрываем hello один раз.
    const gnome = this._gnomes.find((g) => g.root.userData.characterId === id);
    gnome?.controller.playHelloOnce();

    this._dialogue.open(id);
  }

  private _pickCharacterIdAt(clientX: number, clientY: number): string | null {
    const rect = this._canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(1, rect.width);
    const y = (clientY - rect.top) / Math.max(1, rect.height);

    // 1) Точный raycast по мешам.
    this._ndc.set(x * 2 - 1, -(y * 2 - 1));
    this._raycaster.setFromCamera(this._ndc, this._cameraRig.camera);
    const hits = this._raycaster.intersectObjects(this._clickTargets, true);
    if (hits.length > 0) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.characterId) o = o.parent;
      const id = (o?.userData.characterId as string | undefined) ?? null;
      if (id) return id;
    }

    // 2) Фолбэк: \"прощающее\" попадание — ближайший гном по проекции на экран.
    // Это решает ситуацию, когда skinned mesh c тонкой геометрией или bounds даёт неприятное ощущение \"попасть трудно\".
    const thresholdPx = Math.max(90, Math.min(rect.width, rect.height) * 0.14);
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const g of this._gnomes) {
      const id = (g.root.userData.characterId as string | undefined) ?? null;
      if (!id) continue;

      const p = new THREE.Vector3();
      g.root.getWorldPosition(p);
      p.y += this._pickOffsetY;
      p.project(this._cameraRig.camera);

      // Если точка за камерой — пропускаем.
      if (p.z < -1 || p.z > 1) continue;

      const sx = rect.left + (p.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-p.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }

    if (bestId && bestDist <= thresholdPx) return bestId;
    return null;
  }

  private _setStatus(text: string): void {
    if (!this._statusEl) return;
    this._statusEl.textContent = text;
  }
}

