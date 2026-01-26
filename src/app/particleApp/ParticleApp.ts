import * as THREE from "three";
import { CONFIG, type Mode } from "../../config";
import { assert } from "../../utils/assert";
import type { Overlay } from "../../ui/overlay";
import { createGasPoints, type GasPoints } from "../../particles/gasPoints";
import { createBezierLine, type BezierControlPoints } from "../../scene/bezier";
import { computePixelsPerWorld, computeViewBounds } from "./viewMetrics";
import { HudController } from "./HudController";
import { PointerTracker } from "./PointerTracker";
import { TrailComposer } from "./TrailComposer";
import { SplineSvgPath } from "./SplineSvgPath";

export class ParticleApp {
  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _clock = new THREE.Clock();
  private _time = 0;

  private _gas: GasPoints;
  private _pathLine: THREE.Line;
  private _trail: TrailComposer;
  private _splineSvg: SplineSvgPath;
  private _pointer = new PointerTracker();
  private _hud = new HudController();

  private _mode: Mode = -1;
  private _texSize = 0;
  private _viewBounds = new THREE.Vector2(4, 4);
  private _basePointSize = 0;

  private _attractorStrength = 0;
  private _bezierActive = 0;

  private _bezier: BezierControlPoints = [
    new THREE.Vector3(-3.2, -1.8, 0),
    new THREE.Vector3(-0.5, 2.6, 0),
    new THREE.Vector3(0.9, -2.8, 0),
    new THREE.Vector3(3.1, 1.7, 0)
  ];

  private _overlay: Overlay;

  constructor(opts: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; overlay: Overlay }) {
    this._overlay = opts.overlay;
    this._renderer = this._createRenderer(opts.canvas, opts.gl);
    this._scene = new THREE.Scene();
    this._camera = this._createCamera();

    this._requireGPUFeatures();

    const { gas, texSize, basePointSize } = this._createGas();
    this._gas = gas;
    this._texSize = texSize;
    this._basePointSize = basePointSize;
    this._scene.add(this._gas.points);

    this._pathLine = createBezierLine({ points: this._bezier, segments: 64 });
    this._scene.add(this._pathLine);

    this._trail = new TrailComposer();
    this._trail.init(this._renderer);

    this._splineSvg = new SplineSvgPath({ samples: 512, fit: 0.9 });
    this._loadSplineSvg();

    this._bindUI();
    this._bindEvents();
    this._onResize();
    this._animate();
  }

  private _createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance"
    });
    renderer.setClearColor(0x070a10, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById("app")?.appendChild(renderer.domElement);
    return renderer;
  }

  private _createCamera() {
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(0, 0, 11);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  private _createGas() {
    const texSize = Math.ceil(Math.sqrt(CONFIG.particles));
    assert(texSize * texSize >= CONFIG.particles, "bad texture size");

    const pixelRatio = this._renderer.getPixelRatio();
    const basePointSize = CONFIG.pointSizeCssPx * pixelRatio;
    const gas = createGasPoints({
      texSize,
      viewBounds: this._viewBounds,
      pointSize: basePointSize,
      pixelsPerWorld: 100,
      speedPxMin: CONFIG.speedPxMin,
      speedPxMax: CONFIG.speedPxMax,
      attractorRadius: CONFIG.captureRadius,
      attractorInfluenceRadius: CONFIG.influenceRadius,
      attractorOmega: CONFIG.orbitOmega
    });

    return { gas, texSize, basePointSize };
  }

  private async _loadSplineSvg() {
    try {
      await this._splineSvg.load("/paths/treble-clef.svg");
      this._splineSvg.applyToWorld({ viewBounds: this._viewBounds, pathLine: this._pathLine, gas: this._gas });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Не удалось загрузить SVG-путь для сплайна:", e);
      this._splineSvg.disable(this._gas);
    }
  }

  private _requireGPUFeatures() {
    assert(this._renderer.capabilities.isWebGL2, "WebGL2 is required");
  }

  private _bindUI() {
    const setMode = (mode: Mode) => {
      if (this._mode === 0 && mode !== 0) this._pointer.forceRelease(this._renderer.domElement);
      this._mode = mode;
      this._hud.setMode(mode);
      (this._pathLine.material as THREE.LineBasicMaterial).opacity = mode === 1 ? 0.55 : 0.22;
      this._updateParticleSize();
    };

    this._hud.bindModeToggle(() => this._mode, setMode);
    setMode(-1);
  }

  private _bindEvents() {
    window.addEventListener("resize", () => this._onResize());

    const canvas = this._renderer.domElement;
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));

    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this._overlay.show(
          "WebGL контекст потерян",
          "Браузер потерял GPU/контекст WebGL. Попробуй перезагрузить страницу или закрыть тяжёлые вкладки."
        );
      },
      { passive: false }
    );
  }

  private _onPointerMove(e: PointerEvent) {
    this._pointer.updateFromEvent(e, this._renderer.domElement, this._camera);
  }

  private _onPointerDown(e: PointerEvent) {
    this._onPointerMove(e);
    if (this._mode !== 0) return;
    this._pointer.capture(e, this._renderer.domElement, this._time);
  }

  private _onPointerUp(e: PointerEvent) {
    this._pointer.release(e, this._renderer.domElement);
  }

  private _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);

    this._updateParticleSize();

    this._viewBounds.copy(computeViewBounds(this._camera));
    (this._gas.uniforms.uBounds.value as THREE.Vector2).copy(this._viewBounds);

    this._splineSvg.applyToWorld({ viewBounds: this._viewBounds, pathLine: this._pathLine, gas: this._gas });
    this._trail.resize(this._renderer);
    this._updatePixelMetrics();
  }

  private _updateParticleSize() {
    const pixelRatio = this._renderer.getPixelRatio();
    this._basePointSize = CONFIG.pointSizeCssPx * pixelRatio;
    (this._gas.uniforms.uPointSize.value as number) = this._basePointSize;
  }

  private _updatePixelMetrics() {
    (this._gas.uniforms.uPixelsPerWorld.value as number) = computePixelsPerWorld(this._renderer, this._viewBounds);
    (this._gas.uniforms.uSpeedPxMin.value as number) = CONFIG.speedPxMin;
    (this._gas.uniforms.uSpeedPxMax.value as number) = CONFIG.speedPxMax;
  }

  private _updateBezierMode(dt: number) {
    const target = this._mode === 1 ? 1 : 0;
    const k = 1.0 - Math.exp(-dt / 0.12);
    this._bezierActive = THREE.MathUtils.lerp(this._bezierActive, target, k);

    (this._gas.uniforms.uBezierActive.value as number) = this._bezierActive;
    (this._gas.uniforms.uBezierJitterRadius.value as number) = CONFIG.bezierJitterRadius;
    (this._gas.uniforms.uBezierTimeScale.value as number) = CONFIG.bezierTimeScale;
    (this._gas.uniforms.uBezierPhaseOffset.value as number) = CONFIG.bezierPhaseOffset;

    (this._gas.uniforms.uBezierP0.value as THREE.Vector2).set(this._bezier[0].x, this._bezier[0].y);
    (this._gas.uniforms.uBezierP1.value as THREE.Vector2).set(this._bezier[1].x, this._bezier[1].y);
    (this._gas.uniforms.uBezierP2.value as THREE.Vector2).set(this._bezier[2].x, this._bezier[2].y);
    (this._gas.uniforms.uBezierP3.value as THREE.Vector2).set(this._bezier[3].x, this._bezier[3].y);
  }

  private _updateAttractorMode(dt: number) {
    const modeOn = this._mode === 0;
    const held = modeOn && this._pointer.isCaptured;
    const targetStrength = held ? CONFIG.orbitStrength : 0;
    const k = 1.0 - Math.exp(-dt / 0.08);
    this._attractorStrength = THREE.MathUtils.lerp(this._attractorStrength, targetStrength, k);

    (this._gas.uniforms.uAttractorActive.value as number) = modeOn ? 1 : 0;
    (this._gas.uniforms.uAttractorStrength.value as number) = this._attractorStrength;
    (this._gas.uniforms.uAttractorStartTime.value as number) = this._pointer.startTime;
    (this._gas.uniforms.uAttractorPos.value as THREE.Vector2).set(this._pointer.mouseWorld.x, this._pointer.mouseWorld.y);
    return held;
  }

  private _updateHud(attractorHeld: boolean) {
    const modeText =
      this._mode === -1
        ? "свободный газ"
        : this._mode === 0
          ? `аттрактор (зажми и води)${attractorHeld ? " • активен" : ""}`
          : "сплайн";

    this._hud.setStatus(
      `частиц: ${CONFIG.particles} (tex ${this._texSize}×${this._texSize}) • режим: ${modeText}` +
        ` • область: ${(this._viewBounds.x * 2).toFixed(1)}×${(this._viewBounds.y * 2).toFixed(1)}`
    );
  }

  private _animate = () => {
    const dt = Math.max(0, this._clock.getDelta());
    this._time += dt;
    this._gas.uniforms.uTime.value = this._time;

    this._updateBezierMode(dt);
    const attractorHeld = this._updateAttractorMode(dt);
    this._updateHud(attractorHeld);

    const decay = Math.exp((-dt * Math.LN2) / Math.max(1e-4, CONFIG.trailHalfLife));
    this._trail.renderFrame({
      renderer: this._renderer,
      scene: this._scene,
      camera: this._camera,
      pathLine: this._pathLine,
      setGasVisual: ({ pointSize, alphaMul }) => {
        (this._gas.uniforms.uPointSize.value as number) = pointSize;
        (this._gas.uniforms.uAlphaMul.value as number) = alphaMul;
      },
      basePointSize: this._basePointSize,
      trailPointSizeMul: CONFIG.trailPointSizeMul,
      trailStampAlpha: CONFIG.trailStampAlpha,
      decay
    });

    requestAnimationFrame(this._animate);
  };
}


