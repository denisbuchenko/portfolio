import * as THREE from "three";
import { CITY_ANIMATION, CITY_ASSETS, CITY_CAMERA, CITY_GAMEPLAY, CITY_TUNING, CITY_WORLD } from "./cityConfig";
import { CHEL_DEFAULT_MANIFEST } from "./contracts";
import { loadGltf, enableShadowsAndSrgb } from "./three/loadGltf";
import { buildMeshBvh, disposeMeshBvh, installMeshBvhRaycast } from "./three/meshBvh";
import { ScrollInput } from "./input/ScrollInput";
import { TurnInput } from "./input/TurnInput";
import { StartButton } from "./ui/StartButton";
import { CrashOverlay } from "./ui/CrashOverlay";
import { BuildingsIndex } from "./world/BuildingsIndex";

type _Mode = "overview" | "focusStart" | "playing" | "crashed";

export class CityApp {
  private _host: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _uiRoot: HTMLDivElement;

  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;

  private _overviewCamera: THREE.OrthographicCamera;
  private _overviewPerspectiveCamera: THREE.PerspectiveCamera;
  private _gameCamera: THREE.PerspectiveCamera;
  private _gameOrthoCamera: THREE.OrthographicCamera;
  private _activeCamera: THREE.Camera;

  private _mode: _Mode = "overview";

  private _scroll = new ScrollInput();
  private _turn = new TurnInput();
  private _unsubScroll: (() => void) | null = null;
  private _unsubTurn: (() => void) | null = null;

  private _startBtn: StartButton;
  private _crashOverlay: CrashOverlay;

  private _raf = 0;
  private _lastT = performance.now();

  // Assets
  private _cityRoot: THREE.Group | null = null;
  private _cityScene: THREE.Group | null = null;
  private _bikerRoot: THREE.Group | null = null;
  private _bikerMixer: THREE.AnimationMixer | null = null;
  private _pedalActions: THREE.AnimationAction[] = [];

  private _buildings = new BuildingsIndex();
  private _activeBuildingMeshes: THREE.Mesh[] = [];
  private _activeBuildings = new Set<THREE.Object3D>();
  private _raycaster = new THREE.Raycaster();
  private _prevTip = new THREE.Vector3();
  private _tip = new THREE.Vector3();
  private _tipLocal = new THREE.Vector3(
    CITY_GAMEPLAY.bikerMotion.collisionTipLocalOffset?.x ?? 0,
    CITY_GAMEPLAY.bikerMotion.collisionTipLocalOffset?.y ?? 0,
    CITY_GAMEPLAY.bikerMotion.collisionTipLocalOffset?.z ?? 0
  );

  private _turnLeftActions: THREE.AnimationAction[] = [];
  private _turnRightActions: THREE.AnimationAction[] = [];
  private _turnPending: -1 | 1 | null = null;
  private _turnActive: -1 | 1 = -1; // какой набор клипов сейчас “активен” по весу (по дефолту right)
  private _turnPhase: "completed" | "forward" | "hold" | "reverse" = "completed";
  private _resetTimer: number | null = null;

  // World data
  private _mapBox = new THREE.Box3();
  private _mapCenter = new THREE.Vector3();
  private _startWorldPos = new THREE.Vector3();
  private _spawnClearanceRadius = 6.5;

  // Gameplay state
  private _gameT = 0;
  private _cruiseSpeed = CITY_GAMEPLAY.bikerMotion.speed.cruiseSpeed;
  private _forward = new THREE.Vector3(0, 0, -1);
  private _gameplayBaseQuat = new THREE.Quaternion();
  private _tmpQ = new THREE.Quaternion();
  private _tmpQ2 = new THREE.Quaternion();
  private _tmpV3a = new THREE.Vector3();
  private _tmpV3b = new THREE.Vector3();

  // Occlusion (дом загораживает персонажа)
  private _allBuildingMeshes: THREE.Mesh[] = [];
  private _meshToBuilding = new Map<string, { root: THREE.Object3D; meshes: THREE.Mesh[] }>();
  private _occlusionStates = new Map<
    THREE.Object3D,
    {
      meshes: THREE.Mesh[];
      from: number;
      current: number;
      target: number;
      t01: number;
    }
  >();

  constructor(opts: { host: HTMLElement; canvas: HTMLCanvasElement; uiRoot: HTMLDivElement }) {
    this._host = opts.host;
    this._canvas = opts.canvas;
    this._uiRoot = opts.uiRoot;

    installMeshBvhRaycast();

    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x070a10);

    this._overviewCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
    // Камера смотрит строго вниз, поэтому фиксируем up, чтобы не было "рандомного" поворота экрана.
    this._overviewCamera.up.set(0, 0, -1);
    this._overviewCamera.position.set(0, 220, 0);
    this._overviewCamera.lookAt(0, 0, 0);

    this._overviewPerspectiveCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this._overviewPerspectiveCamera.up.set(0, 0, -1);
    this._overviewPerspectiveCamera.position.set(0, 220, 0);
    this._overviewPerspectiveCamera.lookAt(0, 0, 0);

    this._gameCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this._gameCamera.position.set(0, 12, 18);
    this._gameCamera.lookAt(0, 0, 0);

    this._gameOrthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
    this._gameOrthoCamera.position.set(0, 12, 18);
    this._gameOrthoCamera.lookAt(0, 0, 0);

    this._activeCamera = this._overviewCamera;

    this._setupLights();

    this._startBtn = new StartButton(this._uiRoot);
    this._startBtn.onClick(() => this._beginFocusToStart());
    this._crashOverlay = new CrashOverlay(this._uiRoot);

    this._unsubScroll = this._scroll.bind(this._host);
    this._unsubTurn = this._turn.bind(this._host);

    // Режимы input (обзор: scroll, игра: поворот).
    this._scroll.setEnabled(true);
    this._turn.setEnabled(false);

    // BVH ускоритель использует это свойство (three-mesh-bvh).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this._raycaster as any).firstHitOnly = true;
  }

  async start(): Promise<void> {
    try {
      await this._load();
    } catch (e) {
      // Показываем оверлей (как минимум будет понятно, что случилось).
      // eslint-disable-next-line no-console
      console.error(e);
      this._crashOverlay.show();
      return;
    }
    this._onResize();
    window.addEventListener("resize", this._onResize);
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  dispose(): void {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this._unsubScroll?.();
    this._unsubTurn?.();

    this._startBtn.dispose();
    this._crashOverlay.dispose();
    if (this._resetTimer !== null) window.clearTimeout(this._resetTimer);

    this._bikerMixer = null;
    this._bikerRoot?.removeFromParent();
    this._cityRoot?.removeFromParent();
    this._cityScene = null;

    this._renderer.dispose();
  }

  private _setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xbfd2ff, 0x101018, 0.55);
    this._scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(180, 260, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 900;
    key.shadow.camera.left = -320;
    key.shadow.camera.right = 320;
    key.shadow.camera.top = 320;
    key.shadow.camera.bottom = -320;
    key.shadow.bias = -0.00015;
    this._scene.add(key);
  }

  private _load = async (): Promise<void> => {
    const city = await loadGltf(CITY_ASSETS.cityGltfUrl);
    this._cityScene = city.scene;
    enableShadowsAndSrgb(this._cityScene);

    // Пивот, чтобы поворачивать город вокруг его центра.
    const pivot = new THREE.Group();
    pivot.name = "CityPivot";
    pivot.add(this._cityScene);
    this._cityRoot = pivot;
    this._scene.add(this._cityRoot);

    // Центр и поворот карты на 90° по часовой стрелке (вид сверху) => -90° вокруг Y.
    this._cityScene.updateMatrixWorld(true);
    const preBox = new THREE.Box3().setFromObject(this._cityScene);
    const preCenter = new THREE.Vector3();
    preBox.getCenter(preCenter);

    // Центрируем сцену относительно pivot и вращаем pivot.
    this._cityScene.position.sub(preCenter);
    this._cityRoot.position.copy(preCenter);
    this._cityRoot.rotation.y = (CITY_WORLD.mapRotationYDeg * Math.PI) / 180;

    // Границы карты после поворота.
    this._cityRoot.updateMatrixWorld(true);
    this._mapBox.setFromObject(this._cityRoot);
    this._mapBox.getCenter(this._mapCenter);

    // “Пол главнее”: убираем z-fighting/конфликты при пересечениях со сплющенными домами.
    this._applyFloorPriority(this._cityRoot);

    // Индекс домов (для видимости/коллизий).
    this._buildings.buildFromCityScene(this._cityRoot);
    this._indexBuildingMeshes();
    // Начинаем со скрытых домов — появятся при попадании в окно видимости.
    for (const b of this._buildings.buildings) {
      b.targetVisible = false;
      b.appear01 = 0;
      b.root.visible = false;
      b.root.scale.set(b.baseScale.x, 0, b.baseScale.z);
    }

    // Start/spawn: центр карты, но не внутри дома.
    this._startWorldPos.copy(this._pickSpawnPosition(this._mapCenter));
    this._startWorldPos.y = 0;

    const biker = await loadGltf(CITY_ASSETS.bikerGltfUrl);
    this._bikerRoot = biker.scene;
    enableShadowsAndSrgb(this._bikerRoot);
    this._bikerRoot.visible = false; // до старта игры

    // Масштаб/ориентация — подберём позже, сейчас просто “чтобы было видно”.
    this._bikerRoot.scale.setScalar(1.0);
    this._bikerRoot.position.copy(this._startWorldPos);
    this._bikerRoot.position.y = 0;
    this._scene.add(this._bikerRoot);

    this._bikerMixer = new THREE.AnimationMixer(this._bikerRoot);

    // Стартуем педали “в фоне” — потом поднимем скорость.
    // В `Chel.gltf` педалирование размазано по нескольким клипам: pedal/pedalL/pedalR + ноги legR/lelL.
    const pedalNames = [
      CHEL_DEFAULT_MANIFEST.clips.pedal,
      CHEL_DEFAULT_MANIFEST.clips.pedalL,
      CHEL_DEFAULT_MANIFEST.clips.pedalR,
      CHEL_DEFAULT_MANIFEST.clips.legR,
      CHEL_DEFAULT_MANIFEST.clips.lelL
    ].filter(Boolean) as string[];

    this._pedalActions = [];
    for (const name of pedalNames) {
      const clip = biker.animations.find((c) => c.name === name);
      if (!clip) continue;
      const a = this._bikerMixer.clipAction(clip);
      a.enabled = true;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      a.setEffectiveWeight(1);
      a.setEffectiveTimeScale(0.0001);
      this._pedalActions.push(a);
    }

    // Повороты: подготовим actions.
    // IMPORTANT: в нашем вводе `turn=1` означает “влево”, `turn=-1` означает “вправо”.
    this._turnLeftActions = this._createTurnActions(biker.animations, 1);
    this._turnRightActions = this._createTurnActions(biker.animations, -1);
    this._initTurnActions();

    // Начальная точка tip (чтобы первый raycast не был мусором).
    this._bikerRoot.updateMatrixWorld(true);
    this._prevTip.copy(this._bikerRoot.localToWorld(this._tipLocal.clone()));
  };

  private _indexBuildingMeshes(): void {
    this._allBuildingMeshes = [];
    this._meshToBuilding.clear();
    for (const b of this._buildings.buildings) {
      for (const m of b.meshes) {
        this._allBuildingMeshes.push(m);
        this._meshToBuilding.set(m.uuid, { root: b.root, meshes: b.meshes });
      }
    }
  }

  private _applyFloorPriority(root: THREE.Object3D): void {
    const floorMeshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // В сцене есть нода "Дорога" (road). Её и считаем “полом”.
      if (o.name && (o.name.includes("Дорога") || o.name.toLowerCase().includes("road"))) {
        floorMeshes.push(m);
      }
    });

    for (const mesh of floorMeshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const anyMat = mat as unknown as { polygonOffset?: boolean; polygonOffsetFactor?: number; polygonOffsetUnits?: number };
        anyMat.polygonOffset = true;
        // Сдвигаем пол чуть ближе к камере по depth, чтобы он выигрывал при совпадении плоскостей.
        anyMat.polygonOffsetFactor = -1;
        anyMat.polygonOffsetUnits = -1;
      }
    }
  }

  private _onResize = (): void => {
    const w = this._host.clientWidth || window.innerWidth;
    const h = this._host.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._renderer.setPixelRatio(dpr);
    this._renderer.setSize(w, h, false);
    const aspect = w / Math.max(1, h);

    this._gameCamera.aspect = aspect;
    this._gameCamera.updateProjectionMatrix();

    // Игровая ортхо-камера: size задаётся конфигом, подстраиваем по aspect.
    const halfH = (CITY_CAMERA.gameplay.orthoViewSize * 0.5);
    const halfW = halfH * aspect;
    this._gameOrthoCamera.left = -halfW;
    this._gameOrthoCamera.right = halfW;
    this._gameOrthoCamera.top = halfH;
    this._gameOrthoCamera.bottom = -halfH;
    this._gameOrthoCamera.updateProjectionMatrix();

    // Overview перспективная камера.
    this._overviewPerspectiveCamera.aspect = aspect;
    this._overviewPerspectiveCamera.updateProjectionMatrix();
  };

  private _frame = (t: number): void => {
    this._raf = requestAnimationFrame(this._frame);

    const dtSec = Math.min(0.05, Math.max(0.0001, (t - this._lastT) * 0.001));
    this._lastT = t;

    this._turn.update(dtSec);

    if (this._mode === "overview") {
      this._updateOverview(dtSec);
    } else if (this._mode === "focusStart") {
      this._updateFocus(dtSec);
    } else if (this._mode === "playing") {
      this._updatePlaying(dtSec);
    } else if (this._mode === "crashed") {
      // wait (reset/reload будет добавлен позже)
    }

    this._bikerMixer?.update(dtSec);
    this._renderer.render(this._scene, this._activeCamera);
  };

  private _updateOverview(_dtSec: number): void {
    if (!this._cityRoot) return;
    const w = this._host.clientWidth || window.innerWidth;
    const h = this._host.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);

    const usePerspective = CITY_CAMERA.overview.usePerspective ?? false;
    const cam = usePerspective ? this._overviewPerspectiveCamera : this._overviewCamera;

    // Пролёт по Z.
    const minZ = this._mapBox.min.z;
    const maxZ = this._mapBox.max.z;
    const trackMin = minZ - (maxZ - minZ) * (CITY_CAMERA.overview.track?.prePadding01 ?? 0);
    const trackMax = maxZ + (maxZ - minZ) * (CITY_CAMERA.overview.track?.postPadding01 ?? 0);
    const z = THREE.MathUtils.lerp(trackMin, trackMax, this._scroll.getProgress01());

    cam.position.set(this._mapCenter.x, 220, z);
    cam.lookAt(this._mapCenter.x, 0, z);

    if (usePerspective) {
      // Для перспективы: подстраиваем FOV под ширину карты (грубо).
      const size = new THREE.Vector3();
      this._mapBox.getSize(size);
      const dist = cam.position.y;
      const targetWidth = size.x * 0.55;
      const fov = 2 * Math.atan(targetWidth / (2 * dist)) * (180 / Math.PI);
      this._overviewPerspectiveCamera.fov = fov;
      this._overviewPerspectiveCamera.updateProjectionMatrix();
    } else {
      // Ортхо: подгонка под ширину карты.
      const size = new THREE.Vector3();
      this._mapBox.getSize(size);
      const halfW = (size.x * 0.55);
      this._overviewCamera.left = -halfW;
      this._overviewCamera.right = halfW;
      this._overviewCamera.top = halfW / aspect;
      this._overviewCamera.bottom = -halfW / aspect;
      this._overviewCamera.updateProjectionMatrix();
    }

    this._applyCameraExtraTransform(cam, "overview");
    this._activeCamera = cam;

    // Режим города: игнорируем левую/правую границы и следим только за верхом/низом.
    // Хотим “пару пикселей” отступа от края -> переводим px -> NDC.
    const edgePx = 3;
    const edgeInsetNdc = (2 * edgePx) / Math.max(1, h);
    this._buildings.setVisibilityByVerticalBounds(cam, edgeInsetNdc);
    this._buildings.updateAppear(_dtSec, 0.35);

    // Start кнопка — в центре карты.
    const p = this._projectToScreen(this._startWorldPos, w, h, cam);
    if (p) {
      this._startBtn.setVisible(true);
      this._startBtn.setScreenPosition(p);
    } else {
      this._startBtn.setVisible(false);
    }
  }

  private _focusT = 0;
  private _focusFrom = new THREE.Vector3();
  private _focusTo = new THREE.Vector3();

  private _beginFocusToStart(): void {
    if (!this._cityRoot) return;
    this._mode = "focusStart";
    this._scroll.setEnabled(false);
    this._turn.setEnabled(false);
    this._startBtn.setVisible(false);
    this._focusT = 0;
    const overviewCam = (CITY_CAMERA.overview.usePerspective ?? false) ? this._overviewPerspectiveCamera : this._overviewCamera;
    this._focusFrom.copy(overviewCam.position);
    this._focusTo.copy(this._computeGameplayCameraPos(this._startWorldPos));
  }

  private _updateFocus(dtSec: number): void {
    this._focusT += dtSec;
    const t01 = Math.min(1, this._focusT / Math.max(0.001, CITY_CAMERA.focusStart.travelSec));
    const k = t01 * t01 * (3 - 2 * t01); // smoothstep
    const pos = new THREE.Vector3().lerpVectors(this._focusFrom, this._focusTo, k);
    const cam = this._getGameplayCamera();
    cam.position.copy(pos);
    this._applyGameplayCameraFixedRotation(cam);
    this._activeCamera = cam;

    if (t01 >= 1) {
      this._beginPlaying();
    }
  }

  private _beginPlaying(): void {
    this._mode = "playing";
    this._scroll.setEnabled(false);
    this._turn.setEnabled(true);
    this._gameT = 0;
    this._bikerRoot!.visible = true;
    this._crashOverlay.hide();
  }

  private _updatePlaying(dtSec: number): void {
    if (!this._bikerRoot) return;
    this._gameT += dtSec;

    // Скорость: 2 сек стоим, затем 3 сек разгон до cruiseSpeed.
    const idle = CITY_GAMEPLAY.bikerMotion.speed.idleSec;
    const ramp = CITY_GAMEPLAY.bikerMotion.speed.rampSec;
    const speed01 = this._gameT <= idle ? 0 : Math.min(1, (this._gameT - idle) / Math.max(0.001, ramp));
    const speed = this._cruiseSpeed * speed01;

    // Поворот (радиус плавно уменьшается при удержании).
    const input = this._turn.snapshot();
    this._updateTurnAnimation(input.turn);
    const sign = input.turn;
    const r0 = CITY_GAMEPLAY.bikerMotion.turn.radiusStart;
    const rMin = CITY_GAMEPLAY.bikerMotion.turn.radiusMin;
    const ease = CITY_GAMEPLAY.bikerMotion.turn.radiusEaseSec;
    const e01 = ease <= 0 ? 1 : Math.min(1, input.holdSec / ease);
    const radius = THREE.MathUtils.lerp(r0, rMin, e01);

    // heading + forward
    if (sign !== 0 && speed > 0.001) {
      const omega = (speed / Math.max(0.001, radius)) * sign;
      this._bikerRoot.rotation.y += omega * dtSec;
    }

    this._forward.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._bikerRoot.rotation.y);
    this._bikerRoot.position.addScaledVector(this._forward, speed * dtSec);

    // Коллизии по активным домам (активация по proximity + raycast по мешу).
    this._updateCollisionActivation();
    this._checkCollision();

    const cam = this._getGameplayCamera();
    this._applyGameplayCameraFixedView(cam, this._bikerRoot.position, CITY_CAMERA.gameplay.view.followLerp);
    this._activeCamera = cam;

    // Дом может загораживать персонажа — делаем его полупрозрачным.
    this._updateBikerOcclusion(cam, dtSec);

    // Дома: видимость строго по frustum камеры (в игре — тоже).
    this._buildings.setVisibilityByCamera(cam, 0);
    this._buildings.updateAppear(dtSec, 0.25);

    // Педали: скорость клипа зависит от speed01.
    for (const a of this._pedalActions) {
      a.setEffectiveTimeScale(Math.max(0, speed01) * CITY_ANIMATION.biker.pedals.maxPlaybackSpeed);
    }
  }

  private _updateBikerOcclusion(camera: THREE.Camera, dtSec: number): void {
    if (!this._bikerRoot) return;
    if (this._allBuildingMeshes.length === 0) return;

    // Целимся в “верх” персонажа, чтобы дом прозрачнел, когда реально перекрывает его.
    const targetY = CITY_CAMERA.gameplay.view.targetY;
    this._tmpV3a.set(this._bikerRoot.position.x, targetY, this._bikerRoot.position.z);

    this._tmpV3b.subVectors(this._tmpV3a, camera.position);
    const len = this._tmpV3b.length();
    if (len <= 0.0001) return;
    this._tmpV3b.multiplyScalar(1 / len);

    this._raycaster.set(camera.position, this._tmpV3b);
    this._raycaster.near = 0;
    this._raycaster.far = len;

    const candidates = this._activeBuildingMeshes.length > 0 ? this._activeBuildingMeshes : this._allBuildingMeshes;
    const hits = this._raycaster.intersectObjects(candidates, false);

    let nextRoot: THREE.Object3D | null = null;
    let nextMeshes: THREE.Mesh[] | null = null;

    for (const hit of hits) {
      const m = hit.object as THREE.Mesh;
      const entry = this._meshToBuilding.get(m.uuid);
      if (!entry) continue;
      if (!entry.root.visible) continue;
      nextRoot = entry.root;
      nextMeshes = entry.meshes;
      break;
    }

    const occlOpacity = CITY_TUNING.occlusion.buildingOpacity;
    const fadeSec = CITY_TUNING.occlusion.fadeSec;

    // Обновляем target для всех активных transitions.
    for (const [root, st] of this._occlusionStates) {
      const desired = root === nextRoot ? occlOpacity : 1;
      if (Math.abs(desired - st.target) > 1e-6) {
        st.from = st.current;
        st.target = desired;
        st.t01 = 0;
      }
    }

    // Если появился новый окклюдер — добавляем state.
    if (nextRoot && nextMeshes && !this._occlusionStates.has(nextRoot)) {
      this._occlusionStates.set(nextRoot, {
        meshes: nextMeshes,
        from: 1,
        current: 1,
        target: occlOpacity,
        t01: 0
      });
      // Включаем “окклюзионные” материалы сразу (opacity будет анимироваться).
      for (const mesh of nextMeshes) this._ensureMeshOcclusionMaterial(mesh, 1);
    }

    // Анимируем opacity (квадратичная).
    const dt01 = fadeSec <= 0 ? 1 : Math.min(1, Math.max(0, dtSec) / fadeSec);
    for (const [root, st] of this._occlusionStates) {
      if (Math.abs(st.current - st.target) <= 1e-4) {
        st.current = st.target;
      } else {
        st.t01 = Math.min(1, st.t01 + dt01);
        const eased = _easeInOutQuad(st.t01);
        st.current = st.from + (st.target - st.from) * eased;
      }

      for (const mesh of st.meshes) this._applyMeshOcclusionOpacity(mesh, st.current);

      // Полностью восстановили — возвращаем материалы и убираем state.
      if (st.target >= 0.999 && st.t01 >= 1) {
        for (const mesh of st.meshes) this._restoreMeshOcclusion(mesh);
        this._occlusionStates.delete(root);
      }
    }
  }

  private _ensureMeshOcclusionMaterial(mesh: THREE.Mesh, opacity: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = mesh.userData as any;
    if (!ud._cityOcclusionOrigMaterial) ud._cityOcclusionOrigMaterial = mesh.material;
    if (!ud._cityOcclusionMaterial) ud._cityOcclusionMaterial = _cloneOcclusionMaterial(mesh.material, opacity);
    mesh.material = ud._cityOcclusionMaterial;
    _setMaterialOpacity(ud._cityOcclusionMaterial, opacity);
  }

  private _applyMeshOcclusionOpacity(mesh: THREE.Mesh, opacity: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = mesh.userData as any;
    if (!ud._cityOcclusionMaterial) {
      this._ensureMeshOcclusionMaterial(mesh, opacity);
      return;
    }
    mesh.material = ud._cityOcclusionMaterial;
    _setMaterialOpacity(ud._cityOcclusionMaterial, opacity);
  }

  private _restoreMeshOcclusion(mesh: THREE.Mesh): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = mesh.userData as any;
    if (ud._cityOcclusionOrigMaterial) mesh.material = ud._cityOcclusionOrigMaterial;
  }

  private _createTurnActions(clips: THREE.AnimationClip[], dir: -1 | 1): THREE.AnimationAction[] {
    if (!this._bikerMixer) return [];
    const manifest = CHEL_DEFAULT_MANIFEST.clips;
    const names =
      dir === 1
        ? [manifest.turnLeftBody, manifest.turnLeftArmR, manifest.turnLeftArmL]
        : [manifest.turnRightBody, manifest.turnRightArmR, manifest.turnRightArmL];

    const actions: THREE.AnimationAction[] = [];
    for (const name of names) {
      if (!name) continue;
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const a = this._bikerMixer.clipAction(clip);
      a.enabled = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(0);
      a.play();
      actions.push(a);
    }
    return actions;
  }

  /**
   * Анимация поворота должна быть “включена” с самого начала, но стоять на первом ключевом кадре.
   * По дефолту активен набор `right`.
   */
  private _initTurnActions(): void {
    // Ставим оба набора на первый кадр и паузим.
    for (const a of [...this._turnLeftActions, ...this._turnRightActions]) {
      a.enabled = true;
      a.clampWhenFinished = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.play(); // чтобы action был “живой” в миксере
      a.paused = true;
      a.time = 0;
      a.setEffectiveWeight(0);
      a.setEffectiveTimeScale(1);
    }

    // По умолчанию “включены right”, но всё равно на первом ключе.
    this._turnActive = -1;
    this._turnPhase = "completed";
    this._turnPending = null;
    this._setTurnWeights(-1);
  }

  /**
   * Анимация руля:
   * - при начале поворота: клип проигрывается до конца и залипает на последнем кадре
   * - при отпускании: клип проигрывается назад до нуля (по той же траектории), затем вес уходит в 0
   * - при смене направления: быстро возвращаемся в нейтраль, затем запускаем второе направление
   */
  private _updateTurnAnimation(requested: -1 | 0 | 1): void {
    // requested: 1=left, -1=right, 0=none
    const want: -1 | 1 | null = requested === 0 ? null : requested;

    // 1) Стадия reverse: ждём пока вернёмся на 0, и только потом можем переключать сторону.
    if (this._turnPhase === "reverse") {
      const actions = this._getTurnActions(this._turnActive);
      if (this._areActionsAtStart(actions)) {
        for (const a of actions) {
          a.paused = true;
          a.time = 0;
        }
        this._turnPhase = "completed";

        const pending = this._turnPending;
        this._turnPending = null;
        if (pending !== null) {
          this._turnActive = pending;
          this._setTurnWeights(pending);
          this._startTurnForward(pending, CITY_ANIMATION.biker.turn.fadeIn.durationSec);
          this._turnPhase = "forward";
        }
      }

      // Исключение: если во время reverse нажали ту же сторону — разворачиваемся обратно и докручиваем до конца.
      if (want !== null && want === this._turnActive) {
        this._turnPending = null;
        this._startTurnForward(this._turnActive, CITY_ANIMATION.biker.turn.reverseSnap.durationSec);
        this._turnPhase = "forward";
      } else if (want !== null && want !== this._turnActive) {
        // Противоположная сторона — просто ждём конца reverse и держим в pending.
        this._turnPending = want;
      }
      return;
    }

    // 2) completed: стоим на первом ключе, анимация “завершена”.
    if (this._turnPhase === "completed") {
      if (want === null) return;
      if (this._turnActive !== want) {
        this._turnActive = want;
        this._setTurnWeights(want);
        this._snapTurnToStart(want);
      }
      this._startTurnForward(want, CITY_ANIMATION.biker.turn.fadeIn.durationSec);
      this._turnPhase = "forward";
      return;
    }

    // 3) forward/hold: анимация “незавершена” (либо идём вперёд, либо залипли в конце).
    if (this._turnPhase === "forward") {
      const actions = this._getTurnActions(this._turnActive);
      if (this._areActionsAtEnd(actions)) {
        for (const a of actions) {
          a.paused = true;
          a.time = a.getClip().duration;
        }
        this._turnPhase = "hold";
      }
    }

    if (this._turnPhase === "hold") {
      // держим последний кадр
    }

    // Отпустили — reverse назад до 0.
    if (want === null) {
      this._startTurnReturn(this._turnActive, CITY_ANIMATION.biker.turn.returnToNeutral.durationSec);
      this._turnPhase = "reverse";
      return;
    }

    // Нажали другую сторону, пока “незавершено”: сначала reverse до 0, потом новое.
    if (want !== this._turnActive) {
      this._turnPending = want;
      this._startTurnReturn(this._turnActive, CITY_ANIMATION.biker.turn.reverseSnap.durationSec);
      this._turnPhase = "reverse";
      return;
    }

    // Нажали ту же сторону:
    // - если мы были в hold — ничего не делаем (уже на последнем кадре)
    // - если мы были в forward — продолжаем вперёд
  }

  private _startTurnForward(dir: -1 | 1, travelSec: number): void {
    const actions = this._getTurnActions(dir);
    for (const a of actions) {
      const d = a.getClip().duration;
      a.enabled = true;
      a.clampWhenFinished = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.paused = false;
      a.timeScale = _timeScaleFor(d, travelSec);
      a.play();
    }
  }

  private _startTurnReturn(dir: -1 | 1, travelSec: number): void {
    const actions = this._getTurnActions(dir);
    for (const a of actions) {
      const d = a.getClip().duration;
      a.enabled = true;
      a.clampWhenFinished = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.paused = false;
      a.play();
      // начинаем “с текущего положения”: если мы в hold — это d, если в forward — это уже накопленное время
      if (a.time > d) a.time = d;
      a.timeScale = -_timeScaleFor(d, travelSec);
    }
  }

  private _fadeOutActions(actions: THREE.AnimationAction[], sec: number): void {
    for (const a of actions) {
      a.fadeOut(Math.max(0.001, sec));
    }
  }

  private _areActionsAtStart(actions: readonly THREE.AnimationAction[]): boolean {
    for (const a of actions) {
      if (a.time > 0.001) return false;
    }
    return true;
  }

  private _areActionsAtEnd(actions: readonly THREE.AnimationAction[]): boolean {
    for (const a of actions) {
      const d = a.getClip().duration;
      if (a.time < d - 0.001) return false;
    }
    return true;
  }

  private _getTurnActions(dir: -1 | 1): THREE.AnimationAction[] {
    // dir: 1=left, -1=right
    return dir === 1 ? this._turnLeftActions : this._turnRightActions;
  }

  private _setTurnWeights(dir: -1 | 1): void {
    const leftW = dir === 1 ? 1 : 0;
    const rightW = dir === -1 ? 1 : 0;
    for (const a of this._turnLeftActions) a.setEffectiveWeight(leftW);
    for (const a of this._turnRightActions) a.setEffectiveWeight(rightW);
  }

  private _snapTurnToStart(dir: -1 | 1): void {
    const actions = this._getTurnActions(dir);
    for (const a of actions) {
      a.paused = true;
      a.time = 0;
    }
  }

  private _updateCollisionActivation(): void {
    if (!this._bikerRoot) return;
    const enableR = CITY_GAMEPLAY.collisions.activation.enableRadius;
    const disableR = CITY_GAMEPLAY.collisions.activation.disableRadius;
    const pos = this._bikerRoot.position;

    for (const b of this._buildings.buildings) {
      const dx = b.center.x - pos.x;
      const dz = b.center.z - pos.z;
      const d = Math.hypot(dx, dz);
      const isActive = this._activeBuildings.has(b.root);
      if (!isActive && d <= enableR) {
        this._activeBuildings.add(b.root);
        for (const m of b.meshes) {
          buildMeshBvh(m);
          this._activeBuildingMeshes.push(m);
        }
      } else if (isActive && d >= disableR) {
        this._activeBuildings.delete(b.root);
        for (const m of b.meshes) {
          disposeMeshBvh(m);
        }
        // rebuild active list (редко, но просто)
        this._activeBuildingMeshes = this._activeBuildingMeshes.filter((m) => b.meshes.indexOf(m) < 0);
      }
    }
  }

  private _checkCollision(): void {
    if (!this._bikerRoot) return;
    if (this._activeBuildingMeshes.length === 0) return;

    this._bikerRoot.updateMatrixWorld(true);
    this._tip.copy(this._tipLocal);
    this._bikerRoot.localToWorld(this._tip);

    const delta = new THREE.Vector3().subVectors(this._tip, this._prevTip);
    const len = delta.length();
    if (len <= 0.0001) {
      this._prevTip.copy(this._tip);
      return;
    }
    delta.multiplyScalar(1 / len);
    this._raycaster.set(this._prevTip, delta);
    this._raycaster.near = 0;
    this._raycaster.far = len;

    const hits = this._raycaster.intersectObjects(this._activeBuildingMeshes, false);
    if (hits.length > 0) {
      this._onCrash();
    }

    this._prevTip.copy(this._tip);
  }

  private _onCrash(): void {
    if (this._mode === "crashed") return;
    this._mode = "crashed";
    this._scroll.setEnabled(false);
    this._turn.setEnabled(false);
    this._crashOverlay.show();

    if (this._resetTimer !== null) window.clearTimeout(this._resetTimer);
    this._resetTimer = window.setTimeout(() => this._resetToOverview(), CITY_GAMEPLAY.crash.resetDelaySec * 1000);
  }

  private _resetToOverview(): void {
    if (!this._bikerRoot) return;
    this._mode = "overview";
    this._scroll.setEnabled(true);
    this._turn.setEnabled(false);
    this._crashOverlay.hide();
    this._startBtn.setVisible(true);

    this._gameT = 0;
    this._bikerRoot.visible = false;
    this._bikerRoot.position.copy(this._startWorldPos);
    this._bikerRoot.rotation.set(0, 0, 0);
    this._turnPending = null;
    this._turnActive = -1;
    this._turnPhase = "completed";
    this._setTurnWeights(-1);
    this._snapTurnToStart(-1);
    this._fadeOutActions(this._turnLeftActions, 0.05);
    this._fadeOutActions(this._turnRightActions, 0.05);
    for (const a of this._pedalActions) a.setEffectiveTimeScale(0.0001);

    // Сбрасываем активные коллайдеры.
    for (const m of this._activeBuildingMeshes) disposeMeshBvh(m);
    this._activeBuildingMeshes = [];
    this._activeBuildings.clear();

    this._bikerRoot.updateMatrixWorld(true);
    this._prevTip.copy(this._bikerRoot.localToWorld(this._tipLocal.clone()));
  }

  private _computeGameplayCameraPos(targetPos: THREE.Vector3): THREE.Vector3 {
    const view = CITY_CAMERA.gameplay.view;
    const yaw = (view.yawDeg * Math.PI) / 180;
    const pitch = (view.pitchDeg * Math.PI) / 180;
    const roll = (view.rollDeg * Math.PI) / 180;

    this._gameplayBaseQuat.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    const q = this._composeGameplayQuaternionInto(this._tmpQ);

    const forward = this._tmpV3a.set(0, 0, -1).applyQuaternion(q);
    const target = this._tmpV3b.set(targetPos.x, view.targetY, targetPos.z);
    const pos = target.addScaledVector(forward, -view.distance);

    const off = CITY_CAMERA.gameplay.extraTransform.positionOffset;
    pos.add(this._tmpV3a.set(off.x, off.y, off.z).applyQuaternion(q));
    return pos.clone(); // used only for focus target; ok to allocate here
  }

  private _applyGameplayCameraFixedRotation(camera: THREE.Camera): void {
    camera.quaternion.copy(this._composeGameplayQuaternionInto(this._tmpQ));
  }

  private _applyGameplayCameraFixedView(camera: THREE.Camera, targetPos: THREE.Vector3, followLerp: number): void {
    const view = CITY_CAMERA.gameplay.view;
    const yaw = (view.yawDeg * Math.PI) / 180;
    const pitch = (view.pitchDeg * Math.PI) / 180;
    const roll = (view.rollDeg * Math.PI) / 180;

    // Фиксированный поворот (3/4) + доп. поворот из конфига.
    this._gameplayBaseQuat.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    camera.quaternion.copy(this._composeGameplayQuaternionInto(this._tmpQ));

    // Позиция: держим персонажа на оси взгляда, камера ездит только по плоскости.
    const forward = this._tmpV3a.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const desired = this._tmpV3b.set(targetPos.x, view.targetY, targetPos.z).addScaledVector(forward, -view.distance);

    // Доп. локальный сдвиг.
    const off = CITY_CAMERA.gameplay.extraTransform.positionOffset;
    desired.add(this._tmpV3a.set(off.x, off.y, off.z).applyQuaternion(camera.quaternion));

    const k = Math.max(0, Math.min(1, followLerp));
    camera.position.lerp(desired, k);
  }

  private _composeGameplayQuaternionInto(tmpOut: THREE.Quaternion): THREE.Quaternion {
    const extraRot = CITY_CAMERA.gameplay.extraTransform.rotationOffsetDeg;
    this._tmpQ2.setFromEuler(
      new THREE.Euler((extraRot.x * Math.PI) / 180, (extraRot.y * Math.PI) / 180, (extraRot.z * Math.PI) / 180, "XYZ")
    );
    tmpOut.copy(this._gameplayBaseQuat).multiply(this._tmpQ2);
    return tmpOut;
  }

  private _getGameplayCamera(): THREE.Camera {
    return CITY_CAMERA.gameplay.usePerspective ? this._gameCamera : this._gameOrthoCamera;
  }

  private _applyCameraExtraTransform(camera: THREE.Camera, kind: "overview" | "gameplay"): void {
    const cfg = kind === "overview" ? (CITY_CAMERA.overview.extraTransform ?? null) : CITY_CAMERA.gameplay.extraTransform;
    if (!cfg) return;

    // 1) Доп. поворот: умножаем quaternion на offset-quaternion (локальные оси камеры).
    const r = cfg.rotationOffsetDeg;
    const euler = new THREE.Euler((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180, "XYZ");
    const q = new THREE.Quaternion().setFromEuler(euler);
    camera.quaternion.multiply(q);

    // 2) Доп. сдвиг: трактуем positionOffset как локальный оффсет камеры (вправо/вверх/вперёд).
    const p = cfg.positionOffset;
    const local = new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(camera.quaternion);
    camera.position.add(local);
  }

  /**
   * Простой спавн-пикер: если центр карты внутри дома, ищем ближайшую свободную точку по спирали.
   * Без физики — только AABB по buildings index.
   */
  private _pickSpawnPosition(preferred: THREE.Vector3): THREE.Vector3 {
    const isFree = (p: THREE.Vector3) => {
      for (const b of this._buildings.buildings) {
        // Быстро: проверяем попадание в box здания (в XZ) + clearance.
        const box = b.box;
        if (
          p.x >= box.min.x - this._spawnClearanceRadius &&
          p.x <= box.max.x + this._spawnClearanceRadius &&
          p.z >= box.min.z - this._spawnClearanceRadius &&
          p.z <= box.max.z + this._spawnClearanceRadius
        ) {
          return false;
        }
      }
      return true;
    };

    const p0 = preferred.clone();
    p0.y = 0;
    if (isFree(p0)) return p0;

    // Спираль Архимеда
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i <= 260; i++) {
      const r = 2.0 + i * 0.45;
      const a = i * golden;
      const p = new THREE.Vector3(p0.x + Math.cos(a) * r, 0, p0.z + Math.sin(a) * r);
      if (isFree(p)) return p;
    }
    return p0; // fallback
  }

  private _projectToScreen(
    world: THREE.Vector3,
    w: number,
    h: number,
    camera: THREE.Camera
  ): { x: number; y: number } | null {
    const v = world.clone().project(camera);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
    // z outside clip space
    if (v.z < -1 || v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h
    };
  }
}

function _timeScaleFor(clipDurationSec: number, travelSec: number): number {
  return clipDurationSec / Math.max(0.001, travelSec);
}

function _cloneOcclusionMaterial(
  material: THREE.Material | THREE.Material[],
  opacity: number
): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((m) => _cloneOcclusionMaterial(m, opacity) as THREE.Material);
  const m = material.clone();
  m.transparent = true;
  m.opacity = opacity;
  // Ключевой момент для “без внутренностей”: пишем depth, чтобы задние/внутренние полигоны не просвечивали.
  m.depthWrite = true;
  m.depthTest = true;
  m.side = THREE.FrontSide;
  m.needsUpdate = true;
  return m;
}

function _setMaterialOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
  if (Array.isArray(material)) {
    for (const m of material) _setMaterialOpacity(m, opacity);
    return;
  }
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = true;
  material.side = THREE.FrontSide;
  material.needsUpdate = true;
}

function _easeInOutQuad(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
}
