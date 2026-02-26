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
import { CityGirlsSystem } from "./girls/CityGirlsSystem";
import { BikerLoader } from "./biker/BikerLoader";
import { BikerAnimationController } from "./biker/BikerAnimationController";
import { CityWorldController } from "./cityWorld/CityWorldController";
import { CityGameLogic } from "./gameLogic/CityGameLogic";
import { CityGameplayCamera } from "./camera/CityGameplayCamera";
import { applyCityCameraExtraTransform } from "./camera/cityCameraExtraTransform";

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
  private _focusCamera: THREE.PerspectiveCamera;
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

  // World data
  private _mapBox = new THREE.Box3();
  private _mapCenter = new THREE.Vector3();
  private _startWorldPos = new THREE.Vector3();
  private _spawnClearanceRadius = 6.5;

  // Gameplay state
  private _cruiseSpeed = CITY_GAMEPLAY.bikerMotion.speed.cruiseSpeed;

  // NOTE: город/дома/окклюзия/коллизии — в `CityWorldController`.

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

    this._girlsSystem = new CityGirlsSystem({ scene: this._scene });

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

    // Временная камера для плавного перехода overview -> gameplay без "скачка" при смене типа камеры.
    this._focusCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this._focusCamera.position.set(0, 12, 18);
    this._focusCamera.lookAt(0, 0, 0);

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

    this._girlsSystem.dispose();

    this._bikerAnim = null;
    this._gameLogic = null;
    this._bikerRoot?.removeFromParent();
    this._cityRoot?.removeFromParent();
    this._cityScene = null;

    this._world.dispose();

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

    // NPC girls (явная инициализация).
    await this._girlsSystem.init({ cityRoot: this._cityRoot });

    // “Пол главнее”: убираем z-fighting/конфликты при пересечениях со сплющенными домами.
    this._applyFloorPriority(this._cityRoot);

    // Индекс домов (для видимости/коллизий/окклюзии).
    this._world.buildFromCityRoot(this._cityRoot);
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

    if (this._mode === "overview") {
      this._updateOverview(dtSec);
    } else if (this._mode === "focusStart") {
      this._updateFocus(dtSec);
    } else if (this._mode === "playing") {
      this._updatePlaying(dtSec);
    } else if (this._mode === "crashed") {
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

    applyCityCameraExtraTransform(cam, "overview");
    this._activeCamera = cam;

    // Режим города: игнорируем левую/правую границы и следим только за верхом/низом.
    // Хотим “пару пикселей” отступа от края -> переводим px -> NDC.
    const edgePx = 3;
    const edgeInsetNdc = (2 * edgePx) / Math.max(1, h);
    this._world.updateOverviewVisibility(cam, edgeInsetNdc, _dtSec);

    // Start кнопка — в центре карты.
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

  private _beginFocusToStart(): void {
    if (!this._cityRoot) return;
    this._girlsSystem.resetToHome("focusStart");
    this._mode = "focusStart";
    this._scroll.setEnabled(false);
    this._turn.setEnabled(false);
    this._startBtn.setVisible(false);
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
  }

  private _updateFocus(dtSec: number): void {
    this._focusT += dtSec;
    const t01 = Math.min(1, this._focusT / Math.max(0.001, CITY_CAMERA.focusStart.travelSec));
    const k = t01 * t01 * (3 - 2 * t01); // smoothstep
    this._tmpFocusPos.lerpVectors(this._focusFrom, this._focusTo, k);

    // Плавно интерполируем pos + quat + fov на transition-камере.
    // Это убирает скачок при первом кадре после клика (смена типа камеры) и скачок в конце перехода.
    this._focusCamera.position.copy(this._tmpFocusPos);
    this._focusCamera.quaternion.slerpQuaternions(this._focusFromQuat, this._focusToQuat, k);
    this._focusCamera.fov = THREE.MathUtils.lerp(this._focusFromFov, this._focusToFov, k);
    this._focusCamera.updateProjectionMatrix();
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
  }

  private _updatePlaying(dtSec: number): void {
    if (!this._bikerRoot) return;
    // Движение героя + реакция девочек (чистая оркестрация — в отдельном файле).
    this._gameLogic?.updatePlaying({
      dtSec,
      speedIdleSec: CITY_GAMEPLAY.bikerMotion.speed.idleSec,
      speedRampSec: CITY_GAMEPLAY.bikerMotion.speed.rampSec,
      cruiseSpeed: this._cruiseSpeed,
      turnRadiusStart: CITY_GAMEPLAY.bikerMotion.turn.radiusStart,
      turnRadiusMin: CITY_GAMEPLAY.bikerMotion.turn.radiusMin,
      turnRadiusEaseSec: CITY_GAMEPLAY.bikerMotion.turn.radiusEaseSec,
      pedalsMaxPlaybackSpeed: CITY_ANIMATION.biker.pedals.maxPlaybackSpeed,
      collisionActivation: CITY_GAMEPLAY.collisions.activation
    });

    // Коллизии: после движения проверяем hit по tip.
    if (this._world.checkCollision(this._bikerRoot)) {
      this._onCrash();
      return;
    }

    const cam = this._getGameplayCamera();
    this._gameplayCamera.applyFixedView(cam, this._bikerRoot.position, CITY_CAMERA.gameplay.view.followLerp);
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

  // NOTE: Biker animation logic extracted to `src/projects/city/biker/BikerAnimationController.ts`,
  // а мир/дома/окклюзия/коллизии — в `src/projects/city/cityWorld/CityWorldController.ts`.

  private _onCrash(): void {
    if (this._mode === "crashed") return;
    this._mode = "crashed";
    this._girlsSystem.resetToHome("crash");
    this._scroll.setEnabled(false);
    this._turn.setEnabled(false);
    this._crashOverlay.show();

    if (this._resetTimer !== null) window.clearTimeout(this._resetTimer);
    this._resetTimer = window.setTimeout(() => this._resetToOverview(), CITY_GAMEPLAY.crash.resetDelaySec * 1000);
  }

  private _resetToOverview(): void {
    if (!this._bikerRoot) return;
    this._mode = "overview";
    this._girlsSystem.resetToHome("resetToOverview");
    this._scroll.setEnabled(true);
    this._turn.setEnabled(false);
    this._crashOverlay.hide();
    this._startBtn.setVisible(true);

    this._bikerRoot.visible = false;
    this._bikerRoot.position.copy(this._startWorldPos);
    this._bikerRoot.rotation.set(0, 0, 0);
    this._bikerAnim?.reset();

    // Сбрасываем активные коллайдеры.
    this._world.resetCollisionState(this._bikerRoot);
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
