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
import { PaintLayer } from "./PaintLayer";
import { PaintInput } from "./PaintInput";
import { TraceSplineGame } from "./TraceSplineGame";

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
  private _traceGame: TraceSplineGame;
  private _paint: PaintLayer;
  private _paintInput = new PaintInput();
  private _pointer = new PointerTracker();
  private _hud = new HudController();

  private _mode: Mode = -1;
  private _texSize = 0;
  private _viewBounds = new THREE.Vector2(4, 4);
  private _basePointSize = 0;
  private _pixelsPerWorld = 100;
  private _paintFadeActive = false;
  private _paintFadeStart = 0;
  private _paintFadeDuration = 0.65;
  private _traceDanger = 0;

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
    this._traceGame = new TraceSplineGame({ scene: this._scene });
    this._traceGame.setPixelsPerWorld(this._pixelsPerWorld);
    this._loadSplineSvg();

    this._paint = new PaintLayer();
    this._paint.init(this._renderer);

    this._bindUI();
    this._bindEvents();
    this._onResize();
    this._animate();
  }

  private _createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): THREE.WebGLRenderer {
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

  private _createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(0, 0, 11);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  private _createGas(): { gas: GasPoints; texSize: number; basePointSize: number } {
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

  private async _loadSplineSvg(): Promise<void> {
    try {
      await this._splineSvg.load("/paths/treble-clef.svg");
      this._splineSvg.applyToWorld({ viewBounds: this._viewBounds, pathLine: this._pathLine, gas: this._gas });
      this._traceGame.setSplinePointsWorld(this._splineSvg.worldPoints);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Не удалось загрузить SVG-путь для сплайна:", e);
      this._splineSvg.disable(this._gas);
      this._traceGame.setSplinePointsWorld(null);
    }
  }

  private _requireGPUFeatures(): void {
    assert(this._renderer.capabilities.isWebGL2, "WebGL2 is required");
  }

  private _bindUI(): void {
    const setMode = (mode: Mode) => {
      if (this._mode === 0 && mode !== 0) this._pointer.forceRelease(this._renderer.domElement);
      if (this._mode === 2 && mode !== 2) this._paintInput.forceRelease(this._renderer.domElement);
      if (this._mode === 3 && mode !== 3) {
        this._traceGame.forceRelease(this._renderer.domElement, "выход из режима");
        this._pointer.forceRelease(this._renderer.domElement);
        this._paintInput.forceRelease(this._renderer.domElement);
        this._paint.clear(this._renderer);
        this._paintFadeActive = false;
        this._paintFadeStart = 0;
        this._traceDanger = 0;
        (this._gas.uniforms.uTraceDanger.value as number) = 0;
      }
      this._mode = mode;
      this._hud.setMode(mode);
      this._traceGame.setEnabled(mode === 3);
      (this._pathLine.material as THREE.LineBasicMaterial).opacity = mode === 1 || mode === 3 ? 0.55 : 0.22;
      this._updateParticleSize();
    };

    this._hud.bindModeToggle(() => this._mode, setMode);
    setMode(-1);
  }

  private _bindEvents(): void {
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

  private _onPointerMove(e: PointerEvent): void {
    this._pointer.updateFromEvent(e, this._renderer.domElement, this._camera);
    if (this._mode === 2) this._paintInput.onMove(e, this._renderer.domElement);
    if (this._mode === 3) {
      this._traceGame.onPointerMove(e, this._renderer.domElement, this._pointer.mouseWorld);
      if (this._traceGame.isInPath) this._paintInput.onMove(e, this._renderer.domElement);
      const end = this._traceGame.consumeEndEvent();
      if (end) {
        this._pointer.forceRelease(this._renderer.domElement);
        this._paintInput.forceRelease(this._renderer.domElement);
        this._startPaintFadeOut();
      }
    }
  }

  private _onPointerDown(e: PointerEvent): void {
    this._onPointerMove(e);
    if (this._mode === 0) this._pointer.capture(e, this._renderer.domElement, this._time);
    if (this._mode === 2) this._paintInput.capture(e, this._renderer.domElement);
    if (this._mode === 3) {
      const started = this._traceGame.onPointerDown(e, this._renderer.domElement, this._pointer.mouseWorld);
      if (started) {
        // Внутри мини‑игры запускаем аттрактор + рисование.
        this._pointer.capture(e, this._renderer.domElement, this._time);
        this._paintInput.capture(e, this._renderer.domElement);
      }
    }
  }

  private _onPointerUp(e: PointerEvent): void {
    this._pointer.release(e, this._renderer.domElement);
    this._paintInput.release(e, this._renderer.domElement);
    this._traceGame.onPointerUp(e, this._renderer.domElement);
    const end = this._traceGame.consumeEndEvent();
    if (end) this._startPaintFadeOut();
  }

  private _onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);

    this._updateParticleSize();

    this._viewBounds.copy(computeViewBounds(this._camera));
    (this._gas.uniforms.uBounds.value as THREE.Vector2).copy(this._viewBounds);

    this._splineSvg.applyToWorld({ viewBounds: this._viewBounds, pathLine: this._pathLine, gas: this._gas });
    this._traceGame.setSplinePointsWorld(this._splineSvg.worldPoints);
    this._trail.resize(this._renderer);
    this._paint.resize(this._renderer);
    this._updatePixelMetrics();

    const size = this._paint.getSize();
    const pr = this._renderer.getPixelRatio();
    const spacingPx = CONFIG.paintSpacingCssPx * pr;
    this._paintInput.setSpacingUv(spacingPx / Math.max(1, Math.min(size.w, size.h)));
  }

  private _updateParticleSize(): void {
    const pixelRatio = this._renderer.getPixelRatio();
    this._basePointSize = CONFIG.pointSizeCssPx * pixelRatio;
    (this._gas.uniforms.uPointSize.value as number) = this._basePointSize;
  }

  private _updatePixelMetrics(): void {
    this._pixelsPerWorld = computePixelsPerWorld(this._renderer, this._viewBounds);
    (this._gas.uniforms.uPixelsPerWorld.value as number) = this._pixelsPerWorld;
    (this._gas.uniforms.uSpeedPxMin.value as number) = CONFIG.speedPxMin;
    (this._gas.uniforms.uSpeedPxMax.value as number) = CONFIG.speedPxMax;
    this._traceGame.setPixelsPerWorld(this._pixelsPerWorld);
  }

  private _updateBezierMode(dt: number): void {
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

  private _updateAttractorMode(dt: number): boolean {
    const modeOn = this._mode === 0 || (this._mode === 3 && this._traceGame.isInPath);
    const held = modeOn && this._pointer.isCaptured;
    const danger = this._mode === 3 ? THREE.MathUtils.clamp(this._traceDanger, 0.0, 1.0) : 0.0;
    const strengthMax = THREE.MathUtils.lerp(CONFIG.orbitStrength, 1.0, danger * danger);
    const targetStrength = held ? strengthMax : 0;
    const k = 1.0 - Math.exp(-dt / 0.08);
    this._attractorStrength = THREE.MathUtils.lerp(this._attractorStrength, targetStrength, k);

    const active = modeOn || this._attractorStrength > 1e-3;
    (this._gas.uniforms.uAttractorActive.value as number) = active ? 1 : 0;
    (this._gas.uniforms.uAttractorStrength.value as number) = this._attractorStrength;
    (this._gas.uniforms.uAttractorStartTime.value as number) = this._pointer.startTime;
    (this._gas.uniforms.uAttractorPos.value as THREE.Vector2).set(this._pointer.mouseWorld.x, this._pointer.mouseWorld.y);
    return held;
  }

  private _startPaintFadeOut(): void {
    // Плавно “гасим” рисунок, затем чистим в ноль.
    this._paintFadeActive = true;
    this._paintFadeStart = this._time;
  }

  private _updateHud(attractorHeld: boolean): void {
    const modeText =
      this._mode === -1
        ? "свободный газ"
        : this._mode === 0
          ? `аттрактор (зажми и води)${attractorHeld ? " • активен" : ""}`
          : this._mode === 1
            ? "сплайн"
            : this._mode === 2
              ? "рисование"
              : "прохождение сплайна";

    const base =
      `частиц: ${CONFIG.particles} (tex ${this._texSize}×${this._texSize}) • режим: ${modeText}` +
      ` • область: ${(this._viewBounds.x * 2).toFixed(1)}×${(this._viewBounds.y * 2).toFixed(1)}`;
    const extra = this._mode === 3 ? `\n\n${this._traceGame.getDebugText()}` : "";
    this._hud.setStatus(base + extra);
  }

  private _animate = (): void => {
    const dt = Math.max(0, this._clock.getDelta());
    this._time += dt;
    this._gas.uniforms.uTime.value = this._time;

    this._updateBezierMode(dt);
    const attractorHeld = this._updateAttractorMode(dt);
    this._updateHud(attractorHeld);

    // Mode 3: danger → GPU (плавно затухает обратно в 0 после проигрыша)
    const dangerTarget = this._mode === 3 ? this._traceGame.getDanger01() : 0;
    const kDanger = 1.0 - Math.exp(-dt / 0.10);
    this._traceDanger = THREE.MathUtils.lerp(this._traceDanger, dangerTarget, kDanger);
    (this._gas.uniforms.uTraceDanger.value as number) = this._traceDanger;

    const pr = this._renderer.getPixelRatio();
    const radiusPx = CONFIG.paintRadiusCssPx * pr;
    const paintSize = this._paint.getSize();
    const radiusUv = radiusPx / Math.max(1, Math.min(paintSize.w, paintSize.h));
    const stamps = this._paintInput.consumeStamps().map((s) => ({
      uv: s.uv,
      radiusUv,
      strength: CONFIG.paintStampStrength
    }));

    const paintDecay = this._paintFadeActive
      ? Math.exp((-dt * Math.LN2) / Math.max(1e-4, CONFIG.paintHalfLife))
      : 1.0;
    this._paint.step({
      renderer: this._renderer,
      time: this._time,
      stamps,
      decay: paintDecay,
      noiseScale: CONFIG.paintNoiseScale,
      edgeAmp: CONFIG.paintEdgeAmp,
      edgeSoftness: CONFIG.paintEdgeSoftness,
      glowIntensity: CONFIG.paintGlowIntensity,
      pulseSpeed: CONFIG.paintPulseSpeed
    });
    const paintFadeT = this._paintFadeActive
      ? THREE.MathUtils.clamp((this._time - this._paintFadeStart) / Math.max(1e-6, this._paintFadeDuration), 0, 1)
      : 0;
    if (this._paintFadeActive && paintFadeT >= 1.0) {
      this._paint.clear(this._renderer);
      this._paintFadeActive = false;
      this._paintFadeStart = 0;
    }

    // Screen composition order:
    // 1) clear, 2) paint (under), 3) trails + heads + line (over)
    this._renderer.setRenderTarget(null);
    this._renderer.autoClear = true;
    this._renderer.clear();
    this._renderer.autoClear = false;
    // Нелинейное (с ускорением): сначала почти не меняется, затем быстро гаснет.
    const paintAlphaMul = this._paintFadeActive ? 1 - paintFadeT * paintFadeT : 1.0;
    this._paint.present(this._renderer, {
      time: this._time,
      noiseScale: CONFIG.paintNoiseScale,
      edgeAmp: CONFIG.paintEdgeAmp,
      edgeSoftness: CONFIG.paintEdgeSoftness,
      glowIntensity: CONFIG.paintGlowIntensity,
      pulseSpeed: CONFIG.paintPulseSpeed,
      warpScale: CONFIG.paintWarpScale,
      warpSpeed: CONFIG.paintWarpSpeed,
      warpAmp: CONFIG.paintWarpAmp,
      contourThreshold: CONFIG.paintContourThreshold,
      contourWidth: CONFIG.paintContourWidth,
      contourNoiseAmp: CONFIG.paintContourNoiseAmp,
      alphaMul: paintAlphaMul
    });

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
      decay,
      presentToScreen: true
    });

    requestAnimationFrame(this._animate);
  };
}


