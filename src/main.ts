import "./styles.css";
import * as THREE from "three";

type Mode = -1 | 0 | 1;

const CONFIG = {
  particles: 1024, // 32x32 — >= 1000
  influenceRadius: 1.5,
  captureRadius: 1.0
} as const;

function _assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function _createOverlay() {
  const overlay = document.getElementById("overlay");
  _assert(overlay, "overlay element not found");

  return {
    show(title: string, text: string) {
      overlay.classList.remove("overlay--hidden");
      overlay.innerHTML = `
        <div class="overlay__card">
          <h2 class="overlay__title">${title}</h2>
          <p class="overlay__text"></p>
        </div>
      `;
      const p = overlay.querySelector(".overlay__text");
      if (p) p.textContent = text;
    },
    hide() {
      overlay.classList.add("overlay--hidden");
      overlay.innerHTML = "";
    }
  };
}

function _tryCreateWebGL2Context() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false
  });
  return { canvas, gl };
}

class ParticleApp {
  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _clock = new THREE.Clock();

  private _points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private _pathLine: THREE.Line;

  private _mode: Mode = -1;
  private _mouseWorld = new THREE.Vector3(0, 0, 0);
  private _mouseNDC = new THREE.Vector2(0, 0);
  private _raycaster = new THREE.Raycaster();
  private _planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private _tmpIntersect = new THREE.Vector3();

  private _overlay: ReturnType<typeof _createOverlay>;
  private _hudStatus = document.getElementById("hud-status");

  private _bezierP0 = new THREE.Vector3(-3.2, -1.8, 0);
  private _bezierP1 = new THREE.Vector3(-0.5, 2.6, 0);
  private _bezierP2 = new THREE.Vector3(0.9, -2.8, 0);
  private _bezierP3 = new THREE.Vector3(3.1, 1.7, 0);
  private _texSize = 0;
  private _viewBounds = new THREE.Vector2(4, 4); // halfWidth, halfHeight in world units @ z=0

  constructor(opts: { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; overlay: ReturnType<typeof _createOverlay> }) {
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
    _assert(texSize * texSize >= CONFIG.particles, "bad texture size");
    this._texSize = texSize;

    this._points = this._createPoints(texSize);
    this._scene.add(this._points);

    this._pathLine = this._createBezierLine(64);
    this._scene.add(this._pathLine);

    this._bindUI();
    this._bindEvents();
    this._onResize();
    this._animate();
  }

  private _requireGPUFeatures() {
    _assert(this._renderer.capabilities.isWebGL2, "WebGL2 is required");
  }

  private _createPoints(texSize: number) {
    const geom = new THREE.BufferGeometry();
    const count = texSize * texSize;

    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    let p = 0;
    let u = 0;
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        positions[p++] = 0;
        positions[p++] = 0;
        positions[p++] = 0;

        uvs[u++] = (x + 0.5) / texSize;
        uvs[u++] = (y + 0.5) / texSize;
      }
    }

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBounds: { value: this._viewBounds },
        uPointSize: { value: 4.0 * (window.devicePixelRatio || 1) }
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec2 uBounds;
        uniform float uPointSize;
        out float vSpeed;

        const float TAU = 6.28318530718;

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        vec2 mirrorRepeat2(vec2 p, vec2 b) {
          // p in world coords; return inside [-b, b] with mirrored tiling per-axis
          vec2 x = p + b;
          x = mod(x, 2.0 * b);
          x = b - abs(x - b);
          return x - b;
        }

        void main() {
          // Procedural "free gas": deterministic per-particle seed from uv
          float r0 = hash12(uv * 97.1);
          float r1 = hash12(uv * 151.7 + 0.31);
          float r2 = hash12(uv * 211.3 + 0.73);

          vec2 init = (vec2(r0, r1) * 2.0 - 1.0) * (uBounds * 0.98);
          float speed = 0.45 + 1.05 * r2;
          float ang = TAU * hash12(uv * 331.9 + 0.17);
          vec2 vel = speed * vec2(cos(ang), sin(ang));

          // Add small time-varying drift field to feel "gas-like"
          vec2 drift = 0.65 * vec2(
            sin((init.y + uTime * 0.7) * 0.9 + 6.0 * r1),
            cos((init.x + uTime * 0.6) * 0.8 + 6.0 * r0)
          );

          vec2 pos = init + vel * uTime + drift;
          pos = mirrorRepeat2(pos, uBounds);

          vSpeed = speed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(pos, 0.0), 1.0);
          gl_PointSize = uPointSize;
        }
      `,
      fragmentShader: /* glsl */ `
        in float vSpeed;
        out vec4 outColor;

        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d = dot(p, p);
          float alpha = smoothstep(1.0, 0.55, d);
          float sp = clamp(vSpeed / 3.0, 0.0, 1.0);
          vec3 colA = vec3(0.43, 0.91, 1.0);
          vec3 colB = vec3(0.66, 0.55, 1.0);
          vec3 col = mix(colA, colB, sp);
          outColor = vec4(col, alpha);
        }
      `
    });

    return new THREE.Points(geom, mat);
  }

  private _createBezierLine(segments: number) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      pts.push(this._bezierPoint(t));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0x6ee7ff,
      transparent: true,
      opacity: 0.35
    });
    const line = new THREE.Line(geom, mat);
    return line;
  }

  private _bezierPoint(t: number) {
    const u = 1 - t;
    const p0 = this._bezierP0.clone().multiplyScalar(u * u * u);
    const p1 = this._bezierP1.clone().multiplyScalar(3 * u * u * t);
    const p2 = this._bezierP2.clone().multiplyScalar(3 * u * t * t);
    const p3 = this._bezierP3.clone().multiplyScalar(t * t * t);
    return p0.add(p1).add(p2).add(p3);
  }

  private _bindUI() {
    const btn0 = document.getElementById("btn-mode-0") as HTMLButtonElement | null;
    const btn1 = document.getElementById("btn-mode-1") as HTMLButtonElement | null;
    _assert(btn0 && btn1, "mode buttons not found");

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
    window.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerdown", (e) => this._onPointerMove(e));

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

  private _onPointerMove(e: PointerEvent) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    this._mouseNDC.set(x, y);

    this._raycaster.setFromCamera(this._mouseNDC, this._camera);
    const hit = this._raycaster.ray.intersectPlane(this._planeZ0, this._tmpIntersect);
    if (hit) {
      this._mouseWorld.copy(hit);
    }
  }

  private _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    (this._points.material.uniforms.uPointSize.value as number) = 4.0 * (window.devicePixelRatio || 1);

    // bounds of z=0 plane visible by the perspective camera
    const dist = Math.abs(this._camera.position.z);
    const halfH = Math.tan(THREE.MathUtils.degToRad(this._camera.fov * 0.5)) * dist;
    const halfW = halfH * this._camera.aspect;
    this._viewBounds.set(halfW, halfH);
    (this._points.material.uniforms.uBounds.value as THREE.Vector2).copy(this._viewBounds);
  }

  private _animate = () => {
    const elapsed = this._clock.getElapsedTime();
    this._clock.getDelta();
    this._points.material.uniforms.uTime.value = elapsed;

    if (this._hudStatus) {
      const modeText = this._mode === -1 ? "свободный газ" : this._mode === 0 ? "мышь‑вихрь" : "сплайн";
      this._hudStatus.textContent =
        `частиц: ${CONFIG.particles} (tex ${this._texSize}×${this._texSize}) • режим: ${modeText}` +
        ` • область: ${(this._viewBounds.x * 2).toFixed(1)}×${(this._viewBounds.y * 2).toFixed(1)}`;
    }

    this._renderer.render(this._scene, this._camera);
    requestAnimationFrame(this._animate);
  };
}

// Bootstrap
const overlay = _createOverlay();
try {
  const { canvas, gl } = _tryCreateWebGL2Context();
  if (!gl) {
    overlay.show(
      "WebGL отключён или недоступен",
      [
        "Не удалось создать WebGL2 контекст (браузер сообщает Disabled/Sandboxed).",
        "",
        "Что попробовать:",
        "- Включить аппаратное ускорение в браузере (Chrome: Настройки → Система → «Использовать аппаратное ускорение»).",
        "- Открыть chrome://gpu и убедиться, что WebGL2 включён.",
        "- Если запускаешь в sandbox/виртуалке/remote desktop — попробуй обычный Chrome/Firefox на хосте.",
        "",
        "Приложение остановлено: без WebGL2 его запустить нельзя."
      ].join("\n")
    );
  } else {
    overlay.hide();
    new ParticleApp({ canvas, gl, overlay });
  }
} catch (e) {
  overlay.show("Ошибка запуска", e instanceof Error ? e.message : String(e));
  // eslint-disable-next-line no-console
  console.error(e);
}


