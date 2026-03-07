import * as THREE from "three";
import { enableShadowsAndSrgb, loadGltf } from "../city/three/loadGltf";
import { SUNDUC_CONFIG } from "./config";

type _PlaybackButton = {
  clipName: string;
  button: HTMLButtonElement;
};

type _ClipRange = {
  start: number;
  end: number;
};

type _ClipBinding = {
  endValue: number[];
  property: "position" | "quaternion" | "scale";
  startValue: number[];
  target: THREE.Object3D;
};

export interface SunducProjectOptions {
  host: HTMLElement;
  embedded?: boolean;
  onMenu?: () => void;
}

export class SunducProject {
  private readonly _host: HTMLElement;
  private readonly _embedded: boolean;
  private readonly _onMenu: () => void;

  private readonly _root: HTMLDivElement;
  private readonly _canvasWrap: HTMLDivElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _status: HTMLDivElement;
  private readonly _debugSummary: HTMLDivElement;
  private readonly _stoneButtonsWrap: HTMLDivElement;
  private readonly _sequenceButtonsWrap: HTMLDivElement;

  private readonly _renderer: THREE.WebGLRenderer;
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _clock = new THREE.Clock();
  private readonly _resizeObserver: ResizeObserver;
  private readonly _rayGroup = new THREE.Group();
  private readonly _modelGroup = new THREE.Group();
  private readonly _mixerRoot = new THREE.Group();

  private _mixer: THREE.AnimationMixer | null = null;
  private _modelRoot: THREE.Object3D | null = null;
  private _actionsByName = new Map<string, THREE.AnimationAction>();
  private _clipBindings = new Map<string, _ClipBinding[]>();
  private _clipPinnedAtEnd = new Map<string, boolean>();
  private _clipRanges = new Map<string, _ClipRange>();
  private _clipStates = new Map<string, boolean>();
  private _clipVisibilityTargets = new Map<string, THREE.Object3D[]>();
  private _clipNamesByAction = new WeakMap<THREE.AnimationAction, string>();
  private _playbackButtons: _PlaybackButton[] = [];
  private _stoneClipNames: string[] = [];
  private _sequenceClipNames: string[] = [];
  private _frameHandle = 0;
  private _disposed = false;

  private _dragPointerId: number | null = null;
  private _lastPointer = new THREE.Vector2();
  private _yaw = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.y);
  private _pitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.x);
  private _targetYaw = this._yaw;
  private _targetPitch = this._pitch;

  constructor(options: SunducProjectOptions) {
    this._host = options.host;
    this._embedded = options.embedded ?? false;
    this._onMenu = options.onMenu ?? (() => window.location.reload());

    this._host.innerHTML = "";
    this._host.style.display = "block";
    this._host.style.padding = "0";
    this._host.classList.add("launcher--puzzle");

    this._root = this._buildDom();
    this._canvasWrap = this._root.querySelector(".sunduc__canvas-wrap") as HTMLDivElement;
    this._canvas = this._root.querySelector(".sunduc__canvas") as HTMLCanvasElement;
    this._status = this._root.querySelector(".sunduc__status") as HTMLDivElement;
    this._debugSummary = this._root.querySelector(".sunduc__debug-summary") as HTMLDivElement;
    this._stoneButtonsWrap = this._root.querySelector(".sunduc__debug-stones") as HTMLDivElement;
    this._sequenceButtonsWrap = this._root.querySelector(".sunduc__debug-sequence") as HTMLDivElement;
    this._host.appendChild(this._root);
    this._applyCssVars();

    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(
      SUNDUC_CONFIG.camera.fovDeg,
      1,
      SUNDUC_CONFIG.camera.near,
      SUNDUC_CONFIG.camera.far
    );
    this._camera.position.set(
      SUNDUC_CONFIG.camera.position.x,
      SUNDUC_CONFIG.camera.position.y,
      SUNDUC_CONFIG.camera.position.z
    );
    this._camera.lookAt(
      SUNDUC_CONFIG.camera.lookAt.x,
      SUNDUC_CONFIG.camera.lookAt.y,
      SUNDUC_CONFIG.camera.lookAt.z
    );

    this._modelGroup.position.set(
      SUNDUC_CONFIG.model.offset.x,
      SUNDUC_CONFIG.model.offset.y,
      SUNDUC_CONFIG.model.offset.z
    );
    this._mixerRoot.add(this._modelGroup);
    this._rayGroup.add(this._mixerRoot);
    this._scene.add(this._rayGroup);

    this._setupLights();
    this._bindPointerControls();

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this._canvasWrap);
    this._resize();

    this._setButtonsEnabled(false);
    this._setStatus("Загрузка модели и анимаций…");

    this._frameHandle = requestAnimationFrame(this._frame);
    void this._load();
  }

  dispose(): void {
    this._disposed = true;
    cancelAnimationFrame(this._frameHandle);
    this._resizeObserver.disconnect();
    this._canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._canvas.removeEventListener("pointermove", this._onPointerMove);
    this._canvas.removeEventListener("pointerup", this._onPointerUp);
    this._canvas.removeEventListener("pointercancel", this._onPointerUp);
    this._canvas.removeEventListener("pointerleave", this._onPointerUp);
    this._renderer.dispose();
    this._actionsByName.clear();
    this._clipBindings.clear();
    this._clipPinnedAtEnd.clear();
    this._clipRanges.clear();
    this._clipStates.clear();
    this._clipVisibilityTargets.clear();
    this._playbackButtons = [];
    this._root.remove();
    this._host.classList.remove("launcher--puzzle");
  }

  private _buildDom(): HTMLDivElement {
    const root = document.createElement("div");
    root.className = `sunduc${this._embedded ? " sunduc--embedded" : ""}`;

    const infoRows = SUNDUC_CONFIG.paragraphs.map((paragraph) => `<p class="sunduc__paragraph">${paragraph}</p>`).join("");
    const badges = SUNDUC_CONFIG.badges.map((badge) => `<span class="sunduc__badge">${badge}</span>`).join("");

    root.innerHTML = `
      <div class="sunduc__info">
        <div class="sunduc__info-card">
          <div class="sunduc__eyebrow">${SUNDUC_CONFIG.eyebrow}</div>
          <h1 class="sunduc__title">${SUNDUC_CONFIG.title}</h1>
          <p class="sunduc__lead">${SUNDUC_CONFIG.lead}</p>
          <div class="sunduc__paragraphs">${infoRows}</div>
          <div class="sunduc__badges">${badges}</div>
        </div>
        ${
          this._embedded
            ? ""
            : `<button class="btn sunduc__menu" type="button" aria-label="Вернуться в меню">В меню</button>`
        }
      </div>
      <div class="sunduc__viewer">
        <div class="sunduc__canvas-wrap">
          <canvas class="sunduc__canvas"></canvas>
          <div class="sunduc__status">Загрузка…</div>
          <div class="sunduc__gesture">Крути модель пальцем или мышкой</div>
        </div>
      </div>
      <aside class="sunduc__debug${SUNDUC_CONFIG.debug.showPanel ? "" : " sunduc__debug--hidden"}">
        <div class="sunduc__debug-title">Debug Animations</div>
        <div class="sunduc__debug-summary">Считываю клипы…</div>
        <div class="sunduc__debug-group">
          <div class="sunduc__debug-label">Камни</div>
          <div class="sunduc__debug-grid sunduc__debug-stones"></div>
        </div>
        <div class="sunduc__debug-group">
          <div class="sunduc__debug-label">Сценарий</div>
          <div class="sunduc__debug-grid sunduc__debug-sequence"></div>
        </div>
      </aside>
    `;

    const menuBtn = root.querySelector(".sunduc__menu") as HTMLButtonElement | null;
    menuBtn?.addEventListener("click", () => this._onMenu());

    return root;
  }

  private _applyCssVars(): void {
    this._root.style.setProperty("--sunduc-info-min-height", `${SUNDUC_CONFIG.layout.infoMinHeightVh}svh`);
    this._root.style.setProperty("--sunduc-viewer-min-height", `${SUNDUC_CONFIG.layout.viewerMinHeightVh}svh`);
    this._root.style.setProperty("--sunduc-info-max-width", `${SUNDUC_CONFIG.layout.infoMaxWidthPx}px`);
    this._root.style.setProperty("--sunduc-debug-width", `${SUNDUC_CONFIG.layout.debugPanelWidthPx}px`);
    this._root.style.setProperty("--sunduc-canvas-min-height", `${SUNDUC_CONFIG.layout.canvasMinHeightPx}px`);
  }

  private _setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, SUNDUC_CONFIG.lighting.ambientIntensity);
    this._scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff2d8, SUNDUC_CONFIG.lighting.keyIntensity);
    key.position.set(4.5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.0003;
    this._scene.add(key);

    const fill = new THREE.DirectionalLight(0x8bc6ff, SUNDUC_CONFIG.lighting.fillIntensity);
    fill.position.set(-6, 4, 5);
    this._scene.add(fill);

    const rim = new THREE.DirectionalLight(0xa78bfa, SUNDUC_CONFIG.lighting.rimIntensity);
    rim.position.set(-2, 5, -7);
    this._scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.3, 64),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.16 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    floor.receiveShadow = true;
    this._scene.add(floor);
  }

  private _bindPointerControls(): void {
    this._canvas.addEventListener("pointerdown", this._onPointerDown);
    this._canvas.addEventListener("pointermove", this._onPointerMove);
    this._canvas.addEventListener("pointerup", this._onPointerUp);
    this._canvas.addEventListener("pointercancel", this._onPointerUp);
    this._canvas.addEventListener("pointerleave", this._onPointerUp);
  }

  private async _load(): Promise<void> {
    try {
      const gltf = await loadGltf(SUNDUC_CONFIG.assetUrl);
      if (this._disposed) return;

      const model = gltf.scene;
      this._modelRoot = model;
      enableShadowsAndSrgb(model);
      this._fitModel(model);
      this._modelGroup.add(model);

      this._mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        this._clipRanges.set(clip.name, this._getClipRange(clip));
        this._clipBindings.set(clip.name, this._buildClipBindings(clip, model));
        this._clipVisibilityTargets.set(clip.name, this._collectClipTargets(clip, model));
        const action = this._mixer.clipAction(clip);
        action.clampWhenFinished = true;
        action.loop = THREE.LoopOnce;
        action.enabled = true;
        action.paused = true;
        this._actionsByName.set(clip.name, action);
        this._clipNamesByAction.set(action, clip.name);
      }
      this._mixer.addEventListener("finished", this._onMixerFinished);

      this._buildAnimationUi([...this._actionsByName.keys()]);
      this._setButtonsEnabled(true);
      this._setStatus("Модель готова. Включай тумблеры, чтобы ставить анимации в нужное состояние.");
    } catch (error) {
      if (this._disposed) return;
      this._setStatus(`Ошибка загрузки: ${error instanceof Error ? error.message : String(error)}`);
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  private _fitModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fitScale = SUNDUC_CONFIG.camera.fitHeight / Math.max(size.y, 0.001);

    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;
    model.scale.setScalar(fitScale * SUNDUC_CONFIG.model.scale);

    this._resize();
  }

  private _buildAnimationUi(clipNames: string[]): void {
    this._stoneButtonsWrap.innerHTML = "";
    this._sequenceButtonsWrap.innerHTML = "";
    this._playbackButtons = [];

    const stoneClips = clipNames
      .filter((name) => this._matchesStoneClip(name))
      .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));

    const closeClip = this._findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.close);
    const duduClip = this._findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.dudu);
    const keyClip = this._findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.key);
    const openClip = this._findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.open);

    this._stoneClipNames = stoneClips;
    this._sequenceClipNames = [closeClip, duduClip, keyClip, openClip].filter((name): name is string => Boolean(name));

    for (const clipName of stoneClips) {
      this._stoneButtonsWrap.appendChild(this._createToggleButton(clipName, clipName));
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn sunduc__debug-btn";
    resetBtn.type = "button";
    resetBtn.textContent = "Reset all";
    resetBtn.addEventListener("click", () => this._resetAnimations());
    this._sequenceButtonsWrap.appendChild(resetBtn);

    for (const clipName of this._sequenceClipNames) {
      this._sequenceButtonsWrap.appendChild(this._createToggleButton(clipName, clipName));
    }

    const normalizedStones = this._stoneClipNames.length > 0 ? this._stoneClipNames.join(", ") : "не найдены";
    const normalizedSequence = this._sequenceClipNames.length > 0 ? this._sequenceClipNames.join(" → ") : "не собран";
    this._debugSummary.textContent =
      `Камни: ${normalizedStones}. Остальные клипы: ${normalizedSequence}. ` +
      "Каждый тумблер включает клип с первого keyframe и выключает его возвратом в начало.";

    for (const clipName of [...this._stoneClipNames, ...this._sequenceClipNames]) {
      this._setClipToggleState(clipName, false, { syncUi: true });
    }

    for (const clipName of [...this._stoneClipNames, ...this._sequenceClipNames]) {
      this._syncClipVisibility(clipName);
    }
  }

  private _createToggleButton(label: string, clipName: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "btn sunduc__debug-btn";
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      this._toggleClip(clipName);
    });
    this._playbackButtons.push({ clipName, button });
    return button;
  }

  private _toggleClip(clipName: string): void {
    const nextState = !this._clipStates.get(clipName);
    this._setClipToggleState(clipName, nextState, { syncUi: true });
  }

  private _setClipToggleState(
    clipName: string,
    active: boolean,
    options?: {
      syncUi?: boolean;
    }
  ): void {
    const action = this._actionsByName.get(clipName);
    if (!action || !this._mixer) return;
    const range = this._clipRanges.get(clipName);
    if (!range) return;

    this._clipStates.set(clipName, active);
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;

    if (active) {
      this._clipPinnedAtEnd.set(clipName, false);
      this._syncClipVisibility(clipName, true);
      action.stop();
      action.reset();
      action.time = range.start;
      action.paused = false;
      action.play();
      this._applyClipPose(clipName, "start");
      this._setStatus(`Воспроизводится: ${clipName}`);
    } else {
      this._clipPinnedAtEnd.set(clipName, false);
      action.stop();
      action.enabled = false;
      action.paused = true;
      action.time = range.start;
      this._applyClipPose(clipName, "start");
      this._syncClipVisibility(clipName, false);
      this._applyPinnedClipPoses();
      this._setStatus(`Сброшено в начало: ${clipName}`);
    }

    if (options?.syncUi !== false) this._setButtonActive(clipName, active);
  }

  private _resetAnimations(): void {
    if (!this._mixer) return;

    for (const clipName of [...this._stoneClipNames, ...this._sequenceClipNames]) {
      this._setClipToggleState(clipName, false, { syncUi: true });
    }

    this._setStatus("Все тогглы возвращены в начальное состояние.");
  }

  private _setButtonsEnabled(enabled: boolean): void {
    const buttons = this._root.querySelectorAll(".sunduc__debug button");
    buttons.forEach((button) => {
      (button as HTMLButtonElement).disabled = !enabled;
    });
  }

  private _setStatus(text: string): void {
    this._status.textContent = text;
  }

  private _setButtonActive(clipName: string, active: boolean): void {
    for (const item of this._playbackButtons) {
      if (item.clipName !== clipName) continue;
      item.button.classList.toggle("btn--active", active);
      item.button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  private _matchesStoneClip(clipName: string): boolean {
    const normalized = _normalizeName(clipName);
    return SUNDUC_CONFIG.animationAliases.stoneSearch.some((alias) => normalized.includes(_normalizeName(alias)));
  }

  private _findClipByAliases(clipNames: string[], aliases: readonly string[]): string | null {
    const normalizedAliases = aliases.map(_normalizeName);

    for (const clipName of clipNames) {
      const normalizedClip = _normalizeName(clipName);
      if (normalizedAliases.includes(normalizedClip)) return clipName;
    }

    return null;
  }

  private _resize(): void {
    const width = Math.max(1, this._canvasWrap.clientWidth);
    const height = Math.max(1, this._canvasWrap.clientHeight);
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(width, height, false);
  }

  private _frame = (): void => {
    if (this._disposed) return;

    const delta = Math.min(this._clock.getDelta(), 0.05);

    this._yaw = THREE.MathUtils.lerp(this._yaw, this._targetYaw, 1 - Math.pow(1 - SUNDUC_CONFIG.model.damping, delta * 60));
    this._pitch = THREE.MathUtils.lerp(this._pitch, this._targetPitch, 1 - Math.pow(1 - SUNDUC_CONFIG.model.damping, delta * 60));

    this._mixerRoot.rotation.y = this._yaw;
    this._mixerRoot.rotation.x = this._pitch;
    this._mixer?.update(delta);
    this._applyPinnedClipPoses();
    this._renderer.render(this._scene, this._camera);

    this._frameHandle = requestAnimationFrame(this._frame);
  };

  private _onMixerFinished = (event: THREE.Event): void => {
    const mixerEvent = event as THREE.Event & { action?: THREE.AnimationAction };
    const action = mixerEvent.action;
    if (!action) return;

    const clipName = this._clipNamesByAction.get(action);
    if (!clipName) return;

    const range = this._clipRanges.get(clipName);
    if (!range) return;

    if (!this._clipStates.get(clipName)) return;

    action.stop();
    action.enabled = false;
    this._clipPinnedAtEnd.set(clipName, true);
    this._syncClipVisibility(clipName, true);
    this._applyClipPose(clipName, "end");
    action.time = range.end;
    action.time = range.end;
    this._setButtonActive(clipName, true);
    this._setStatus(`Зафиксировано на последнем keyframe: ${clipName}`);
  };

  private _getClipRange(clip: THREE.AnimationClip): _ClipRange {
    let start = Number.POSITIVE_INFINITY;
    let end = 0;

    for (const track of clip.tracks) {
      if (track.times.length === 0) continue;
      start = Math.min(start, track.times[0]);
      end = Math.max(end, track.times[track.times.length - 1]);
    }

    if (!Number.isFinite(start)) start = 0;
    if (end < start) end = clip.duration;

    return { start, end };
  }

  private _buildClipBindings(clip: THREE.AnimationClip, root: THREE.Object3D): _ClipBinding[] {
    const bindings: _ClipBinding[] = [];

    for (const track of clip.tracks) {
      const splitIdx = track.name.lastIndexOf(".");
      if (splitIdx <= 0) continue;

      const nodeName = track.name.slice(0, splitIdx);
      const property = track.name.slice(splitIdx + 1);
      if (property !== "position" && property !== "quaternion" && property !== "scale") continue;

      const target = root.getObjectByName(nodeName);
      if (!target) continue;

      const valueSize = track.getValueSize();
      const startValue = Array.from(track.values.slice(0, valueSize), (value) => Number(value));
      const endValue = Array.from(track.values.slice(track.values.length - valueSize), (value) => Number(value));

      bindings.push({
        target,
        property,
        startValue,
        endValue,
      });
    }

    return bindings;
  }

  private _collectClipTargets(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.Object3D[] {
    const targets = new Map<string, THREE.Object3D>();

    for (const track of clip.tracks) {
      const splitIdx = track.name.lastIndexOf(".");
      if (splitIdx <= 0) continue;

      const nodeName = track.name.slice(0, splitIdx);
      const target = root.getObjectByName(nodeName);
      if (!target) continue;
      targets.set(target.uuid, target);
    }

    return [...targets.values()];
  }

  private _applyPinnedClipPoses(): void {
    for (const [clipName, pinned] of this._clipPinnedAtEnd) {
      if (!pinned || !this._clipStates.get(clipName)) continue;
      this._applyClipPose(clipName, "end");
    }
  }

  private _applyClipPose(clipName: string, pose: "start" | "end"): void {
    const bindings = this._clipBindings.get(clipName);
    if (!bindings) return;

    for (const binding of bindings) {
      const value = pose === "end" ? binding.endValue : binding.startValue;

      switch (binding.property) {
        case "position":
          binding.target.position.fromArray(value);
          binding.target.updateMatrix();
          break;
        case "scale":
          binding.target.scale.fromArray(value);
          binding.target.updateMatrix();
          break;
        case "quaternion":
          binding.target.quaternion.fromArray(value).normalize();
          binding.target.updateMatrix();
          break;
      }
    }

    this._modelRoot?.updateMatrixWorld(true);
  }

  private _syncClipVisibility(clipName: string, forcedState?: boolean): void {
    if (!this._shouldToggleVisibility(clipName)) return;

    const visible = forcedState ?? Boolean(this._clipStates.get(clipName));
    const targets = this._clipVisibilityTargets.get(clipName);
    if (!targets) return;

    for (const target of targets) {
      target.visible = visible;
    }
  }

  private _shouldToggleVisibility(clipName: string): boolean {
    return this._matchesStoneClip(clipName) || this._matchesKeyClip(clipName);
  }

  private _matchesKeyClip(clipName: string): boolean {
    const keyClip = this._findClipByAliases([clipName], SUNDUC_CONFIG.animationAliases.key);
    return keyClip !== null;
  }

  private _onPointerDown = (event: PointerEvent): void => {
    this._dragPointerId = event.pointerId;
    this._lastPointer.set(event.clientX, event.clientY);
    this._canvas.setPointerCapture(event.pointerId);
  };

  private _onPointerMove = (event: PointerEvent): void => {
    if (this._dragPointerId !== event.pointerId) return;

    const dx = event.clientX - this._lastPointer.x;
    const dy = event.clientY - this._lastPointer.y;
    this._lastPointer.set(event.clientX, event.clientY);

    this._targetYaw += dx * SUNDUC_CONFIG.model.dragSensitivity.x;
    this._targetPitch += dy * SUNDUC_CONFIG.model.dragSensitivity.y;

    const minPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.minPitchDeg);
    const maxPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.maxPitchDeg);
    this._targetPitch = THREE.MathUtils.clamp(this._targetPitch, minPitch, maxPitch);
  };

  private _onPointerUp = (event: PointerEvent): void => {
    if (this._dragPointerId !== event.pointerId) return;
    if (this._canvas.hasPointerCapture(event.pointerId)) {
      this._canvas.releasePointerCapture(event.pointerId);
    }
    this._dragPointerId = null;
  };
}

function _normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
