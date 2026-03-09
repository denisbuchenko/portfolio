import * as THREE from "three";
import { enableShadowsAndSrgb, loadGltf } from "../city/three/loadGltf";
import { LottieSegmentsController, type OsminogUiMode } from "./LottieSegmentsController";

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
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff2d8, 1.75);
  const lightAnchor = root.getObjectByName("Area");
  if (lightAnchor) key.position.copy(lightAnchor.getWorldPosition(new THREE.Vector3()));
  else key.position.set(0.9, 1.1, 1.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 10;
  key.shadow.bias = -0.0002;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x87c8ff, 1.05);
  fill.position.set(-1.2, 1.1, 1.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xa78bfa, 0.8);
  rim.position.set(0.2, 1.4, -1.6);
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

  const threeLayer = document.createElement("div");
  threeLayer.className = "osminog__three-layer";
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
  const _replacedHitMaterials: THREE.Material[] = [];

  const _raycaster = new THREE.Raycaster();
  const _pointer = new THREE.Vector2();

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
    const regionTop = Math.round(height * 0.04);
    const regionHeight = Math.max(1, Math.round(height * 0.92));

    _renderViewport = _getCenteredViewportInRegion(0, regionTop, width, regionHeight, _cameraAspect);
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

    if (_threeVisible) _renderThree();
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

  const _handleThreePointerDown = (event: PointerEvent): void => {
    if (!_threeVisible || !_camera) return;

    const rect = threeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const layerWidth = Math.max(1, threeLayer.clientWidth);
    const layerHeight = Math.max(1, threeLayer.clientHeight);
    const viewportLeft = rect.left + (rect.width * _renderViewport.x) / layerWidth;
    const viewportTop = rect.top + (rect.height * _renderViewport.y) / layerHeight;
    const viewportWidth = (rect.width * _renderViewport.width) / layerWidth;
    const viewportHeight = (rect.height * _renderViewport.height) / layerHeight;

    if (
      event.clientX < viewportLeft ||
      event.clientX > viewportLeft + viewportWidth ||
      event.clientY < viewportTop ||
      event.clientY > viewportTop + viewportHeight
    ) {
      return;
    }

    _pointer.x = ((event.clientX - viewportLeft) / Math.max(1, viewportWidth)) * 2 - 1;
    _pointer.y = -((event.clientY - viewportTop) / Math.max(1, viewportHeight)) * 2 + 1;
    _raycaster.setFromCamera(_pointer, _camera);

    if (_interactionReady) {
      const hit = _raycaster.intersectObjects(_keyTargets, false)[0];
      if (!hit) return;

      const hitName = _resolveHitAreaName(hit.object);
      if (!hitName) return;

      // eslint-disable-next-line no-console
      console.log(`[dudu] Нажали на ${hitName}`);
      return;
    }

    if (_animationPlaying) return;

    const hit = _raycaster.intersectObjects(_duduTargets, false)[0];
    if (!hit) return;

    _playDuduAnimation();
  };

  const _frameThree = (ts: number): void => {
    if (_disposed) return;

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

  void (async () => {
    try {
      const [mod, gltf] = await Promise.all([
        import("lottie-web"),
        loadGltf("/sunduc/dudu.glb")
      ]);
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
      if (embeddedCamera instanceof THREE.PerspectiveCamera) {
        _camera = embeddedCamera;
        _cameraAspect = embeddedCamera.aspect > 0 ? embeddedCamera.aspect : 16 / 9;
      } else {
        _camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
        _cameraAspect = 16 / 9;
        _camera.position.set(-0.12, 0.68, 2.02);
        _camera.lookAt(0, 0.55, 0.8);
        _scene.add(_camera);
      }

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

      threeCanvas.addEventListener("pointerdown", _handleThreePointerDown);
      _threeReady = true;
      btnDudu.disabled = false;
      _threeFrame = requestAnimationFrame(_frameThree);
      _updateLoadingState();
    } catch (e) {
      loading.textContent = `Ошибка загрузки: ${e instanceof Error ? e.message : String(e)}`;
    }
  })();

  btn1.addEventListener("click", () => _controller?.request(1));
  btn2.addEventListener("click", () => _controller?.request(2));
  btn3.addEventListener("click", () => _controller?.request(3));
  btnDudu.addEventListener("click", () => _setDuduVisible(!_threeVisible));

  return () => {
    _disposed = true;
    _unsubscribe?.();
    _controller?.dispose();
    _anim?.destroy();
    cancelAnimationFrame(_threeFrame);
    threeCanvas.removeEventListener("pointerdown", _handleThreePointerDown);
    _threeResizeObserver?.disconnect();
    if (_mixer) _mixer.removeEventListener("finished", _handleThreeAnimationFinished);
    _renderer?.dispose();
    _invisibleHitMaterial?.dispose();
    for (const material of _replacedHitMaterials) material.dispose();
    if (_threeRoot) _disposeThreeObject(_threeRoot);
    root.remove();
    host.classList.remove("launcher--puzzle");
  };
}

