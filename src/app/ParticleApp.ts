import * as THREE from "three";
import { CONFIG, type Mode } from "../config";
import { assert } from "../utils/assert";
import type { Overlay } from "../ui/overlay";
import { createGasPoints, type GasPoints } from "../particles/gasPoints";
import { createBezierLine, type BezierControlPoints } from "../scene/bezier";

export class ParticleApp {
  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _clock = new THREE.Clock();
  private _time = 0;

  private _gas: GasPoints;
  private _pathLine: THREE.Line;

  private _mode: Mode = -1;
  private _mouseWorld = new THREE.Vector3(0, 0, 0);
  private _mouseNDC = new THREE.Vector2(0, 0);
  private _raycaster = new THREE.Raycaster();
  private _planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private _tmpIntersect = new THREE.Vector3();

  private _attractorPointerId: number | null = null;
  private _attractorStartTime = 0;
  private _attractorStrength = 0;

  private _overlay: Overlay;
  private _hudStatus = document.getElementById("hud-status");

  private _bezier: BezierControlPoints = [
    new THREE.Vector3(-3.2, -1.8, 0),
    new THREE.Vector3(-0.5, 2.6, 0),
    new THREE.Vector3(0.9, -2.8, 0),
    new THREE.Vector3(3.1, 1.7, 0)
  ];

  private _texSize = 0;
  private _viewBounds = new THREE.Vector2(4, 4); // halfWidth, halfHeight in world units @ z=0

  constructor(opts: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; overlay: Overlay }) {
    this._overlay = opts.overlay;
    this._renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      context: opts.gl,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance"
    });
    this._renderer.setClearColor(0x070a10, 1);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById("app")?.appendChild(this._renderer.domElement);

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
    this._camera.position.set(0, 0, 11);
    this._camera.lookAt(0, 0, 0);

    this._requireGPUFeatures();

    const texSize = Math.ceil(Math.sqrt(CONFIG.particles));
    assert(texSize * texSize >= CONFIG.particles, "bad texture size");
    this._texSize = texSize;

    const pointSize = 4.0 * (window.devicePixelRatio || 1);
    this._gas = createGasPoints({
      texSize,
      viewBounds: this._viewBounds,
      pointSize,
      attractorRadius: CONFIG.captureRadius,
      attractorInfluenceRadius: CONFIG.influenceRadius,
      attractorOmega: CONFIG.orbitOmega
    });
    this._scene.add(this._gas.points);

    this._pathLine = createBezierLine({ points: this._bezier, segments: 64 });
    this._scene.add(this._pathLine);

    this._bindUI();
    this._bindEvents();
    this._onResize();
    this._animate();
  }

  private _requireGPUFeatures() {
    assert(this._renderer.capabilities.isWebGL2, "WebGL2 is required");
  }

  private _bindUI() {
    const btn0 = document.getElementById("btn-mode-0") as HTMLButtonElement | null;
    const btn1 = document.getElementById("btn-mode-1") as HTMLButtonElement | null;
    assert(btn0 && btn1, "mode buttons not found");

    const setMode = (mode: Mode) => {
      this._mode = mode;
      btn0.classList.toggle("btn--active", mode === 0);
      btn1.classList.toggle("btn--active", mode === 1);

      // Чуть подсветим сплайн в соответствующем режиме
      (this._pathLine.material as THREE.LineBasicMaterial).opacity = mode === 1 ? 0.55 : 0.22;
    };

    btn0.addEventListener("click", () => setMode(this._mode === 0 ? -1 : 0));
    btn1.addEventListener("click", () => setMode(this._mode === 1 ? -1 : 1));

    // Изначально никакой режим не активен
    setMode(-1);
  }

  private _bindEvents() {
    window.addEventListener("resize", () => this._onResize());

    const canvas = this._renderer.domElement;
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));

    this._renderer.domElement.addEventListener(
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

  private _getPointerNDC(e: PointerEvent) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    return { x, y };
  }

  private _onPointerMove(e: PointerEvent) {
    const { x, y } = this._getPointerNDC(e);
    this._mouseNDC.set(x, y);

    this._raycaster.setFromCamera(this._mouseNDC, this._camera);
    const hit = this._raycaster.ray.intersectPlane(this._planeZ0, this._tmpIntersect);
    if (hit) {
      this._mouseWorld.copy(hit);
    }
  }

  private _onPointerDown(e: PointerEvent) {
    this._onPointerMove(e);
    if (this._mode !== 0) return;
    if (this._attractorPointerId !== null) return;

    this._attractorPointerId = e.pointerId;
    this._attractorStartTime = this._time;
    this._renderer.domElement.setPointerCapture(e.pointerId);
  }

  private _onPointerUp(e: PointerEvent) {
    if (this._attractorPointerId !== e.pointerId) return;
    this._attractorPointerId = null;
    try {
      this._renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  private _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);

    (this._gas.uniforms.uPointSize.value as number) = 4.0 * (window.devicePixelRatio || 1);

    // bounds of z=0 plane visible by the perspective camera
    const dist = Math.abs(this._camera.position.z);
    const halfH = Math.tan(THREE.MathUtils.degToRad(this._camera.fov * 0.5)) * dist;
    const halfW = halfH * this._camera.aspect;
    this._viewBounds.set(halfW, halfH);
    (this._gas.uniforms.uBounds.value as THREE.Vector2).copy(this._viewBounds);
  }

  private _animate = () => {
    const dt = Math.max(0, this._clock.getDelta());
    this._time += dt;
    const elapsed = this._time;

    this._gas.uniforms.uTime.value = elapsed;

    // Attractor uniforms (active while pointer is held down in mode 0)
    const attractorActive = this._mode === 0 && this._attractorPointerId !== null;
    const targetStrength = attractorActive ? CONFIG.orbitStrength : 0;
    const k = 1.0 - Math.exp(-dt / 0.08); // ~80ms time constant
    this._attractorStrength = THREE.MathUtils.lerp(this._attractorStrength, targetStrength, k);

    (this._gas.uniforms.uAttractorActive.value as number) = attractorActive ? 1 : 0;
    (this._gas.uniforms.uAttractorStrength.value as number) = this._attractorStrength;
    (this._gas.uniforms.uAttractorStartTime.value as number) = this._attractorStartTime;
    (this._gas.uniforms.uAttractorPos.value as THREE.Vector2).set(this._mouseWorld.x, this._mouseWorld.y);

    if (this._hudStatus) {
      const modeText =
        this._mode === -1
          ? "свободный газ"
          : this._mode === 0
            ? `аттрактор (зажми и води)${attractorActive ? " • активен" : ""}`
            : "сплайн";
      this._hudStatus.textContent =
        `частиц: ${CONFIG.particles} (tex ${this._texSize}×${this._texSize}) • режим: ${modeText}` +
        ` • область: ${(this._viewBounds.x * 2).toFixed(1)}×${(this._viewBounds.y * 2).toFixed(1)}`;
    }

    this._renderer.render(this._scene, this._camera);
    requestAnimationFrame(this._animate);
  };
}


