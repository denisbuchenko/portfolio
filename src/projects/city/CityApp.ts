import * as THREE from "three";
import { CITY_ANIMATION, CITY_ASSETS, CITY_CAMERA, CITY_GAMEPLAY, CITY_TUNING, CITY_WORLD } from "./cityConfig";
import { CHEL_DEFAULT_MANIFEST } from "./contracts";
import { loadGltf, enableShadowsAndSrgb } from "./three/loadGltf";
import { installMeshBvhRaycast } from "./three/meshBvh";
import { projectToScreen } from "./three/projectToScreen";
import { ScrollInput } from "./input/ScrollInput";
import { TurnInput } from "./input/TurnInput";
import { StartButton } from "./ui/StartButton";
import { CrashOverlay } from "./ui/CrashOverlay";
import { CityDebugPanel, type DebugFocusGirlTuning } from "./ui/CityDebugPanel";
import { CityGirlsSystem, type CityGirlRuntime } from "./girls/CityGirlsSystem";
import { CITY_GIRLS } from "./girls/girlsConfig";
import { BikerLoader } from "./biker/BikerLoader";
import { BikerAnimationController } from "./biker/BikerAnimationController";
import { CityWorldController } from "./cityWorld/CityWorldController";
import { CityGameLogic } from "./gameLogic/CityGameLogic";
import { CityGameplayCamera } from "./camera/CityGameplayCamera";
import { applyCityCameraExtraTransform } from "./camera/cityCameraExtraTransform";

type _Mode = "overview" | "focusStart" | "playing" | "encounter" | "crashed";

export class CityApp {
  private _host: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _uiRoot: HTMLDivElement;

  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _sunLight: THREE.DirectionalLight | null = null;
  private _sunTarget = new THREE.Object3D();
  private _sunOffset = new THREE.Vector3(180, 260, 140);
  private _tmpShadowCenter = new THREE.Vector3();

  private _overviewCamera: THREE.OrthographicCamera;
  private _overviewPerspectiveCamera: THREE.PerspectiveCamera;
  private _gameCamera: THREE.PerspectiveCamera;
  private _focusCamera: THREE.PerspectiveCamera;
  private _gameOrthoCamera: THREE.OrthographicCamera;
  private _activeCamera: THREE.Camera;

  private _mode: _Mode = "overview";

  private _scroll = new ScrollInput();
  private _turn = new TurnInput();
  private _unsubScroll: (() => void) | null = null;
  private _unsubTurn: (() => void) | null = null;

  private _startBtn: StartButton | null = null;
  private _crashOverlay: CrashOverlay;
  private _debugPanel: CityDebugPanel;
  private _showStartButton: boolean;
  private _onResetToOverview: ((reason: "crash" | "manual") => void) | null;

  private _raf = 0;
  private _lastT = performance.now();

  // Assets
  private _cityRoot: THREE.Group | null = null;
  private _cityScene: THREE.Group | null = null;
  private _bikerRoot: THREE.Group | null = null;
  private _bikerAnim: BikerAnimationController | null = null;
  private _gameLogic: CityGameLogic | null = null;
  private _girlsSystem: CityGirlsSystem;
  private _gameplayCamera = new CityGameplayCamera();

  private _world = new CityWorldController();
  private _tipLocal = new THREE.Vector3(
    CITY_GAMEPLAY.bikerMotion.collisionTipLocalOffset?.x ?? 0,
    CITY_GAMEPLAY.bikerMotion.collisionTipLocalOffset?.y ?? 0,
    CITY_GAMEPLAY.bikerMotion.collisionTipLocalOffset?.z ?? 0
  );

  private _resetTimer: number | null = null;
  private _loaded = false;
  private _pendingStartGame = false;

  // World data
  private _mapBox = new THREE.Box3();
  private _mapCenter = new THREE.Vector3();
  private _startWorldPos = new THREE.Vector3();
  private _spawnClearanceRadius = 6.5;

  // Gameplay state
  private _cruiseSpeed = CITY_GAMEPLAY.bikerMotion.speed.cruiseSpeed;

  // NOTE: город/дома/окклюзия/коллизии — в `CityWorldController`.

  constructor(opts: {
    host: HTMLElement;
    canvas: HTMLCanvasElement;
    uiRoot: HTMLDivElement;
    showStartButton?: boolean;
    onResetToOverview?: (reason: "crash" | "manual") => void;
  }) {
    this._host = opts.host;
    this._canvas = opts.canvas;
    this._uiRoot = opts.uiRoot;
    this._showStartButton = opts.showStartButton ?? true;
    this._onResetToOverview = opts.onResetToOverview ?? null;

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
    this._scene.add(this._sunTarget);

    this._girlsSystem = new CityGirlsSystem({ scene: this._scene });

    this._overviewCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1200);
    // Камера смотрит строго вниз, поэтому фиксируем up, чтобы не было "рандомного" поворота экрана.
    this._overviewCamera.up.set(0, 0, -1);
    this._overviewCamera.position.set(0, 220, 0);
    this._overviewCamera.lookAt(0, 0, 0);

    this._overviewPerspectiveCamera = new THREE.PerspectiveCamera(55, 1, 1.5, 1200);
    this._overviewPerspectiveCamera.up.set(0, 0, -1);
    this._overviewPerspectiveCamera.position.set(0, 220, 0);
    this._overviewPerspectiveCamera.lookAt(0, 0, 0);

    this._gameCamera = new THREE.PerspectiveCamera(55, 1, 1.5, 900);
    this._gameCamera.position.set(0, 12, 18);
    this._gameCamera.lookAt(0, 0, 0);

    // Временная камера для плавного перехода overview -> gameplay без "скачка" при смене типа камеры.
    this._focusCamera = new THREE.PerspectiveCamera(55, 1, 1.5, 900);
    this._focusCamera.position.set(0, 12, 18);
    this._focusCamera.lookAt(0, 0, 0);

    this._gameOrthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 900);
    this._gameOrthoCamera.position.set(0, 12, 18);
    this._gameOrthoCamera.lookAt(0, 0, 0);

    this._activeCamera = this._overviewCamera;

    this._setupLights();
    if (this._showStartButton) {
      this._startBtn = new StartButton(this._uiRoot);
      this._startBtn.onClick(() => this.startGame());
    }

    this._crashOverlay = new CrashOverlay(this._uiRoot);
    this._debugPanel = new CityDebugPanel(this._uiRoot);
    this._debugPanel.onFocusFirstGirl(() => this._beginDebugFocusFirstGirl());
    this._debugFocusGirlTuning = this._cloneDebugFocusGirlTuning();
    this._debugPanel.setDebugFocusGirlTuning(this._debugFocusGirlTuning);
    this._debugPanel.onDebugFocusGirlTuningChange((next) => {
      this._debugFocusGirlTuning = next;
      this._applyDebugFocusGirlTuningLive();
    });

    this._unsubScroll = this._scroll.bind(this._host);
    this._unsubTurn = this._turn.bind(this._host);

    // Режимы input (обзор: scroll, игра: поворот).
    this._scroll.setEnabled(true);
    this._turn.setEnabled(false);
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
    this._loaded = true;
    this._onResize();
    window.addEventListener("resize", this._onResize);
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._frame);

    if (this._pendingStartGame) {
      this._pendingStartGame = false;
      this.startGame();
    }
  }

  dispose(): void {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this._unsubScroll?.();
    this._unsubTurn?.();

    this._startBtn?.dispose();
    this._crashOverlay.dispose();
    this._debugPanel.dispose();
    if (this._resetTimer !== null) window.clearTimeout(this._resetTimer);

    this._girlsSystem.dispose();

    this._bikerAnim = null;
    this._gameLogic = null;
    this._bikerRoot?.removeFromParent();
    this._cityRoot?.removeFromParent();
    this._cityScene = null;

    this._world.dispose();

    this._renderer.dispose();
  }

  startGame(): void {
    if (!this._loaded || !this._cityRoot) {
      this._pendingStartGame = true;
      return;
    }
    if (this._mode !== "overview") return;
    this._pendingStartGame = false;
    this._beginFocusToStart();
  }

  resetToOverview(overviewProgress01 = 0.5): void {
    this._resetToOverview("manual", overviewProgress01);
  }

  private _setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xd6e5ff, 0x12161f, 0.78);
    this._scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.copy(this._sunOffset);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.near = 30;
    key.shadow.camera.far = 700;
    key.shadow.camera.left = -180;
    key.shadow.camera.right = 180;
    key.shadow.camera.top = 180;
    key.shadow.camera.bottom = -180;
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2;
    key.target = this._sunTarget;
    this._scene.add(key);
    this._sunLight = key;

    const fill = new THREE.DirectionalLight(0x9bc2ff, 0.45);
    fill.position.set(-120, 90, -140);
    this._scene.add(fill);
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
    this._updateCameraClipping();
    this._fitSunShadowToMap();

    // NPC girls (явная инициализация).
    await this._girlsSystem.init({ cityRoot: this._cityRoot });
    this._debugPanel.setGirls(this._girlsSystem.girls);

    // “Пол главнее”: убираем z-fighting/конфликты при пересечениях со сплющенными домами.
    this._applyFloorPriority(this._cityRoot);

    // Индекс домов (для видимости/коллизий/окклюзии).
    this._world.buildFromCityRoot(this._cityRoot);
    this._configureCityShadowModes(this._cityRoot);
    this._world.initBoundaryWalls({
      scene: this._scene,
      worldBox: this._mapBox.clone(),
      config: CITY_WORLD.boundaryWalls
    });
    // Начинаем со скрытых домов — появятся при попадании в окно видимости.
    this._world.setInitialBuildingsHidden();

    // Start/spawn: центр карты, но не внутри дома.
    this._startWorldPos.copy(this._pickSpawnPosition(this._mapCenter));
    this._startWorldPos.y = 0;

    const bikerRig = await new BikerLoader().load(CITY_ASSETS.bikerGltfUrl);
    this._bikerRoot = bikerRig.root;
    this._bikerRoot.visible = false; // до старта игры

    // Масштаб/ориентация — подберём позже, сейчас просто “чтобы было видно”.
    this._bikerRoot.scale.setScalar(1.0);
    this._bikerRoot.position.copy(this._startWorldPos);
    this._bikerRoot.position.y = 0;
    this._scene.add(this._bikerRoot);

    // Стартуем педали “в фоне” — потом поднимем скорость.
    // В `Chel.gltf` педалирование размазано по нескольким клипам: pedal/pedalL/pedalR + ноги legR/lelL.
    const pedalNames = [
      CHEL_DEFAULT_MANIFEST.clips.pedal,
      CHEL_DEFAULT_MANIFEST.clips.pedalL,
      CHEL_DEFAULT_MANIFEST.clips.pedalR,
      CHEL_DEFAULT_MANIFEST.clips.legR,
      CHEL_DEFAULT_MANIFEST.clips.lelL
    ].filter(Boolean) as string[];

    const manifest = CHEL_DEFAULT_MANIFEST.clips;
    const turnLeftNames = [manifest.turnLeftBody, manifest.turnLeftArmR, manifest.turnLeftArmL].filter(Boolean) as string[];
    const turnRightNames = [manifest.turnRightBody, manifest.turnRightArmR, manifest.turnRightArmL].filter(Boolean) as string[];

    this._bikerAnim = new BikerAnimationController({
      root: this._bikerRoot,
      clips: bikerRig.clips,
      pedalClipNames: pedalNames,
      turnLeftNames,
      turnRightNames,
      turn: {
        fadeInSec: CITY_ANIMATION.biker.turn.fadeIn.durationSec,
        returnToNeutralSec: CITY_ANIMATION.biker.turn.returnToNeutral.durationSec,
        reverseSnapSec: CITY_ANIMATION.biker.turn.reverseSnap.durationSec
      }
    });

    // Настраиваем tip для коллизий и сбрасываем collision state.
    this._world.setBikerTipLocalOffset({
      x: this._tipLocal.x,
      y: this._tipLocal.y,
      z: this._tipLocal.z
    });
    this._world.resetCollisionState(this._bikerRoot);

    // Оркестратор игровой логики (явное место, где описано "что и когда обновляется").
    this._gameLogic = new CityGameLogic({
      turn: this._turn,
      scroll: this._scroll,
      world: this._world,
      bikerRoot: this._bikerRoot,
      bikerAnim: this._bikerAnim,
      girls: this._girlsSystem.asGameLogicGirls()
    });
  };

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

  private _configureCityShadowModes(root: THREE.Object3D): void {
    const buildingMeshes = new Set<string>();
    for (const building of this._world.buildingsIndex.buildings) {
      for (const mesh of building.meshes) buildingMeshes.add(mesh.uuid);
    }

    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;

      const isBuildingMesh = buildingMeshes.has(mesh.uuid);
      const isRoadLike = this._isRoadLikeNodeName(o.name);

      if (isBuildingMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        return;
      }

      if (isRoadLike) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        return;
      }

      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
  }

  private _isRoadLikeNodeName(name: string | undefined): boolean {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes("road") || name.includes("Дорога");
  }

  private _updateCameraClipping(): void {
    this._mapBox.getSize(this._tmpSize);
    const mapSpan = Math.max(this._tmpSize.x, this._tmpSize.z, 200);
    const mapHeight = Math.max(this._tmpSize.y, 40);
    const overviewDist = this._overviewPerspectiveCamera.position.distanceTo(this._mapCenter);
    const far = Math.max(700, overviewDist + mapSpan * 1.35 + mapHeight * 2.5);
    const perspectiveNear = Math.max(1.5, Math.min(6, far * 0.0035));

    for (const cam of [this._overviewPerspectiveCamera, this._gameCamera, this._focusCamera]) {
      cam.near = perspectiveNear;
      cam.far = far;
      cam.updateProjectionMatrix();
    }

    for (const cam of [this._overviewCamera, this._gameOrthoCamera]) {
      cam.near = 1;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
  }

  private _fitSunShadowToMap(): void {
    if (!this._sunLight) return;

    this._mapBox.getSize(this._tmpSize);
    const mapSpan = Math.max(this._tmpSize.x, this._tmpSize.z, 200);
    const pad = Math.max(24, mapSpan * 0.14);
    const halfExtent = mapSpan * 0.5 + pad;

    this._sunTarget.position.copy(this._mapCenter);
    this._sunTarget.updateMatrixWorld();
    this._sunLight.position.copy(this._mapCenter).add(this._sunOffset);

    const shadowCam = this._sunLight.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -halfExtent;
    shadowCam.right = halfExtent;
    shadowCam.top = halfExtent;
    shadowCam.bottom = -halfExtent;
    shadowCam.near = 40;
    shadowCam.far = Math.max(500, this._sunOffset.length() + this._tmpSize.y + pad);
    shadowCam.updateProjectionMatrix();
  }

  private _fitSunShadowToFocus(center: THREE.Vector3, halfExtent: number): void {
    if (!this._sunLight) return;

    const extent = Math.max(28, halfExtent);
    const texelWorldSize = (extent * 2) / Math.max(1, this._sunLight.shadow.mapSize.x);
    this._tmpShadowCenter.set(
      Math.round(center.x / texelWorldSize) * texelWorldSize,
      center.y,
      Math.round(center.z / texelWorldSize) * texelWorldSize
    );

    this._sunTarget.position.copy(this._tmpShadowCenter);
    this._sunTarget.updateMatrixWorld();
    this._sunLight.position.copy(this._tmpShadowCenter).add(this._sunOffset);

    const shadowCam = this._sunLight.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -extent;
    shadowCam.right = extent;
    shadowCam.top = extent;
    shadowCam.bottom = -extent;
    shadowCam.near = 50;
    shadowCam.far = Math.max(420, this._sunOffset.length() + extent * 1.5);
    shadowCam.updateProjectionMatrix();
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

    this._focusCamera.aspect = aspect;
    this._focusCamera.updateProjectionMatrix();

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

    if (this._mode === "overview") this._updateOverview(dtSec);
    else if (this._mode === "focusStart") this._updateFocus(dtSec);
    else if (this._mode === "playing") this._updatePlaying(dtSec);
    else if (this._mode === "encounter") this._updateEncounter(dtSec);
    else if (this._mode === "crashed") {
      // wait (reset/reload будет добавлен позже)
    }

    // Девочки: миксеры обновляем всегда, логика реакций — в `CityGameLogic` внутри `_updatePlaying`.
    this._girlsSystem.updateAlways(dtSec);

    this._bikerAnim?.update(dtSec);
    this._renderer.render(this._scene, this._activeCamera);
  };

  private _updateOverview(_dtSec: number): void {
    if (!this._cityRoot) return;
    const w = this._host.clientWidth || window.innerWidth;
    const h = this._host.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);

    // Debug panel visible only in overview.
    this._debugPanel.setVisible(true);

    // Если активен debug focus — подменяем обзорный апдейт на плавный наезд к девочке.
    if (this._debugFocus) {
      this._updateDebugFocus(_dtSec);
      return;
    }

    const usePerspective = CITY_CAMERA.overview.usePerspective ?? false;
    const cam = usePerspective ? this._overviewPerspectiveCamera : this._overviewCamera;
    this._fitSunShadowToMap();

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

    applyCityCameraExtraTransform(cam, "overview");
    this._activeCamera = cam;

    // Режим города: игнорируем левую/правую границы и следим только за верхом/низом.
    // Хотим “пару пикселей” отступа от края -> переводим px -> NDC.
    const edgePx = 3;
    const edgeInsetNdc = (2 * edgePx) / Math.max(1, h);
    this._world.updateOverviewVisibility(cam, edgeInsetNdc, _dtSec);

    if (!this._showStartButton || !this._startBtn) return;
    const p = projectToScreen(this._startWorldPos, w, h, cam);
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
  private _focusFromQuat = new THREE.Quaternion();
  private _focusToQuat = new THREE.Quaternion();
  private _focusFromFov = 55;
  private _focusToFov = 55;
  private _tmpDir = new THREE.Vector3();
  private _tmpFocusPos = new THREE.Vector3();

  // Proximity zoom (камера приближается при подъезде к девочкам)
  private _proximityDistanceMul = 1;
  private _tmpGirlPos = new THREE.Vector3();

  // Debug camera focus (overview)
  private _debugFocus:
    | null
    | {
        t: number;
        travelSec: number;
        fromPos: THREE.Vector3;
        toPos: THREE.Vector3;
        fromQuat: THREE.Quaternion;
        toQuat: THREE.Quaternion;
        fromFov: number;
        toFov: number;
      } = null;
  private _tmpBox = new THREE.Box3();
  private _tmpSize = new THREE.Vector3();
  private _tmpLook = new THREE.Object3D();
  private _debugFocusGirlId: string | null = null;
  private _debugFocusGirlTuning: DebugFocusGirlTuning;

  // Speed scaling (замедление/остановка)
  private _speedMul = 1;

  private _encounter:
    | null
    | {
        girlId: string;
        phase: "stopping" | "focusIn" | "love" | "hold" | "return" | "resume";
        cameraW: number;
        holdSecLeft: number;
        loveStarted: boolean;
      } = null;

  private _tmpGoalPos = new THREE.Vector3();
  private _tmpCamFollow = new THREE.Vector3();
  private _tmpCamFocus = new THREE.Vector3();
  private _tmpCamDesired = new THREE.Vector3();

  private _beginFocusToStart(): void {
    if (!this._cityRoot) return;
    this._girlsSystem.resetToHome("focusStart");
    this._mode = "focusStart";
    this._scroll.setEnabled(false);
    this._turn.setEnabled(false);
    this._startBtn?.setVisible(false);
    this._focusT = 0;
    const overviewCam = (CITY_CAMERA.overview.usePerspective ?? false) ? this._overviewPerspectiveCamera : this._overviewCamera;

    // Старт перехода: ровно текущее состояние overview камеры.
    this._focusFrom.copy(overviewCam.position);
    this._focusFromQuat.copy(overviewCam.quaternion);
    this._focusFromFov = this._getFovForCamera(overviewCam);

    // Конец перехода: игровая камера.
    this._focusTo.copy(this._gameplayCamera.computeCameraPosForTarget(this._startWorldPos));
    this._gameplayCamera.computeFixedQuaternionInto(this._focusToQuat);
    this._focusToFov = this._gameCamera.fov;

    // Переход выполняем перспективной камерой, но стартовые параметры подгоняем так,
    // чтобы при смене типа камеры (ортхо->персп) не было "попа".
    this._focusCamera.position.copy(this._focusFrom);
    this._focusCamera.quaternion.copy(this._focusFromQuat);
    this._focusCamera.fov = this._focusFromFov;
    this._focusCamera.updateProjectionMatrix();
    this._activeCamera = this._focusCamera;
    this._debugPanel.setVisible(false);
  }

  private _updateFocus(dtSec: number): void {
    this._focusT += dtSec;
    const t01 = Math.min(1, this._focusT / Math.max(0.001, CITY_CAMERA.focusStart.travelSec));
    const k = (CITY_CAMERA.focusStart as any).ease?.curve === "linear" ? t01 : t01 * t01 * (3 - 2 * t01); // smoothstep
    this._tmpFocusPos.lerpVectors(this._focusFrom, this._focusTo, k);

    // Плавно интерполируем pos + quat + fov на transition-камере.
    // Это убирает скачок при первом кадре после клика (смена типа камеры) и скачок в конце перехода.
    this._focusCamera.position.copy(this._tmpFocusPos);
    this._focusCamera.quaternion.slerpQuaternions(this._focusFromQuat, this._focusToQuat, k);
    this._focusCamera.fov = THREE.MathUtils.lerp(this._focusFromFov, this._focusToFov, k);
    this._focusCamera.updateProjectionMatrix();
    this._fitSunShadowToFocus(this._tmpFocusPos, 72);
    this._activeCamera = this._focusCamera;

    if (t01 >= 1) {
      // Перед переключением синхронизируем игровую камеру с финальным состоянием transition-камеры,
      // чтобы не было "попа" от смены объекта камеры.
      this._gameCamera.position.copy(this._focusCamera.position);
      this._gameCamera.quaternion.copy(this._focusCamera.quaternion);
      this._gameCamera.fov = this._focusToFov;
      this._gameCamera.updateProjectionMatrix();
      this._beginPlaying();
    }
  }

  private _beginDebugFocusFirstGirl(): void {
    if (this._girlsSystem.girls.length === 0) return;
    const g = this._girlsSystem.girls[0]!;
    this._beginDebugFocusGirl(g);
  }

  private _beginDebugFocusGirl(g: CityGirlRuntime): NonNullable<CityApp["_debugFocus"]> {
    const cfg = this._debugFocusGirlTuning;
    this._debugFocusGirlId = g.id;

    // Стартовая камера — текущая обзорная.
    const overviewCam = (CITY_CAMERA.overview.usePerspective ?? false) ? this._overviewPerspectiveCamera : this._overviewCamera;
    const fromPos = overviewCam.position.clone();
    const fromQuat = overviewCam.quaternion.clone();
    const fromFov = this._getFovForCamera(overviewCam);

    // Цель — девочка в полный рост.
    g.controller.instance.root.updateMatrixWorld(true);
    this._tmpBox.setFromObject(g.controller.instance.root);
    this._tmpBox.getSize(this._tmpSize);

    // Центр бокса (в мировых координатах) — самая надёжная точка наведения, т.к. pivot модели может быть где угодно.
    this._tmpBox.getCenter(this._tmpGirlPos);

    const w = this._host.clientWidth || window.innerWidth;
    const h = this._host.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);

    const fov = THREE.MathUtils.clamp(cfg.fov, 10, 120);
    let toPos: THREE.Vector3;
    let toQuat: THREE.Quaternion;

    if (cfg.mode === "fixed") {
      const lookAtLocal = cfg.fixed.lookAtLocalOffset;
      const lookAt = this._tmpGirlPos.clone().add(new THREE.Vector3(lookAtLocal.x, lookAtLocal.y, lookAtLocal.z));

      // Базовый lookAt (без доп. трансформаций).
      this._tmpLook.position.copy(this._tmpGirlPos);
      this._tmpLook.lookAt(lookAt);
      const baseQ = this._tmpLook.quaternion.clone();

      const off = cfg.fixed.cameraLocalOffset;
      const local = new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(baseQ);
      toPos = lookAt.clone().add(local);

      this._tmpLook.position.copy(toPos);
      this._tmpLook.lookAt(lookAt);
      toQuat = this._tmpLook.quaternion.clone();
    } else {
      const padding = Math.max(1.0, cfg.padding);
      // Фит по высоте, с учётом aspect (чтобы на узком экране не "резало" по ширине).
      const fitSize = Math.max(this._tmpSize.y, this._tmpSize.x / Math.max(0.25, aspect), 0.2);
      const dist = (fitSize * 0.5 * padding) / Math.tan((fov * Math.PI) / 180 / 2);

      // Ставим камеру под диагональный угол, но всегда смотрим строго на центр.
      const yaw = (cfg.yawDeg * Math.PI) / 180;
      const pitch = (cfg.pitchDeg * Math.PI) / 180;
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")).normalize();

      toPos = this._tmpGirlPos.clone().addScaledVector(dir, -dist);

      this._tmpLook.position.copy(toPos);
      this._tmpLook.lookAt(this._tmpGirlPos);
      toQuat = this._tmpLook.quaternion.clone();
    }

    // Доп. ручная подстройка (понятные локальные оффсеты).
    if (cfg.extraTransform) {
      const r = cfg.extraTransform.rotationOffsetDeg;
      const qOff = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180, "XYZ")
      );
      toQuat.multiply(qOff);

      const p = cfg.extraTransform.positionOffset;
      const local = new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(toQuat);
      toPos.add(local);
    }

    const st: NonNullable<CityApp["_debugFocus"]> = {
      t: 0,
      travelSec: Math.max(0.001, cfg.travelSec),
      fromPos,
      toPos,
      fromQuat,
      toQuat,
      fromFov,
      toFov: fov
    };
    this._debugFocus = st;

    // используем focusCamera как transition-камеру
    this._focusCamera.position.copy(fromPos);
    this._focusCamera.quaternion.copy(fromQuat);
    this._focusCamera.fov = fromFov;
    this._focusCamera.updateProjectionMatrix();
    this._activeCamera = this._focusCamera;
    return st;
  }

  private _updateDebugFocus(dtSec: number): void {
    const st = this._debugFocus;
    if (!st) return;
    st.t += Math.max(0, dtSec);
    const t01 = Math.min(1, st.t / Math.max(0.001, st.travelSec));
    const k = t01 * t01 * (3 - 2 * t01);

    this._tmpFocusPos.lerpVectors(st.fromPos, st.toPos, k);
    this._focusCamera.position.copy(this._tmpFocusPos);
    this._focusCamera.quaternion.slerpQuaternions(st.fromQuat, st.toQuat, k);
    this._focusCamera.fov = THREE.MathUtils.lerp(st.fromFov, st.toFov, k);
    this._focusCamera.updateProjectionMatrix();
    this._activeCamera = this._focusCamera;

    if (t01 >= 1) {
      // остаёмся стоять в этом положении (debug)
    }
  }

  private _cloneDebugFocusGirlTuning(): DebugFocusGirlTuning {
    const c = CITY_CAMERA.debugFocusGirl;
    return {
      mode: c.mode,
      travelSec: c.travelSec,
      fov: c.fov,
      padding: c.padding,
      yawDeg: c.yawDeg,
      pitchDeg: c.pitchDeg,
      fixed: {
        cameraLocalOffset: { ...c.fixed.cameraLocalOffset },
        lookAtLocalOffset: { ...c.fixed.lookAtLocalOffset }
      },
      extraTransform: {
        positionOffset: { ...c.extraTransform.positionOffset },
        rotationOffsetDeg: { ...c.extraTransform.rotationOffsetDeg }
      }
    };
  }

  private _applyDebugFocusGirlTuningLive(): void {
    if (this._mode !== "overview") return;
    if (!this._debugFocusGirlId) return;
    const g = this._girlsSystem.girls.find((x) => x.id === this._debugFocusGirlId) ?? null;
    if (!g) return;

    // Пересчитать и сразу применить (без ожидания travelSec).
    const st = this._beginDebugFocusGirl(g);
    this._focusCamera.position.copy(st.toPos);
    this._focusCamera.quaternion.copy(st.toQuat);
    this._focusCamera.fov = st.toFov;
    this._focusCamera.updateProjectionMatrix();
    this._activeCamera = this._focusCamera;
  }

  private _getFovForCamera(camera: THREE.Camera): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCam = camera as any;
    if (anyCam.isPerspectiveCamera) {
      const c = camera as THREE.PerspectiveCamera;
      return THREE.MathUtils.clamp(c.fov, 10, 120);
    }
    if (!anyCam.isOrthographicCamera) return 55;

    const c = camera as THREE.OrthographicCamera;

    // Для ортхо считаем эквивалентный FOV так, чтобы на плоскости y=0 масштаб совпал.
    const orthoHeight = Math.abs(c.top - c.bottom) / Math.max(1e-6, c.zoom || 1);
    const pos = c.position;
    c.getWorldDirection(this._tmpDir);
    const dy = this._tmpDir.y;
    if (Math.abs(dy) < 1e-6) return 25;

    // Пересечение луча камеры с плоскостью y=0.
    const t = -pos.y / dy;
    const dist = Math.max(1e-3, Math.abs(t));
    const fovRad = 2 * Math.atan((orthoHeight * 0.5) / dist);
    const fovDeg = (fovRad * 180) / Math.PI;
    return THREE.MathUtils.clamp(fovDeg, 10, 120);
  }

  private _beginPlaying(): void {
    this._mode = "playing";
    this._scroll.setEnabled(false);
    this._turn.setEnabled(true);
    this._gameLogic?.reset();
    this._bikerRoot!.visible = true;
    this._crashOverlay.hide();
    this._debugPanel.setVisible(false);
    this._speedMul = 1;
    this._encounter = null;
    this._fitSunShadowToFocus(this._bikerRoot!.position, 64);
  }

  private _updatePlaying(dtSec: number): void {
    if (!this._bikerRoot) return;

    // Замедление при подъезде к цилиндру цели.
    const slowdownCfg = CITY_GAMEPLAY.girlEncounter.slowdown;
    const nearestGoalBefore = slowdownCfg.enabled ? this._findNearestGirlGoalDistance() : null;
    let targetSpeedMul = 1;
    if (nearestGoalBefore && slowdownCfg.enabled) {
      const reactionR = CITY_GIRLS.hello.distance;
      const activationR = reactionR * Math.max(1, slowdownCfg.activationRadiusMultiplier);
      const reachR = CITY_GIRLS.goal.reachRadius;
      const edgeMul = THREE.MathUtils.clamp(slowdownCfg.edgeSpeedMultiplier, 0.05, 1);
      const d = nearestGoalBefore.distToGoal;

      if (d <= reachR) {
        targetSpeedMul = 0;
      } else if (d < activationR) {
        const t = 1 - (d - reachR) / Math.max(1e-6, activationR - reachR); // 0..1
        const t01 = THREE.MathUtils.clamp(t, 0, 1);
        const eased = slowdownCfg.curve === "linear" ? t01 : t01 * t01 * (3 - 2 * t01); // smoothstep
        targetSpeedMul = THREE.MathUtils.lerp(1, edgeMul, eased);
      }
    }

    const isSlowing = targetSpeedMul < this._speedMul;
    const easeSec = Math.max(0.001, isSlowing ? slowdownCfg.approachEaseSec : slowdownCfg.releaseEaseSec);
    const alphaSpeed = 1 - Math.exp(-Math.max(0, dtSec) / easeSec);
    this._speedMul = THREE.MathUtils.lerp(this._speedMul, targetSpeedMul, alphaSpeed);

    // Движение героя + реакция девочек (чистая оркестрация — в отдельном файле).
    this._gameLogic?.updatePlaying({
      dtSec,
      speedIdleSec: CITY_GAMEPLAY.bikerMotion.speed.idleSec,
      speedRampSec: CITY_GAMEPLAY.bikerMotion.speed.rampSec,
      cruiseSpeed: this._cruiseSpeed,
      speedMul: this._speedMul,
      turnRadiusStart: CITY_GAMEPLAY.bikerMotion.turn.radiusStart,
      turnRadiusMin: CITY_GAMEPLAY.bikerMotion.turn.radiusMin,
      turnRadiusEaseSec: CITY_GAMEPLAY.bikerMotion.turn.radiusEaseSec,
      pedalsMaxPlaybackSpeed: CITY_ANIMATION.biker.pedals.maxPlaybackSpeed,
      collisionActivation: CITY_GAMEPLAY.collisions.activation
    });

    // Въехали в цилиндр цели -> катсцена.
    const nearestGoalAfter = this._findNearestGirlGoalDistance();
    if (
      nearestGoalAfter &&
      nearestGoalAfter.distToGoal <= CITY_GIRLS.goal.reachRadius &&
      !nearestGoalAfter.girl.state.goalReached
    ) {
      this._beginEncounter(nearestGoalAfter.girl);
      return;
    }

    // Коллизии: после движения проверяем hit по tip.
    if (this._world.checkCollision(this._bikerRoot)) {
      this._onCrash();
      return;
    }

    // Proximity zoom: камера приближается при подъезде к девочкам.
    const proxCfg = (CITY_CAMERA.gameplay as any).proximityZoom ?? null;
    if (proxCfg?.enabled) {
      const reactionR = CITY_GIRLS.hello.distance;
      const activationR = reactionR * Math.max(1, proxCfg.activationRadiusMultiplier ?? 2);
      const minMul = Math.max(0.05, Math.min(1, proxCfg.minDistanceMultiplier ?? 0.5));

      let nearest = Infinity;
      for (const g of this._girlsSystem.girls) {
        g.controller.instance.root.getWorldPosition(this._tmpGirlPos);
        const dx = this._bikerRoot.position.x - this._tmpGirlPos.x;
        const dz = this._bikerRoot.position.z - this._tmpGirlPos.z;
        const d = Math.hypot(dx, dz);
        if (d < nearest) nearest = d;
      }

      let targetMul = 1;
      if (Number.isFinite(nearest)) {
        if (nearest <= reactionR) {
          targetMul = minMul;
        } else if (nearest < activationR) {
          const t = 1 - (nearest - reactionR) / Math.max(1e-6, activationR - reactionR); // 0..1
          const t01 = Math.max(0, Math.min(1, t));
          const eased = proxCfg.curve === "linear" ? t01 : t01 * t01 * (3 - 2 * t01); // smoothstep
          targetMul = THREE.MathUtils.lerp(1, minMul, eased);
        }
      }

      const isApproaching = targetMul < this._proximityDistanceMul;
      const easeSec = Math.max(0.001, isApproaching ? proxCfg.approachEaseSec ?? 0.35 : proxCfg.releaseEaseSec ?? 0.55);
      const alpha = 1 - Math.exp(-Math.max(0, dtSec) / easeSec);
      this._proximityDistanceMul = THREE.MathUtils.lerp(this._proximityDistanceMul, targetMul, alpha);
    } else {
      this._proximityDistanceMul = 1;
    }

    const cam = this._getGameplayCamera();
    this._gameplayCamera.computeFixedQuaternionInto(cam.quaternion);
    const followDesired = this._gameplayCamera.computeDesiredPositionInto(this._tmpCamFollow, this._bikerRoot.position, this._proximityDistanceMul);
    cam.position.lerp(followDesired, THREE.MathUtils.clamp(CITY_CAMERA.gameplay.view.followLerp, 0, 1));
    this._fitSunShadowToFocus(this._bikerRoot.position, 64);
    this._activeCamera = cam;

    // Дом может загораживать персонажа — делаем его полупрозрачным.
    this._world.updateBikerOcclusion({
      camera: cam,
      bikerPos: this._bikerRoot.position,
      targetY: CITY_CAMERA.gameplay.view.targetY,
      dtSec,
      config: CITY_TUNING.occlusion
    });

    // Дома: видимость строго по frustum камеры (в игре — тоже).
    this._world.updatePlayingVisibility(cam, dtSec);
  }

  private _updateEncounter(dtSec: number): void {
    if (!this._bikerRoot || !this._encounter) return;

    const cfg = CITY_GAMEPLAY.girlEncounter;
    const enc = this._encounter;
    const girl = this._girlsSystem.girls.find((g) => g.id === enc.girlId) ?? null;
    if (!girl) {
      this._mode = "playing";
      this._turn.setEnabled(true);
      this._encounter = null;
      return;
    }

    let finishEncounter = false;

    // Во время катсцены не управляем поворотом.
    this._turn.setEnabled(false);

    // Управление скоростью: остановка/восстановление.
    if (enc.phase === "resume") {
      const a = 1 - Math.exp(-Math.max(0, dtSec) / Math.max(0.001, cfg.resume.easeSec));
      this._speedMul = THREE.MathUtils.lerp(this._speedMul, 1, a);
    } else {
      const a = 1 - Math.exp(-Math.max(0, dtSec) / Math.max(0.001, cfg.stop.easeSec));
      this._speedMul = THREE.MathUtils.lerp(this._speedMul, 0, a);
    }

    // Держим педали/движение синхронизированными через gameLogic.
    this._gameLogic?.updatePlaying({
      dtSec,
      speedIdleSec: CITY_GAMEPLAY.bikerMotion.speed.idleSec,
      speedRampSec: CITY_GAMEPLAY.bikerMotion.speed.rampSec,
      cruiseSpeed: this._cruiseSpeed,
      speedMul: this._speedMul,
      turnRadiusStart: CITY_GAMEPLAY.bikerMotion.turn.radiusStart,
      turnRadiusMin: CITY_GAMEPLAY.bikerMotion.turn.radiusMin,
      turnRadiusEaseSec: CITY_GAMEPLAY.bikerMotion.turn.radiusEaseSec,
      pedalsMaxPlaybackSpeed: CITY_ANIMATION.biker.pedals.maxPlaybackSpeed,
      collisionActivation: CITY_GAMEPLAY.collisions.activation
    });

    // Фазы:
    if (enc.phase === "stopping") {
      if (this._speedMul <= 0.03) this._encounter.phase = "focusIn";
    }

    if (enc.phase === "focusIn") {
      const a = 1 - Math.exp(-Math.max(0, dtSec) / Math.max(0.001, cfg.camera.focusInSec));
      this._encounter.cameraW = THREE.MathUtils.lerp(this._encounter.cameraW, 1, a);
      if (this._encounter.cameraW >= 0.995) this._encounter.phase = "love";
    }

    if (enc.phase === "love") {
      if (!this._encounter.loveStarted) {
        girl.state.goalReached = true;
        this._girlsSystem.setGoalVisible(girl, false);
        girl.anim.beginLoveSequence();
        this._encounter.loveStarted = true;
      }
      const res = girl.anim.tick(dtSec);
      if (res.loveFinished) {
        this._encounter.phase = "hold";
        this._encounter.holdSecLeft = cfg.camera.holdSec;
      }
    } else {
      // В катсцене всё равно тикаем, чтобы love2 продолжал жить.
      girl.anim.tick(dtSec);
    }

    if (enc.phase === "hold") {
      this._encounter.holdSecLeft = Math.max(0, this._encounter.holdSecLeft - Math.max(0, dtSec));
      if (this._encounter.holdSecLeft <= 0) this._encounter.phase = "return";
    }

    if (enc.phase === "return") {
      const a = 1 - Math.exp(-Math.max(0, dtSec) / Math.max(0.001, cfg.camera.returnSec));
      this._encounter.cameraW = THREE.MathUtils.lerp(this._encounter.cameraW, 0, a);
      if (this._encounter.cameraW <= 0.01) this._encounter.phase = "resume";
    }

    if (enc.phase === "resume") {
      if (this._speedMul >= 0.98) {
        finishEncounter = true;
      }
    }

    // Камера: считаем 2 "желания" и смешиваем по весу.
    const cam = this._getGameplayCamera();
    this._gameplayCamera.computeFixedQuaternionInto(cam.quaternion);
    const followDesired = this._gameplayCamera.computeDesiredPositionInto(this._tmpCamFollow, this._bikerRoot.position, 1);
    girl.controller.instance.root.getWorldPosition(this._tmpGirlPos);
    this._tmpFocusPos.addVectors(this._bikerRoot.position, this._tmpGirlPos).multiplyScalar(0.5);
    this._fitSunShadowToFocus(this._tmpFocusPos, 68);
    const focusDesired = this._gameplayCamera.computeDesiredPositionInto(
      this._tmpCamFocus,
      this._tmpGirlPos,
      cfg.camera.focusDistanceMultiplier,
      cfg.camera.focusTargetY
    );
    this._tmpCamDesired.copy(followDesired).lerp(focusDesired, THREE.MathUtils.clamp(enc.cameraW, 0, 1));
    cam.position.lerp(this._tmpCamDesired, THREE.MathUtils.clamp(CITY_CAMERA.gameplay.view.followLerp, 0, 1));
    this._activeCamera = cam;

    // Мир продолжаем обновлять мягко.
    this._world.updateBikerOcclusion({
      camera: cam,
      bikerPos: this._bikerRoot.position,
      targetY: CITY_CAMERA.gameplay.view.targetY,
      dtSec,
      config: CITY_TUNING.occlusion
    });
    this._world.updatePlayingVisibility(cam, dtSec);

    if (finishEncounter) {
      this._mode = "playing";
      this._turn.setEnabled(true);
      this._encounter = null;
    }
  }

  private _beginEncounter(girl: CityGirlRuntime): void {
    if (this._mode === "encounter") return;
    this._mode = "encounter";
    this._encounter = {
      girlId: girl.id,
      phase: "stopping",
      cameraW: 0,
      holdSecLeft: 0,
      loveStarted: false
    };
  }

  private _findNearestGirlGoalDistance(): null | { girl: CityGirlRuntime; distToGoal: number } {
    if (!this._bikerRoot) return null;
    let bestGirl: CityGirlRuntime | null = null;
    let bestD = Infinity;
    for (const g of this._girlsSystem.girls) {
      if (g.state.goalReached) continue;
      g.goal.getWorldPosition(this._tmpGoalPos);
      const dx = this._bikerRoot.position.x - this._tmpGoalPos.x;
      const dz = this._bikerRoot.position.z - this._tmpGoalPos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        bestGirl = g;
      }
    }
    if (!bestGirl || !Number.isFinite(bestD)) return null;
    return { girl: bestGirl, distToGoal: bestD };
  }

  // NOTE: Biker animation logic extracted to `src/projects/city/biker/BikerAnimationController.ts`,
  // а мир/дома/окклюзия/коллизии — в `src/projects/city/cityWorld/CityWorldController.ts`.

  private _onCrash(): void {
    if (this._mode === "crashed") return;
    this._mode = "crashed";
    this._encounter = null;
    this._speedMul = 1;
    this._girlsSystem.resetToHome("crash");
    this._scroll.setEnabled(false);
    this._turn.setEnabled(false);
    this._crashOverlay.show();
    this._debugPanel.setVisible(false);

    if (this._resetTimer !== null) window.clearTimeout(this._resetTimer);
    this._resetTimer = window.setTimeout(() => this._resetToOverview("crash", 0.5), CITY_GAMEPLAY.crash.resetDelaySec * 1000);
  }

  private _resetToOverview(reason: "crash" | "manual", overviewProgress01: number): void {
    if (!this._bikerRoot) return;
    if (this._resetTimer !== null) {
      window.clearTimeout(this._resetTimer);
      this._resetTimer = null;
    }

    this._mode = "overview";
    this._encounter = null;
    this._speedMul = 1;
    this._proximityDistanceMul = 1;
    this._girlsSystem.resetToHome("resetToOverview");
    this._scroll.setProgress01(Math.max(0, Math.min(1, overviewProgress01)));
    this._scroll.setEnabled(true);
    this._turn.setEnabled(false);
    this._crashOverlay.hide();
    this._startBtn?.setVisible(this._showStartButton);
    this._debugPanel.setVisible(true);
    this._debugFocus = null;
    this._debugFocusGirlId = null;

    this._bikerRoot.visible = false;
    this._bikerRoot.position.copy(this._startWorldPos);
    this._bikerRoot.rotation.set(0, 0, 0);
    this._bikerAnim?.reset();

    // Сбрасываем активные коллайдеры.
    this._world.resetCollisionState(this._bikerRoot);
    this._onResetToOverview?.(reason);
  }

  /** Showcase: установить прогресс обзорного скролла извне (0..1). */
  setOverviewProgress(progress01: number): void {
    this._scroll.setProgress01(Math.max(0, Math.min(1, progress01)));
  }

  /** Showcase: включить/выключить внутренний scroll input. */
  setScrollInputEnabled(enabled: boolean): void {
    this._scroll.setEnabled(enabled);
  }

  private _getGameplayCamera(): THREE.Camera {
    return CITY_CAMERA.gameplay.usePerspective ? this._gameCamera : this._gameOrthoCamera;
  }

  /**
   * Простой спавн-пикер: если центр карты внутри дома, ищем ближайшую свободную точку по спирали.
   * Без физики — только AABB по buildings index.
   */
  private _pickSpawnPosition(preferred: THREE.Vector3): THREE.Vector3 {
    const isFree = (p: THREE.Vector3) => {
      for (const b of this._world.buildingsIndex.buildings) {
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
}

// NOTE: `_timeScaleFor` moved to `BikerAnimationController`.
