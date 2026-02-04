import * as THREE from "three";
import type { ColorKey, Trail } from "../runtimeTypes";
import { CONFIG } from "../../../../config";
import type { getDpr as getDprFn } from "../utils";
import maskStampVert from "../../../../shaders/maskStamp.vert.glsl?raw";
import maskStampFrag from "../../../../shaders/maskStamp.frag.glsl?raw";

export type PaintSystemGL = {
  /** Текстура маски (RGB) в формате bits=r+2g+4b. */
  maskTexture: THREE.Texture;
  attachRenderer(renderer: THREE.WebGLRenderer): void;
  resize(w: number, h: number): void;
  clear(): void;
  clearColor(color: ColorKey): void;
  addPoint(color: ColorKey, x: number, y: number): void;
  /**
   * Возвращает bits (0..7) по текущей маске (для drag/hit-test).
   * Важно: должен совпадать с семантикой bitsFromMask в шейдерах пазла.
   */
  maskBitsAt(x: number, y: number, viewW: number, viewH: number): number;
};

const MASK_BRIGHTNESS_THRESHOLD_255 = 12;

const CHANNEL_BY_COLOR: Record<ColorKey, THREE.Vector3> = {
  r: new THREE.Vector3(1, 0, 0),
  g: new THREE.Vector3(0, 1, 0),
  b: new THREE.Vector3(0, 0, 1),
};

type _Stamp = { xPx: number; yPx: number; radiusPx: number };

export function createPaintSystemGL(opts: {
  config: typeof CONFIG;
  getDpr: typeof getDprFn;
  onRedraw?: () => void;
}): PaintSystemGL {
  const { config, getDpr } = opts;

  const trails: Record<ColorKey, Trail> = {
    r: { points: [], lengthPx: 0 },
    g: { points: [], lengthPx: 0 },
    b: { points: [], lengthPx: 0 },
  };

  let _w = 1;
  let _h = 1;

  let _renderer: THREE.WebGLRenderer | null = null;
  let _rt: THREE.WebGLRenderTarget | null = null;

  // Для отрисовки штампов
  const _orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const _scene = new THREE.Scene();
  const _geom = new THREE.PlaneGeometry(2, 2);
  const _stampMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uChannel: { value: new THREE.Vector3(1, 0, 0) },
      uStrength: { value: 1.0 },
      uEdgeSoftness: { value: 0.14 },
    },
    vertexShader: maskStampVert,
    fragmentShader: maskStampFrag,
  });

  // 3 штуки, по цвету — чтобы не менять blending/материал на каждый stamp.
  const _meshByColor: Record<ColorKey, THREE.InstancedMesh> = {
    r: new THREE.InstancedMesh(_geom, _stampMat.clone(), 64),
    g: new THREE.InstancedMesh(_geom, _stampMat.clone(), 64),
    b: new THREE.InstancedMesh(_geom, _stampMat.clone(), 64),
  };
  for (const c of ["r", "g", "b"] as const) {
    const m = _meshByColor[c];
    m.frustumCulled = false;
    m.count = 0;
    (m.material as THREE.RawShaderMaterial).uniforms.uChannel.value = CHANNEL_BY_COLOR[c].clone();
    _scene.add(m);
  }

  // Кэш для maskBitsAt, чтобы pointerdown/hit-test не делал readPixels многократно.
  let _lastBitsCache:
    | { x: number; y: number; viewW: number; viewH: number; bits: number }
    | null = null;

  function _maxTrailLengthPx(): number {
    return config.puzzle.paint.maxTrailLengthCssPx * getDpr();
  }

  function _brushRadiusPx(): number {
    return Math.max(1, config.puzzle.paint.brushSizeCssPx * getDpr()) * 0.5;
  }

  function _ensureRT(): void {
    if (!_renderer) return;
    if (_rt) {
      if (_rt.width !== _w || _rt.height !== _h) {
        _rt.setSize(_w, _h);
      }
      return;
    }
    _rt = new THREE.WebGLRenderTarget(_w, _h, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    _rt.texture.generateMipmaps = false;
  }

  function _computeStamps(points: Array<{ x: number; y: number }>, radiusPx: number): _Stamp[] {
    if (points.length === 0) return [];
    if (points.length === 1) return [{ xPx: points[0].x, yPx: points[0].y, radiusPx }];

    const stamps: _Stamp[] = [];
    // Чем меньше шаг — тем ровнее линия. Берём долю радиуса (в px).
    const stepPx = Math.max(1, radiusPx * 0.65);

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const n = Math.max(1, Math.ceil(dist / stepPx));
      for (let k = 0; k <= n; k++) {
        const t = n === 0 ? 0 : k / n;
        stamps.push({
          xPx: a.x + dx * t,
          yPx: a.y + dy * t,
          radiusPx,
        });
      }
    }
    return stamps;
  }

  function _ensureStampCapacity(color: ColorKey, needed: number): THREE.InstancedMesh {
    const mesh = _meshByColor[color];
    const capacity = mesh.instanceMatrix.count;
    if (capacity >= needed) return mesh;

    const nextCapacity = Math.max(needed, capacity * 2, 64);
    const next = new THREE.InstancedMesh(mesh.geometry, mesh.material, nextCapacity);
    next.frustumCulled = false;
    next.count = 0;

    _scene.remove(mesh);
    _meshByColor[color] = next;
    _scene.add(next);
    return next;
  }

  function _setInstancedStamps(color: ColorKey, stamps: _Stamp[]): void {
    const needed = stamps.length;
    const mesh = _ensureStampCapacity(color, needed);

    const sxBase = 2 / Math.max(1, _w);
    const syBase = 2 / Math.max(1, _h);
    const tmpMat = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    const tmpScale = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();

    for (let i = 0; i < needed; i++) {
      const s = stamps[i];
      const uvx = s.xPx / Math.max(1, _w);
      const uvy = 1.0 - s.yPx / Math.max(1, _h); // y-down (canvas) -> y-up (UV)
      const ndcX = uvx * 2 - 1;
      const ndcY = uvy * 2 - 1;

      const scaleX = s.radiusPx * sxBase;
      const scaleY = s.radiusPx * syBase;

      tmpPos.set(ndcX, ndcY, 0);
      tmpScale.set(scaleX, scaleY, 1);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMat);
    }
    mesh.count = needed;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function _redraw(): void {
    if (!_renderer) return;
    _ensureRT();
    if (!_rt) return;

    // Сцена инстанс-мешей фиксированная, меняем только матрицы.
    const radiusPx = _brushRadiusPx();

    // Собираем штампы по цветам.
    const stampsByColor: Record<ColorKey, _Stamp[]> = {
      r: _computeStamps(trails.r.points, radiusPx),
      g: _computeStamps(trails.g.points, radiusPx),
      b: _computeStamps(trails.b.points, radiusPx),
    };

    for (const c of ["r", "g", "b"] as const) {
      _setInstancedStamps(c, stampsByColor[c]);
    }

    const prevRT = _renderer.getRenderTarget();
    const prevAutoClear = _renderer.autoClear;
    const prevClr = new THREE.Color();
    _renderer.getClearColor(prevClr);
    const prevAlpha = _renderer.getClearAlpha();

    _renderer.setRenderTarget(_rt);
    _renderer.setClearColor(0x000000, 0);
    _renderer.autoClear = true;
    _renderer.clear(true, true, true);
    _renderer.autoClear = false;
    _renderer.render(_scene, _orthoCam);
    _renderer.setRenderTarget(prevRT);
    _renderer.setClearColor(prevClr, prevAlpha);
    _renderer.autoClear = prevAutoClear;

    _lastBitsCache = null;
    opts.onRedraw?.();
  }

  function _trimTrail(trail: Trail, maxLength: number): void {
    while (trail.lengthPx > maxLength && trail.points.length > 1) {
      const [a, b] = trail.points;
      const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
      trail.points.shift();
      trail.lengthPx -= segmentLength;
    }
  }

  function _addPointToTrail(trail: Trail, x: number, y: number, maxLength: number, dpr: number): boolean {
    if (trail.points.length === 0) {
      trail.points.push({ x, y });
      trail.lengthPx = 0;
      return true;
    }

    const last = trail.points[trail.points.length - 1];
    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist < 0.5 * dpr) return false;

    trail.points.push({ x, y });
    trail.lengthPx += dist;
    _trimTrail(trail, maxLength);
    return true;
  }

  function attachRenderer(renderer: THREE.WebGLRenderer): void {
    _renderer = renderer;
    _ensureRT();
    _redraw();
  }

  function resize(w: number, h: number): void {
    _w = Math.max(1, w);
    _h = Math.max(1, h);
    _ensureRT();
    _redraw();
  }

  function clear(): void {
    for (const c of ["r", "g", "b"] as const) {
      trails[c].points = [];
      trails[c].lengthPx = 0;
    }
    _redraw();
  }

  function clearColor(color: ColorKey): void {
    trails[color].points = [];
    trails[color].lengthPx = 0;
    _redraw();
  }

  function addPoint(color: ColorKey, x: number, y: number): void {
    const changed = _addPointToTrail(trails[color], x, y, _maxTrailLengthPx(), getDpr());
    if (changed) _redraw();
  }

  function maskBitsAt(x: number, y: number, viewW: number, viewH: number): number {
    if (_lastBitsCache && _lastBitsCache.x === x && _lastBitsCache.y === y && _lastBitsCache.viewW === viewW && _lastBitsCache.viewH === viewH) {
      return _lastBitsCache.bits;
    }
    if (!_renderer || !_rt) return 0;

    // x,y приходят в пикселях canvas (0..viewW/viewH). RT тоже в этих пикселях.
    // WebGL readPixels — origin bottom-left.
    const rx = Math.max(0, Math.min(_w - 1, Math.floor((x / Math.max(1, viewW)) * _w)));
    const ryTopDown = Math.max(0, Math.min(_h - 1, Math.floor((y / Math.max(1, viewH)) * _h)));
    const ry = (_h - 1) - ryTopDown;

    const px = new Uint8Array(4);
    _renderer.readRenderTargetPixels(_rt, rx, ry, 1, 1, px);
    const r = px[0];
    const g = px[1];
    const b = px[2];

    let bits = 0;
    if (r > MASK_BRIGHTNESS_THRESHOLD_255) bits |= 1;
    if (g > MASK_BRIGHTNESS_THRESHOLD_255) bits |= 2;
    if (b > MASK_BRIGHTNESS_THRESHOLD_255) bits |= 4;

    _lastBitsCache = { x, y, viewW, viewH, bits };
    return bits;
  }

  const placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  placeholder.needsUpdate = true;

  return {
    get maskTexture() {
      return _rt?.texture ?? placeholder;
    },
    attachRenderer,
    resize,
    clear,
    clearColor,
    addPoint,
    maskBitsAt,
  };
}

