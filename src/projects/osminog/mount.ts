import * as THREE from "three";
import { enableShadowsAndSrgb, loadGltf } from "../city/three/loadGltf";
import { OSMINOG_DUDU_CONFIG } from "./config";
import { createDuduAudio, type DuduAudio, type DuduKeyName } from "./createDuduAudio";
import { LottieSegmentsController, type OsminogUiMode } from "./LottieSegmentsController";
import { MelodySequenceTracker, type MelodyTrackerState } from "./MelodySequenceTracker";

function _setActiveBtn(btn: HTMLButtonElement, active: boolean): void {
  if (active) btn.classList.add("btn--active");
  else btn.classList.remove("btn--active");
}

function _collectMeshTargets(root: THREE.Object3D | null | undefined): THREE.Mesh[] {
  if (!root) return [];

  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

function _makeHitAreaInvisible(root: THREE.Object3D, material: THREE.Material): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.material = material;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
}

function _resolveHitAreaName(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (/^key[1-8]$/.test(current.name)) return current.name;
    current = current.parent;
  }
  return null;
}

function _disposeThreeObject(root: THREE.Object3D): void {
  const disposedMaterials = new Set<THREE.Material>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry.dispose();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      material.dispose();
    }
  });
}

function _setupDuduLights(scene: THREE.Scene, root: THREE.Object3D): void {
  const ambient = new THREE.AmbientLight(0xffffff, OSMINOG_DUDU_CONFIG.lighting.ambientIntensity);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff2d8, OSMINOG_DUDU_CONFIG.lighting.keyIntensity);
  const lightAnchor = root.getObjectByName("Area");
  if (lightAnchor) key.position.copy(lightAnchor.getWorldPosition(new THREE.Vector3()));
  else
    key.position.set(
      OSMINOG_DUDU_CONFIG.lighting.fallbackKeyPosition.x,
      OSMINOG_DUDU_CONFIG.lighting.fallbackKeyPosition.y,
      OSMINOG_DUDU_CONFIG.lighting.fallbackKeyPosition.z
    );
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 10;
  key.shadow.bias = -0.0002;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x87c8ff, OSMINOG_DUDU_CONFIG.lighting.fillIntensity);
  fill.position.set(
    OSMINOG_DUDU_CONFIG.lighting.fillPosition.x,
    OSMINOG_DUDU_CONFIG.lighting.fillPosition.y,
    OSMINOG_DUDU_CONFIG.lighting.fillPosition.z
  );
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xa78bfa, OSMINOG_DUDU_CONFIG.lighting.rimIntensity);
  rim.position.set(
    OSMINOG_DUDU_CONFIG.lighting.rimPosition.x,
    OSMINOG_DUDU_CONFIG.lighting.rimPosition.y,
    OSMINOG_DUDU_CONFIG.lighting.rimPosition.z
  );
  scene.add(rim);
}

type _RenderViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function _getContainedViewport(
  containerWidth: number,
  containerHeight: number,
  aspect: number
): _RenderViewport {
  const safeAspect = Math.max(0.001, aspect);
  const containerAspect = containerWidth / containerHeight;

  if (containerAspect > safeAspect) {
    const width = Math.round(containerHeight * safeAspect);
    return {
      x: Math.round((containerWidth - width) * 0.5),
      y: 0,
      width,
      height: containerHeight
    };
  }

  const height = Math.round(containerWidth / safeAspect);
  return {
    x: 0,
    y: Math.round((containerHeight - height) * 0.5),
    width: containerWidth,
    height
  };
}

function _getCenteredViewportInRegion(
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
  aspect: number
): _RenderViewport {
  const viewport = _getContainedViewport(regionWidth, regionHeight, aspect);
  return {
    x: regionX + viewport.x,
    y: regionY + viewport.y,
    width: viewport.width,
    height: viewport.height
  };
}

function _applyViewportAdjustments(
  viewport: _RenderViewport,
  containerWidth: number,
  containerHeight: number
): _RenderViewport {
  const scale = Math.max(0.1, OSMINOG_DUDU_CONFIG.frame.scale);
  const scaledWidth = Math.max(1, Math.round(viewport.width * scale));
  const scaledHeight = Math.max(1, Math.round(viewport.height * scale));

  const centeredX = viewport.x + Math.round((viewport.width - scaledWidth) * 0.5);
  const centeredY = viewport.y + Math.round((viewport.height - scaledHeight) * 0.5);

  const adjustedX = centeredX + OSMINOG_DUDU_CONFIG.frame.offsetXPx;
  const adjustedY = centeredY + OSMINOG_DUDU_CONFIG.frame.offsetYPx;

  const clampedWidth = Math.min(scaledWidth, containerWidth);
  const clampedHeight = Math.min(scaledHeight, containerHeight);

  return {
    x: Math.min(Math.max(0, adjustedX), Math.max(0, containerWidth - clampedWidth)),
    y: Math.min(Math.max(0, adjustedY), Math.max(0, containerHeight - clampedHeight)),
    width: clampedWidth,
    height: clampedHeight
  };
}

type _CameraFrame = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};

function _captureCameraFrame(camera: THREE.PerspectiveCamera): _CameraFrame {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.normalize();

  const up = camera.up.clone().applyQuaternion(camera.quaternion).normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const orthogonalUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const target = camera.position
    .clone()
    .add(forward.clone().multiplyScalar(OSMINOG_DUDU_CONFIG.camera.focusDistance));

  return {
    position: camera.position.clone(),
    target,
    forward,
    right,
    up: orthogonalUp
  };
}

function _applyCameraConfig(camera: THREE.PerspectiveCamera): void {
  const frame = _captureCameraFrame(camera);
  const panOffset = frame.right
    .clone()
    .multiplyScalar(OSMINOG_DUDU_CONFIG.camera.pan.x)
    .add(frame.up.clone().multiplyScalar(OSMINOG_DUDU_CONFIG.camera.pan.y));

  const position = frame.position
    .clone()
    .add(panOffset)
    .add(frame.forward.clone().multiplyScalar(OSMINOG_DUDU_CONFIG.camera.dolly));

  const target = frame.target
    .clone()
    .add(panOffset)
    .add(frame.right.clone().multiplyScalar(OSMINOG_DUDU_CONFIG.camera.aim.x))
    .add(frame.up.clone().multiplyScalar(OSMINOG_DUDU_CONFIG.camera.aim.y));

  camera.position.copy(position);

  if (OSMINOG_DUDU_CONFIG.camera.fovOffsetDeg !== 0) {
    camera.fov += OSMINOG_DUDU_CONFIG.camera.fovOffsetDeg;
  }

  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function _createFallbackCamera(): THREE.PerspectiveCamera {
  const fallback = OSMINOG_DUDU_CONFIG.camera.fallback;
  const camera = new THREE.PerspectiveCamera(fallback.fovDeg, 1, fallback.near, fallback.far);
  camera.position.set(fallback.position.x, fallback.position.y, fallback.position.z);
  camera.lookAt(fallback.target.x, fallback.target.y, fallback.target.z);
  return camera;
}

export type MountedOsminogProject = {
  dispose(): void;
  pause(): void;
  resume(): void;
  setRenderActive(active: boolean): void;
  hitTestInventoryDrop(clientX: number, clientY: number): boolean;
  triggerDuduFromInventory(): boolean;
};

export interface MountOsminogProjectOptions {
  onRewardItem?: (itemId: "key") => void;
}

export function mountOsminogProject(host: HTMLElement, options?: MountOsminogProjectOptions): MountedOsminogProject {
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

  const threeLayer = document.createElement("div");
  threeLayer.className = "osminog__three-layer";
  threeLayer.style.top = `${OSMINOG_DUDU_CONFIG.layer.topPercent * 100}%`;
  threeLayer.style.height = `${OSMINOG_DUDU_CONFIG.layer.heightPercent * 100}%`;
  stage.appendChild(threeLayer);

  const threeCanvas = document.createElement("canvas");
  threeCanvas.className = "osminog__three";
  threeCanvas.setAttribute("aria-label", "3D дудка");
  threeLayer.appendChild(threeCanvas);

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

  const btnDudu = document.createElement("button");
  btnDudu.className = "btn osminog__dudu-toggle";
  btnDudu.type = "button";
  btnDudu.textContent = "Дудка";
  btnDudu.setAttribute("aria-label", "Показать 3D дудку");
  btnDudu.disabled = true;
  uiRoot.appendChild(btnDudu);

  const controls = document.createElement("div");
  controls.className = "osminog__controls";
  uiRoot.appendChild(controls);

  const melodyProgress = document.createElement("div");
  melodyProgress.className = "osminog__melody-progress";
  melodyProgress.setAttribute("aria-label", "Прогресс мелодии");
  uiRoot.appendChild(melodyProgress);

  const melodySuccess = document.createElement("div");
  melodySuccess.className = "osminog__melody-success";
  melodySuccess.textContent = "УСПЕХ";
  uiRoot.appendChild(melodySuccess);

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

  const btn4 = document.createElement("button");
  btn4.className = "btn osminog__seg-btn";
  btn4.type = "button";
  btn4.textContent = "4";
  btn4.setAttribute("aria-label", "Финальный кадр");
  controls.appendChild(btn4);

  btn1.disabled = true;
  btn2.disabled = true;
  btn3.disabled = true;
  btn4.disabled = true;

  const melodyDots = Array.from({ length: OSMINOG_DUDU_CONFIG.melody.sequences.length + 1 }, (_, index) => {
    const dot = document.createElement("span");
    dot.className = "osminog__melody-dot";
    dot.setAttribute("aria-label", `Шаг ${index + 1}`);
    melodyProgress.appendChild(dot);
    return dot;
  });

  let _disposed = false;
  let _renderActive = true;
  let _unsubscribe: (() => void) | null = null;
  let _unsubscribeSuccessSequence: (() => void) | null = null;
  let _controller: LottieSegmentsController | null = null;
  let _anim: import("lottie-web").AnimationItem | null = null;
  let _renderer: THREE.WebGLRenderer | null = null;
  let _scene: THREE.Scene | null = null;
  let _camera: THREE.PerspectiveCamera | null = null;
  let _threeRoot: THREE.Object3D | null = null;
  let _mixer: THREE.AnimationMixer | null = null;
  let _duduAction: THREE.AnimationAction | null = null;
  let _invisibleHitMaterial: THREE.MeshBasicMaterial | null = null;
  let _threeResizeObserver: ResizeObserver | null = null;
  let _threeFrame = 0;
  let _threeVisible = false;
  let _threeReady = false;
  let _lottieReady = false;
  let _interactionReady = false;
  let _animationPlaying = false;
  let _lastFrameTs = performance.now();
  let _duduTargets: THREE.Object3D[] = [];
  let _keyTargets: THREE.Object3D[] = [];
  let _cameraAspect = 16 / 9;
  let _renderViewport: _RenderViewport = { x: 0, y: 0, width: 1, height: 1 };
  let _duduAudio: DuduAudio | null = null;
  let _activePointerId: number | null = null;
  let _activeTouchId: number | null = null;
  let _activeKeyName: DuduKeyName | null = null;
  let _melodyTracker: MelodySequenceTracker<(typeof OSMINOG_DUDU_CONFIG.melody.sequences)[number][number]> | null = null;
  let _melodySuccessTimer = 0;
  let _inventoryRewardTimer = 0;
  let _keyRewardGranted = false;
  const _replacedHitMaterials: THREE.Material[] = [];

  const _raycaster = new THREE.Raycaster();
  const _pointer = new THREE.Vector2();
  try {
    _duduAudio = createDuduAudio();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[dudu-audio] Не удалось инициализировать звук", error);
    _duduAudio = null;
  }
  let _audioGestureSeq = 0;

  const _ensureDuduAudioStarted = async (): Promise<DuduAudio | null> => {
    const audio = _duduAudio;
    if (!audio || _disposed) return null;
    // Важно для iPhone Safari: Tone.start() должен происходить прямо в user gesture,
    // без предварительных async import/loaded цепочек.
    await audio.ensureStarted();
    return audio;
  };

  const _primeDuduAudio = (): void => {
    void _ensureDuduAudioStarted();
  };

  const _requestThreeFrame = (): void => {
    if (_threeFrame || _disposed || !_renderActive || !_threeReady) return;
    _lastFrameTs = performance.now();
    _threeFrame = requestAnimationFrame(_frameThree);
  };

  const _releaseThreeInteraction = (): void => {
    if (_activePointerId !== null && threeCanvas.hasPointerCapture(_activePointerId)) {
      try {
        threeCanvas.releasePointerCapture(_activePointerId);
      } catch {
        // ignore pointer capture issues on unsupported devices
      }
    }
    _releaseActiveKey();
    _audioGestureSeq += 1;
  };

  const _setPlaybackActive = (active: boolean): void => {
    if (_anim) {
      if (active) _anim.play();
      else _anim.pause();
    }

    if (!active) {
      _duduAudio?.stopAll();
      _releaseThreeInteraction();
      if (!_melodyTracker?.getState().isLocked) _melodyTracker?.reset();
      if (_melodySuccessTimer) {
        window.clearTimeout(_melodySuccessTimer);
        _melodySuccessTimer = 0;
      }
      melodyProgress.classList.remove("osminog__melody-progress--hidden");
      melodySuccess.classList.remove("osminog__melody-success--visible");
      if (_threeFrame) cancelAnimationFrame(_threeFrame);
      _threeFrame = 0;
      return;
    }

    _requestThreeFrame();
    if (_threeVisible) _renderThree();
  };

  const _renderThree = (): void => {
    if (!_renderer || !_scene || !_camera || !_threeVisible) return;

    const fullWidth = Math.max(1, threeLayer.clientWidth);
    const fullHeight = Math.max(1, threeLayer.clientHeight);

    _renderer.setViewport(0, 0, fullWidth, fullHeight);
    _renderer.setScissorTest(false);
    _renderer.clear();

    _renderer.setViewport(_renderViewport.x, _renderViewport.y, _renderViewport.width, _renderViewport.height);
    _renderer.setScissor(_renderViewport.x, _renderViewport.y, _renderViewport.width, _renderViewport.height);
    _renderer.setScissorTest(true);
    _renderer.render(_scene, _camera);
    _renderer.setScissorTest(false);
  };

  const _resizeThree = (): void => {
    if (!_renderer || !_camera) return;

    const width = Math.max(1, threeLayer.clientWidth);
    const height = Math.max(1, threeLayer.clientHeight);
    const regionTop = Math.round(height * OSMINOG_DUDU_CONFIG.frame.topPercent);
    const regionHeight = Math.max(1, Math.round(height * OSMINOG_DUDU_CONFIG.frame.heightPercent));

    const baseViewport = _getCenteredViewportInRegion(0, regionTop, width, regionHeight, _cameraAspect);
    _renderViewport = _applyViewportAdjustments(baseViewport, width, height);
    _camera.aspect = _cameraAspect;
    _camera.updateProjectionMatrix();
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    _renderer.setSize(width, height, false);
    _renderThree();
  };

  const _setDuduVisible = (visible: boolean): void => {
    _threeVisible = visible && _threeReady;
    threeCanvas.classList.toggle("osminog__three--visible", _threeVisible);
    _setActiveBtn(btnDudu, _threeVisible);

    if (!_threeVisible) {
      _duduAudio?.stopAll();
      _activePointerId = null;
      _activeKeyName = null;
      if (!_melodyTracker?.getState().isLocked) _melodyTracker?.reset();
    }

    if (_threeVisible) _renderThree();
  };

  const _triggerDuduToggle = (): boolean => {
    if (_disposed || btnDudu.disabled) return false;
    _setDuduVisible(!_threeVisible);
    return true;
  };

  const _hitTestInventoryDrop = (clientX: number, clientY: number): boolean => {
    const rect = stage.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    const insetX = rect.width * 0.08;
    const insetTop = rect.height * 0.06;
    const insetBottom = rect.height * 0.1;

    return (
      clientX >= rect.left + insetX &&
      clientX <= rect.right - insetX &&
      clientY >= rect.top + insetTop &&
      clientY <= rect.bottom - insetBottom
    );
  };

  const _updateMelodyProgressUi = (state: MelodyTrackerState): void => {
    if (_melodySuccessTimer) {
      window.clearTimeout(_melodySuccessTimer);
      _melodySuccessTimer = 0;
    }

    const litCount = state.isCompleted
      ? melodyDots.length
      : Math.min(melodyDots.length, state.completedSequenceCount + (state.currentNoteIndex > 0 ? 1 : 0));
    for (const [index, dot] of melodyDots.entries()) {
      const active = index < litCount;
      dot.classList.toggle("osminog__melody-dot--done", active);
    }

    melodyProgress.classList.toggle("osminog__melody-progress--complete", state.isCompleted);
    melodyProgress.classList.remove("osminog__melody-progress--hidden");
    melodySuccess.classList.remove("osminog__melody-success--visible");

    if (!state.isCompleted) return;

    _controller?.triggerSuccessSequence();

    _melodySuccessTimer = window.setTimeout(() => {
      melodyProgress.classList.add("osminog__melody-progress--hidden");
      melodySuccess.classList.add("osminog__melody-success--visible");
      _melodySuccessTimer = 0;
    }, 1000);
  };

  const _handleThreeAnimationFinished = (event: THREE.Event): void => {
    if (!_duduAction) return;
    if ((event as THREE.Event & { action?: THREE.AnimationAction }).action !== _duduAction) return;

    _animationPlaying = false;
    _interactionReady = true;
    _renderThree();
  };

  const _playDuduAnimation = (): void => {
    if (!_duduAction || _animationPlaying || _interactionReady) return;

    _animationPlaying = true;
    _duduAction.reset();
    _duduAction.enabled = true;
    _duduAction.clampWhenFinished = true;
    _duduAction.setLoop(THREE.LoopOnce, 1);
    _duduAction.play();
  };

  const _setRayFromClientPoint = (clientX: number, clientY: number): boolean => {
    if (!_camera) return false;
    const rect = threeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const layerWidth = Math.max(1, threeLayer.clientWidth);
    const layerHeight = Math.max(1, threeLayer.clientHeight);
    const viewportLeft = rect.left + (rect.width * _renderViewport.x) / layerWidth;
    const viewportTop = rect.top + (rect.height * _renderViewport.y) / layerHeight;
    const viewportWidth = (rect.width * _renderViewport.width) / layerWidth;
    const viewportHeight = (rect.height * _renderViewport.height) / layerHeight;

    if (
      clientX < viewportLeft ||
      clientX > viewportLeft + viewportWidth ||
      clientY < viewportTop ||
      clientY > viewportTop + viewportHeight
    ) {
      return false;
    }

    _pointer.x = ((clientX - viewportLeft) / Math.max(1, viewportWidth)) * 2 - 1;
    _pointer.y = -((clientY - viewportTop) / Math.max(1, viewportHeight)) * 2 + 1;
    _raycaster.setFromCamera(_pointer, _camera);
    return true;
  };

  const _setRayFromPointer = (event: PointerEvent): boolean => _setRayFromClientPoint(event.clientX, event.clientY);

  const _getKeyHitName = (event: PointerEvent): DuduKeyName | null => {
    if (!_setRayFromPointer(event)) return null;

    const hit = _raycaster.intersectObjects(_keyTargets, false)[0];
    if (!hit) return null;

    const hitName = _resolveHitAreaName(hit.object);
    if (!hitName) return null;
    return hitName as DuduKeyName;
  };

  const _isDuduHit = (event: PointerEvent): boolean => {
    if (!_setRayFromPointer(event)) return false;
    return Boolean(_raycaster.intersectObjects(_duduTargets, false)[0]);
  };

  const _getKeyHitNameFromClientPoint = (clientX: number, clientY: number): DuduKeyName | null => {
    if (!_setRayFromClientPoint(clientX, clientY)) return null;

    const hit = _raycaster.intersectObjects(_keyTargets, false)[0];
    if (!hit) return null;

    const hitName = _resolveHitAreaName(hit.object);
    if (!hitName) return null;
    return hitName as DuduKeyName;
  };

  const _isDuduHitFromClientPoint = (clientX: number, clientY: number): boolean => {
    if (!_setRayFromClientPoint(clientX, clientY)) return false;
    return Boolean(_raycaster.intersectObjects(_duduTargets, false)[0]);
  };

  const _releaseActiveKey = (): void => {
    if (_activeKeyName) _duduAudio?.stopKey(_activeKeyName);
    _activeKeyName = null;
    _activePointerId = null;
    _activeTouchId = null;
  };

  const _startOrSwitchKey = (keyName: DuduKeyName): void => {
    const note = OSMINOG_DUDU_CONFIG.audio.notesByKey[keyName];
    if (_activeKeyName === keyName) return;

    if (_activeKeyName) _duduAudio?.stopKey(_activeKeyName);
    _activeKeyName = keyName;
    const gestureSeq = ++_audioGestureSeq;

    _melodyTracker?.notePlayed(note);

    // eslint-disable-next-line no-console
    console.log(`[dudu] ${keyName} -> ${note}`);
    void (async () => {
      const audio = await _ensureDuduAudioStarted();
      if (!audio) return;
      if (_disposed) return;
      if (_activeKeyName !== keyName) return;
      if (gestureSeq !== _audioGestureSeq) return;
      await audio.playKey(keyName);
    })();
  };

  const _handleThreePointerDown = (event: PointerEvent): void => {
    if (!_renderActive) return;
    if (!_threeVisible || !_camera) return;

    if (_interactionReady) {
      const hitName = _getKeyHitName(event);
      if (!hitName) return;

      _activePointerId = event.pointerId;
      _startOrSwitchKey(hitName);
      try {
        threeCanvas.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture issues on unsupported devices
      }
      return;
    }

    if (_animationPlaying) return;

    void _ensureDuduAudioStarted();
    if (!_isDuduHit(event)) return;
    _playDuduAnimation();
  };

  const _handleThreePointerMove = (event: PointerEvent): void => {
    if (!_renderActive) return;
    if (!_threeVisible || !_interactionReady) return;
    if (_activePointerId !== event.pointerId) return;

    const hitName = _getKeyHitName(event);
    if (!hitName) {
      if (_activeKeyName) _duduAudio?.stopKey(_activeKeyName);
      _activeKeyName = null;
      return;
    }

    _startOrSwitchKey(hitName);
  };

  const _handleThreePointerEnd = (event: PointerEvent): void => {
    if (!_renderActive) return;
    if (_activePointerId !== event.pointerId) return;

    _releaseActiveKey();
    _audioGestureSeq += 1;
    if (threeCanvas.hasPointerCapture(event.pointerId)) {
      try {
        threeCanvas.releasePointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture issues on unsupported devices
      }
    }
  };

  const _handleThreeTouchStart = (): void => {
    if (!_renderActive) return;
    _primeDuduAudio();
  };

  const _findTrackedTouch = (event: TouchEvent): Touch | null => {
    const targetTouch =
      _activeTouchId === null
        ? event.changedTouches[0] ?? event.touches[0] ?? null
        : Array.from(event.touches).find((touch) => touch.identifier === _activeTouchId) ??
          Array.from(event.changedTouches).find((touch) => touch.identifier === _activeTouchId) ??
          null;

    return targetTouch;
  };

  const _handleThreeTouchStartInteractive = (event: TouchEvent): void => {
    if (!_renderActive) return;
    if (!_threeVisible) return;
    if (event.changedTouches.length === 0) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    if (event.cancelable) event.preventDefault();
    _primeDuduAudio();

    if (_interactionReady) {
      const hitName = _getKeyHitNameFromClientPoint(touch.clientX, touch.clientY);
      if (!hitName) return;

      _activeTouchId = touch.identifier;
      _startOrSwitchKey(hitName);
      return;
    }

    if (_animationPlaying) return;
    if (!_isDuduHitFromClientPoint(touch.clientX, touch.clientY)) return;
    _playDuduAnimation();
  };

  const _handleThreeTouchMove = (event: TouchEvent): void => {
    if (!_renderActive) return;
    if (!_threeVisible || !_interactionReady) return;
    if (_activeTouchId === null) return;

    const touch = _findTrackedTouch(event);
    if (!touch) return;

    if (event.cancelable) event.preventDefault();

    const hitName = _getKeyHitNameFromClientPoint(touch.clientX, touch.clientY);
    if (!hitName) {
      if (_activeKeyName) _duduAudio?.stopKey(_activeKeyName);
      _activeKeyName = null;
      return;
    }

    _startOrSwitchKey(hitName);
  };

  const _handleThreeTouchEnd = (event: TouchEvent): void => {
    if (!_renderActive) return;
    if (_activeTouchId === null) return;

    const touch = _findTrackedTouch(event);
    if (!touch) return;

    if (event.cancelable) event.preventDefault();
    _releaseActiveKey();
    _audioGestureSeq += 1;
  };

  const _handleThreeContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  const _frameThree = (ts: number): void => {
    if (_disposed || !_renderActive) {
      _threeFrame = 0;
      return;
    }

    const deltaSeconds = Math.min(0.05, Math.max(0.001, (ts - _lastFrameTs) * 0.001));
    _lastFrameTs = ts;

    if (_threeVisible) {
      _mixer?.update(deltaSeconds);
      _renderThree();
    }

    _threeFrame = requestAnimationFrame(_frameThree);
  };

  const _updateLoadingState = (): void => {
    if (_lottieReady && _threeReady) loading.remove();
  };

  _melodyTracker = new MelodySequenceTracker({
    pauseResetMs: OSMINOG_DUDU_CONFIG.melody.pauseResetMs,
    sequences: OSMINOG_DUDU_CONFIG.melody.sequences,
    onStateChange: _updateMelodyProgressUi
  });

  void (async () => {
    try {
      const [mod, gltf] = await Promise.all([
        import("lottie-web"),
        loadGltf(OSMINOG_DUDU_CONFIG.assetUrl)
      ]);
      if (_disposed) return;

      _anim = mod.default.loadAnimation({
        container: animContainer,
        renderer: "svg",
        loop: false,
        autoplay: false,
        path: "/osminog/osminog%20.json"
      });

      _controller = new LottieSegmentsController(_anim);
      const updateUi = (mode: OsminogUiMode) => {
        _setActiveBtn(btn1, mode === 1);
        _setActiveBtn(btn2, mode === 2);
        _setActiveBtn(btn3, mode === 3);
        _setActiveBtn(btn4, mode === 4);
      };
      _unsubscribe = _controller.onUiModeChange(updateUi);
      _unsubscribeSuccessSequence = _controller.onSuccessSequenceComplete(() => {
        if (_keyRewardGranted) return;
        _keyRewardGranted = true;
        _inventoryRewardTimer = window.setTimeout(() => {
          if (_disposed) return;
          options?.onRewardItem?.("key");
          _inventoryRewardTimer = 0;
        }, 1500);
      });

      btn1.disabled = false;
      btn2.disabled = false;
      btn3.disabled = false;
      btn4.disabled = false;
      _lottieReady = true;

      _renderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });
      _renderer.outputColorSpace = THREE.SRGBColorSpace;
      _renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _renderer.toneMappingExposure = 1.05;
      _renderer.setClearColor(0x000000, 0);
      _renderer.shadowMap.enabled = true;
      _renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      _scene = new THREE.Scene();
      _threeRoot = gltf.scene;
      enableShadowsAndSrgb(_threeRoot);
      _scene.add(_threeRoot);
      _setupDuduLights(_scene, _threeRoot);

      const embeddedCamera = _threeRoot.getObjectByName("main Camera");
      if (OSMINOG_DUDU_CONFIG.camera.useEmbeddedCamera && embeddedCamera instanceof THREE.PerspectiveCamera) {
        _camera = embeddedCamera;
        _cameraAspect =
          OSMINOG_DUDU_CONFIG.camera.preserveEmbeddedAspect && embeddedCamera.aspect > 0
            ? embeddedCamera.aspect
            : 16 / 9;
      } else {
        _camera = _createFallbackCamera();
        _cameraAspect = 16 / 9;
        _scene.add(_camera);
      }
      _applyCameraConfig(_camera);

      const duduRoot = _threeRoot.getObjectByName("Cylinder");
      _duduTargets = _collectMeshTargets(duduRoot);

      const keyRoots = Array.from({ length: 8 }, (_, index) => _threeRoot?.getObjectByName(`key${index + 1}`)).filter(
        (item): item is THREE.Object3D => item !== undefined && item !== null
      );
      _keyTargets = keyRoots.flatMap((rootObject) => _collectMeshTargets(rootObject));

      _invisibleHitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      _invisibleHitMaterial.colorWrite = false;
      _invisibleHitMaterial.depthTest = false;

      for (const keyRoot of keyRoots) {
        keyRoot.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;

          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          _replacedHitMaterials.push(...materials);
        });
        _makeHitAreaInvisible(keyRoot, _invisibleHitMaterial);
      }

      const clip = gltf.animations.find((item) => item.name === "dudu") ?? gltf.animations[0] ?? null;
      if (clip) {
        _mixer = new THREE.AnimationMixer(_threeRoot);
        _mixer.addEventListener("finished", _handleThreeAnimationFinished);
        _duduAction = _mixer.clipAction(clip);
        _duduAction.clampWhenFinished = true;
        _duduAction.enabled = true;
        _duduAction.setLoop(THREE.LoopOnce, 1);
      }

      _threeResizeObserver = new ResizeObserver(_resizeThree);
      _threeResizeObserver.observe(threeLayer);
      _resizeThree();

      root.addEventListener("pointerdown", _primeDuduAudio, { capture: true });
      root.addEventListener("touchstart", _primeDuduAudio, { passive: true, capture: true });
      root.addEventListener("touchend", _primeDuduAudio, { passive: true, capture: true });
      threeCanvas.addEventListener("pointerdown", _handleThreePointerDown);
      threeCanvas.addEventListener("pointermove", _handleThreePointerMove);
      threeCanvas.addEventListener("touchstart", _handleThreeTouchStart, { passive: true });
      threeCanvas.addEventListener("touchstart", _handleThreeTouchStartInteractive, { passive: false });
      threeCanvas.addEventListener("touchmove", _handleThreeTouchMove, { passive: false });
      threeCanvas.addEventListener("touchend", _handleThreeTouchEnd, { passive: false });
      threeCanvas.addEventListener("touchcancel", _handleThreeTouchEnd, { passive: false });
      threeCanvas.addEventListener("contextmenu", _handleThreeContextMenu);
      window.addEventListener("pointerup", _handleThreePointerEnd);
      window.addEventListener("pointercancel", _handleThreePointerEnd);
      _threeReady = true;
      btnDudu.disabled = false;
      _setPlaybackActive(_renderActive);
      _updateLoadingState();
    } catch (e) {
      loading.textContent = `Ошибка загрузки: ${e instanceof Error ? e.message : String(e)}`;
    }
  })();

  btn1.addEventListener("click", () => _controller?.request(1));
  btn2.addEventListener("click", () => _controller?.request(2));
  btn3.addEventListener("click", () => _controller?.request(3));
  btn4.addEventListener("click", () => _controller?.request(4));
  btnDudu.addEventListener("click", () => {
    _triggerDuduToggle();
  });

  const _mounted: MountedOsminogProject = {
    dispose(): void {
    _disposed = true;
    _unsubscribe?.();
    _unsubscribeSuccessSequence?.();
    _controller?.dispose();
    _anim?.destroy();
    cancelAnimationFrame(_threeFrame);
    root.removeEventListener("pointerdown", _primeDuduAudio, { capture: true } as EventListenerOptions);
    root.removeEventListener("touchstart", _primeDuduAudio, { capture: true } as EventListenerOptions);
    root.removeEventListener("touchend", _primeDuduAudio, { capture: true } as EventListenerOptions);
    threeCanvas.removeEventListener("pointerdown", _handleThreePointerDown);
    threeCanvas.removeEventListener("pointermove", _handleThreePointerMove);
    threeCanvas.removeEventListener("touchstart", _handleThreeTouchStart);
    threeCanvas.removeEventListener("touchstart", _handleThreeTouchStartInteractive);
    threeCanvas.removeEventListener("touchmove", _handleThreeTouchMove);
    threeCanvas.removeEventListener("touchend", _handleThreeTouchEnd);
    threeCanvas.removeEventListener("touchcancel", _handleThreeTouchEnd);
    threeCanvas.removeEventListener("contextmenu", _handleThreeContextMenu);
    window.removeEventListener("pointerup", _handleThreePointerEnd);
    window.removeEventListener("pointercancel", _handleThreePointerEnd);
    _threeResizeObserver?.disconnect();
    if (_mixer) _mixer.removeEventListener("finished", _handleThreeAnimationFinished);
    _duduAudio?.dispose();
    _melodyTracker?.dispose();
    if (_melodySuccessTimer) window.clearTimeout(_melodySuccessTimer);
    if (_inventoryRewardTimer) window.clearTimeout(_inventoryRewardTimer);
    _renderer?.dispose();
    _invisibleHitMaterial?.dispose();
    for (const material of _replacedHitMaterials) material.dispose();
    if (_threeRoot) _disposeThreeObject(_threeRoot);
    root.remove();
    host.classList.remove("launcher--puzzle");
    },
    pause(): void {
      _mounted.setRenderActive(false);
    },
    resume(): void {
      _mounted.setRenderActive(true);
    },
    setRenderActive(active: boolean): void {
      if (_disposed) return;
      if (_renderActive === active) return;
      _renderActive = active;
      _setPlaybackActive(active);
    },
    hitTestInventoryDrop(clientX: number, clientY: number): boolean {
      return _hitTestInventoryDrop(clientX, clientY);
    },
    triggerDuduFromInventory(): boolean {
      return _triggerDuduToggle();
    }
  };

  return _mounted;
}

