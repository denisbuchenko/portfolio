import * as THREE from "three";
import type { FoodEntry } from "../../fruits/foodCatalog";
import { loadFoodCatalog } from "../../fruits/foodCatalog";

export type FruitLayerBits = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type FruitLayerPreset = {
  bg: string; // hex
  dir: { x: number; y: number };
  speedCssPxPerSec: number;
  sizeCssPx: { min: number; max: number };
  fruits?: {
    include?: string[];
    exclude?: string[];
    /** Кол-во уникальных типов фруктов в слое (по умолчанию берём из counts). */
    countTypes?: number;
    /** Кол-во инстансов (клонов) в слое. Можно больше, чем countTypes (будут повторы). */
    countInstances?: number;
  };
};

export type FruitBackgroundPresetsConfig = {
  enabled: boolean;
  gltfUrl: string;
  /** Порог маски (0..1) для получения bits из paint-маски в пазле. */
  maskThreshold: number;
  /**
   * Глобальный множитель количества инстансов.
   * 1 = как в пресетах, 2 = в 2 раза больше, 0.5 = в 2 раза меньше.
   */
  instanceMul: number;
  /**
   * Глобальный множитель размера.
   * 1 = как в пресетах, 1.3 = крупнее, 0.8 = мельче.
   */
  sizeMul: number;
  /**
   * Глобальная “беспорядочность” стартовых позиций (0..1).
   * 0 = ближе к ровной раскладке, 1 = сильный разброс (но без пересечений).
   */
  positionChaos: number;
  camera: {
    /** Поле зрения камеры (градусы). Меньше = сильнее «телефото», больше = шире перспектива. */
    fovDeg: number;
    /** Глубина распределения по Z в CSS-пикселях (умножается на DPR). */
    depthCssPx: number;
  };
  /** Масштаб renderTarget’ов относительно основного canvas (0.25..1). */
  rtScale: number;
  /** Как часто перерендеривать offscreen (например 30). 0 = каждый кадр. */
  updateFps: number;
  seed: number;
  lighting: {
    ambientIntensity: number;
    dirIntensity: number;
    dirDirection: { x: number; y: number; z: number };
  };
  counts: { bits1to5: number; bits6to7: number };
  motion: {
    wrapMarginCssPx: number;
    swayAmpCssPx: number;
    swaySpeed: number;
    spinSpeed: number;
    /** Скорость 3D-вращения вокруг своей оси (tumble). */
    axisSpinSpeed: number;
  };
  layers: Record<FruitLayerBits, FruitLayerPreset>;
};

type _PlacedCircle = { x: number; y: number; r: number };

type _PlacementState = {
  w: number;
  h: number;
  margin: number;
  cellW: number;
  cellH: number;
  cells: Array<{ x: number; y: number }>;
  cursor: number;
  hashCellSize: number;
  placed: _PlacedCircle[];
  grid: Map<string, number[]>;
};

function _clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function _norm2(v: THREE.Vector2): THREE.Vector2 {
  const n = v.length();
  if (n < 1e-6) return new THREE.Vector2(1, 0);
  return v.multiplyScalar(1 / n);
}

function _rand01(seed: number): number {
  // xorshift-ish (deterministic, cheap)
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x1_0000_0000;
}

function _hexToRgb8(hex: string): { r: number; g: number; b: number } {
  const c = new THREE.Color(hex);
  return {
    r: Math.round(_clamp(c.r, 0, 1) * 255),
    g: Math.round(_clamp(c.g, 0, 1) * 255),
    b: Math.round(_clamp(c.b, 0, 1) * 255)
  };
}

function _createSolidTexture(hex: string): THREE.DataTexture {
  const { r, g, b } = _hexToRgb8(hex);
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function _patchMaterialForBackground(mat: THREE.MeshBasicMaterial): void {
  // Unlit: цвет строго из текстуры (без влияния света)
  mat.toneMapped = false;
  mat.depthTest = true;
  mat.depthWrite = true;
  mat.side = THREE.DoubleSide;
}

function _filterCatalogEntries(entries: FoodEntry[], include?: string[], exclude?: string[]): FoodEntry[] {
  const inc = (include ?? []).filter(Boolean);
  const exc = new Set((exclude ?? []).filter(Boolean));
  if (inc.length > 0) {
    const incSet = new Set(inc);
    return entries.filter((e) => incSet.has(e.name));
  }
  if (exc.size > 0) return entries.filter((e) => !exc.has(e.name));
  return entries;
}

function _pickUnique(entries: FoodEntry[], count: number, seed: number): FoodEntry[] {
  const n = entries.length;
  if (n <= 0) return [];
  const k = Math.max(0, Math.min(n, count | 0));
  if (k <= 0) return [];

  // частичная детерминированная тасовка (Fisher-Yates до k)
  const idx: number[] = Array.from({ length: n }, (_, i) => i);
  let s = seed | 0;
  for (let i = 0; i < k; i++) {
    s = (s * 1664525 + 1013904223) | 0; // LCG
    const r = ((s >>> 0) % (n - i)) | 0;
    const j = i + r;
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx.slice(0, k).map((i) => entries[i]);
}

export type FruitBackgroundRenderer = {
  isReady(): boolean;
  load(): Promise<void>;
  resize(w: number, h: number, dpr: number): void;
  update(timeSec: number, dpr: number): void;
  renderTargets(renderer: THREE.WebGLRenderer): void;
  renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: FruitLayerBits): void;
  getLayerTexture(bits: FruitLayerBits): THREE.Texture;
  getFallbackTexture(bits: FruitLayerBits): THREE.Texture;
  dispose(): void;
};

export function createFruitBackgroundRenderer(opts: { config: FruitBackgroundPresetsConfig }): FruitBackgroundRenderer {
  const { config } = opts;

  const scene = new THREE.Scene();
  const instances: _FruitInstance[] = [];
  const typeLayers: _TypeLayer[] = [];

  const isReadyRef = { v: false };
  const _tmpDeltaQuat = new THREE.Quaternion();
  const _tmpMat = new THREE.Matrix4();
  const _tmpScale = new THREE.Vector3(1, 1, 1);

  // simple lights
  const lightGroup = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff, config.lighting.ambientIntensity);
  const dir = new THREE.DirectionalLight(0xffffff, config.lighting.dirIntensity);
  dir.position.set(config.lighting.dirDirection.x, config.lighting.dirDirection.y, config.lighting.dirDirection.z).normalize();
  // Важно: меши слоёв живут в layers=1..7, иначе Lambert станет чёрным без света.
  ambient.layers.enableAll();
  dir.layers.enableAll();
  lightGroup.add(ambient);
  lightGroup.add(dir);
  scene.add(lightGroup);

  // Perspective camera (объём/глубина)
  let camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, -1, 0); // y вниз, как в пазле
  let _viewW = 2;
  let _viewH = 2;
  let _cameraZ = 1000;
  let _depthPx = 600;

  const _placementByBits = new Map<FruitLayerBits, _PlacementState>();
  function _resetPlacement(): void {
    _placementByBits.clear();
    for (const it of instances) it._inited = false;
  }

  const fallbackTexByBits: Record<FruitLayerBits, THREE.DataTexture> = {
    1: _createSolidTexture(config.layers[1].bg),
    2: _createSolidTexture(config.layers[2].bg),
    3: _createSolidTexture(config.layers[3].bg),
    4: _createSolidTexture(config.layers[4].bg),
    5: _createSolidTexture(config.layers[5].bg),
    6: _createSolidTexture(config.layers[6].bg),
    7: _createSolidTexture(config.layers[7].bg)
  };

  const rtByBits = new Map<FruitLayerBits, THREE.WebGLRenderTarget>();
  function _ensureTargets(w: number, h: number): void {
    const s = _clamp(config.rtScale, 0.25, 1.0);
    const tw = Math.max(1, Math.floor(w * s));
    const th = Math.max(1, Math.floor(h * s));
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const rt = rtByBits.get(b);
      if (!rt) {
        const nrt = new THREE.WebGLRenderTarget(tw, th, {
          depthBuffer: true,
          stencilBuffer: false
        });
        nrt.texture.generateMipmaps = false;
        nrt.texture.minFilter = THREE.LinearFilter;
        nrt.texture.magFilter = THREE.LinearFilter;
        nrt.texture.wrapS = THREE.ClampToEdgeWrapping;
        nrt.texture.wrapT = THREE.ClampToEdgeWrapping;
        rtByBits.set(b, nrt);
      } else {
        if (rt.width !== tw || rt.height !== th) rt.setSize(tw, th);
      }
    }
  }

  async function load(): Promise<void> {
    if (!config.enabled) return;

    const { entries } = await loadFoodCatalog(config.gltfUrl);

    const typeDefs = _buildTypeDefs(entries);

    // сбор слоёв
    const counts: number[] = [
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits6to7,
      config.counts.bits6to7
    ];

    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const layer = config.layers[b];
      const filtered = _filterCatalogEntries(entries, layer.fruits?.include, layer.fruits?.exclude);
      const takeTypes = Math.max(0, (layer.fruits?.countTypes ?? counts[bits - 1]) | 0);
      const pickedTypes = _pickUnique(filtered, takeTypes, (config.seed + bits * 131) | 0);
      const baseInstances = (layer.fruits?.countInstances ?? Math.min(64, Math.max(pickedTypes.length, pickedTypes.length * 6))) | 0;
      const countInstances = Math.max(0, Math.min(256, Math.round(baseInstances * _clamp(config.instanceMul, 0.1, 8.0))));

      const dirV = _norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
      const assigned = _assignInstancesToTypes(pickedTypes, countInstances, (config.seed + bits * 991) | 0);
      const layerTypeMap = _createTypeLayersForBits(b, typeDefs, assigned.countByType);
      for (const tl of layerTypeMap.values()) {
        typeLayers.push(tl);
        for (const m of tl.meshes) scene.add(m);
      }

      const perTypeCursor = new Map<string, number>();
      for (let i = 0; i < assigned.types.length; i++) {
        const typeName = assigned.types[i];
        const tl = layerTypeMap.get(typeName);
        if (!tl) continue;
        const localIdx = perTypeCursor.get(typeName) ?? 0;
        perTypeCursor.set(typeName, localIdx + 1);

        const seed = (config.seed + bits * 1000 + i * 17 + typeName.length * 13) | 0;
        const axis = new THREE.Vector3(_rand01(seed + 21) - 0.5, _rand01(seed + 22) - 0.5, _rand01(seed + 23) - 0.5);
        if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
        axis.normalize();

        instances.push({
          bits: b,
          _typeLayer: tl,
          _index: localIdx,
          _seed: seed,
          _sizeRand: _rand01(seed + 3),
          _zRand: _rand01(seed + 9),
          _axis: axis,
          _angVel: (0.15 + 0.55 * _rand01(seed + 5)) * config.motion.axisSpinSpeed,
          _quat: new THREE.Quaternion(),
          _pos: new THREE.Vector3(0, 0, 0),
          _velDir: dirV.clone(),
          _inited: false
        });
      }
    }

    isReadyRef.v = true;
  }

  function resize(w: number, h: number, dpr: number): void {
    _ensureTargets(w, h);
    _viewW = w;
    _viewH = h;
    camera = new THREE.PerspectiveCamera(_clamp(config.camera.fovDeg, 12, 85), w / Math.max(1, h), 0.1, 8000);
    camera.up.set(0, -1, 0);
    // выбираем Z так, чтобы на плоскости z=0 видимая высота примерно была равна h (в пикселях)
    const fovRad = (camera.fov * Math.PI) / 180;
    _cameraZ = h / Math.max(1e-3, 2 * Math.tan(fovRad * 0.5));
    _depthPx = Math.max(1, config.camera.depthCssPx * Math.max(0.5, dpr));
    camera.position.set(w * 0.5, h * 0.5, _cameraZ);
    camera.lookAt(w * 0.5, h * 0.5, 0);
    camera.updateProjectionMatrix();
    _resetPlacement();
  }

  let _lastTimeSec: number | null = null;
  let _lastRenderedSec: number | null = null;
  let _shouldRenderThisFrame = true;

  function update(timeSec: number, dpr: number): void {
    if (!config.enabled) return;
    if (!isReadyRef.v) return;

    const dt =
      _lastTimeSec === null
        ? 1 / 60
        : _clamp(timeSec - _lastTimeSec, 1 / 240, 1 / 20); // 240fps..50fps
    _lastTimeSec = timeSec;

    const w = _viewW | 0;
    const h = _viewH | 0;
    const margin = config.motion.wrapMarginCssPx * dpr;
    const swayAmp = config.motion.swayAmpCssPx * dpr;
    const swaySpeed = config.motion.swaySpeed;
    const sizeMul = _clamp(config.sizeMul, 0.2, 5.0);
    const chaos = _clamp(config.positionChaos, 0.0, 1.0);

    function _hashKey(cx: number, cy: number): string {
      return `${cx},${cy}`;
    }

    function _getPlacementState(bits: FruitLayerBits, instanceCount: number, maxSizePx: number): _PlacementState {
      const existing = _placementByBits.get(bits);
      if (existing && existing.w === w && existing.h === h && Math.abs(existing.margin - margin) < 0.01) return existing;

      const n = Math.max(1, instanceCount | 0);
      const aspect = w / Math.max(1, h);
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cellW = (w + 2 * margin) / cols;
      const cellH = (h + 2 * margin) / rows;

      const cells: Array<{ x: number; y: number }> = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cells.push({ x: -margin + (c + 0.5) * cellW, y: -margin + (r + 0.5) * cellH });
        }
      }

      // Детерминированно перемешаем клетки — убирает “равномерную матрицу”.
      let s = (config.seed + bits * 1337) | 0;
      for (let i = cells.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) | 0;
        const j = ((s >>> 0) % (i + 1)) | 0;
        const tmp = cells[i];
        cells[i] = cells[j];
        cells[j] = tmp;
      }

      // Spatial hash: клетка примерно под max size, чтобы коллизии проверять быстро.
      const hashCellSize = Math.max(12 * dpr, maxSizePx * 0.9 + 8 * dpr);
      const st: _PlacementState = {
        w,
        h,
        margin,
        cellW,
        cellH,
        cells,
        cursor: 0,
        hashCellSize,
        placed: [],
        grid: new Map()
      };
      _placementByBits.set(bits, st);
      return st;
    }

    function _tryPlace(st: _PlacementState, seed: number, r: number): { x: number; y: number } {
      const pad = 6 * dpr;
      const tries = 22;
      for (let attempt = 0; attempt < tries; attempt++) {
        const cell = st.cells[st.cursor % st.cells.length];
        st.cursor++;

        // jitter: широкий, но ограниченный — выглядит “непредсказуемо”.
        const jitterFrac = 0.15 + 0.8 * chaos; // 0.15..0.95
        const jx = (_rand01(seed + 17 * attempt + 1) - 0.5) * st.cellW * jitterFrac;
        const jy = (_rand01(seed + 17 * attempt + 2) - 0.5) * st.cellH * jitterFrac;
        const x = cell.x + jx;
        const y = cell.y + jy;

        if (x < -st.margin - r || x > st.w + st.margin + r) continue;
        if (y < -st.margin - r || y > st.h + st.margin + r) continue;

        const cs = st.hashCellSize;
        const cx = Math.floor(x / cs);
        const cy = Math.floor(y / cs);

        let ok = true;
        for (let oy = -1; oy <= 1 && ok; oy++) {
          for (let ox = -1; ox <= 1 && ok; ox++) {
            const key = _hashKey(cx + ox, cy + oy);
            const ids = st.grid.get(key);
            if (!ids) continue;
            for (const id of ids) {
              const p = st.placed[id];
              const dx = x - p.x;
              const dy = y - p.y;
              const rr = r + p.r + pad;
              if (dx * dx + dy * dy < rr * rr) {
                ok = false;
                break;
              }
            }
          }
        }
        if (!ok) continue;

        const id = st.placed.length;
        st.placed.push({ x, y, r });
        const key = _hashKey(cx, cy);
        const arr = st.grid.get(key);
        if (arr) arr.push(id);
        else st.grid.set(key, [id]);
        return { x, y };
      }

      // fallback: если не нашли — кладём в центр следующей клетки
      const cell = st.cells[st.cursor % st.cells.length];
      st.cursor++;
      return { x: cell.x, y: cell.y };
    }

    for (const it of instances) {
      const layer = config.layers[it.bits];
      const dirV = _norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
      const velPx = dirV.clone().multiplyScalar(layer.speedCssPxPerSec * dpr);

      if (!it._inited) {
        // Непредсказуемое распределение без пересечений:
        // 1) берём перемешанную "сетку клеток"
        // 2) делаем широкий jitter
        // 3) проверяем коллизии через spatial-hash
        const targetSizePx = (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * it._sizeRand) * dpr * sizeMul;
        const radius = targetSizePx * 0.55;
        const st = _getPlacementState(it.bits, it._typeLayer.count, layer.sizeCssPx.max * dpr * sizeMul);
        const p = _tryPlace(st, it._seed, radius);
        it._pos.x = p.x;
        it._pos.y = p.y;
        it._pos.z = (_rand01(it._seed + 77) - 0.5) * _depthPx;
        it._inited = true;
      }

      // move
      it._pos.x += velPx.x * dt;
      it._pos.y += velPx.y * dt;

      // sway (перпендикуляр к dir)
      const sway =
        swayAmp *
        (0.5 +
          0.5 * Math.sin(timeSec * (swaySpeed + 0.3 * _rand01(it._seed + 7)) + 6.28318 * _rand01(it._seed + 11)));
      it._pos.x += -dirV.y * sway * dt;
      it._pos.y += dirV.x * sway * dt;

      // wrap
      if (dirV.x > 0.0 && it._pos.x > w + margin) it._pos.x = -margin;
      if (dirV.x < 0.0 && it._pos.x < -margin) it._pos.x = w + margin;
      if (dirV.y > 0.0 && it._pos.y > h + margin) it._pos.y = -margin;
      if (dirV.y < 0.0 && it._pos.y < -margin) it._pos.y = h + margin;

      // scale per layer
      const targetSizePx = (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * it._sizeRand) * dpr * sizeMul;
      const scale = it._typeLayer.baseScale * targetSizePx;

      // 3D tumble (slow random axis)
      const delta = it._angVel * dt;
      _tmpDeltaQuat.setFromAxisAngle(it._axis, delta);
      it._quat.multiply(_tmpDeltaQuat).normalize();

      _tmpScale.set(scale, scale, scale);
      _tmpMat.compose(it._pos, it._quat, _tmpScale);
      for (const mesh of it._typeLayer.meshes) mesh.setMatrixAt(it._index, _tmpMat);
      it._typeLayer._dirty = true;
    }

    if (config.updateFps <= 0) {
      _shouldRenderThisFrame = true;
      return;
    }
    const step = 1 / Math.max(1, config.updateFps);
    if (_lastRenderedSec === null || timeSec - _lastRenderedSec >= step) _shouldRenderThisFrame = true;
  }

  function renderTargets(renderer: THREE.WebGLRenderer): void {
    if (!config.enabled) return;
    if (!isReadyRef.v) return;
    if (!_shouldRenderThisFrame) return;

    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevClearA = renderer.getClearAlpha();

    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const rt = rtByBits.get(b);
      if (!rt) continue;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(new THREE.Color(config.layers[b].bg), 1);
      renderer.clear(true, true, true);
      camera.layers.set(bits);
      _flushInstanceMatrices(b);
      renderer.render(scene, camera);
    }

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevClearA);

    _lastRenderedSec = _lastTimeSec ?? _lastRenderedSec;
    _shouldRenderThisFrame = false;
  }

  function renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: FruitLayerBits): void {
    if (!config.enabled) return;
    if (!isReadyRef.v) return;

    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevClearA = renderer.getClearAlpha();

    renderer.setRenderTarget(null);
    renderer.setClearColor(new THREE.Color(config.layers[bits].bg), 1);
    renderer.clear(true, true, true);
    camera.layers.set(bits);
    _flushInstanceMatrices(bits);
    renderer.render(scene, camera);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevClearA);
  }

  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    return rtByBits.get(bits)?.texture ?? fallbackTexByBits[bits];
  }

  function getFallbackTexture(bits: FruitLayerBits): THREE.Texture {
    return fallbackTexByBits[bits];
  }

  function _flushInstanceMatrices(bits: FruitLayerBits): void {
    for (const tl of typeLayers) {
      if (tl.bits !== bits) continue;
      if (!tl._dirty) continue;
      for (const m of tl.meshes) m.instanceMatrix.needsUpdate = true;
      tl._dirty = false;
    }
  }

  function dispose(): void {
    for (const rt of rtByBits.values()) rt.dispose();
    rtByBits.clear();
    for (const bits of [1, 2, 3, 4, 5, 6, 7] as const) fallbackTexByBits[bits].dispose();
    const disposedMaterials = new Set<THREE.Material>();
    for (const tl of typeLayers) {
      for (const m of tl.meshes) {
        scene.remove(m);
        m.geometry.dispose();
        const mat = m.material as THREE.Material;
        if (!disposedMaterials.has(mat)) {
          mat.dispose();
          disposedMaterials.add(mat);
        }
      }
    }
  }

  return {
    isReady: () => isReadyRef.v,
    load,
    resize,
    update,
    renderTargets,
    renderLayerToScreen,
    getLayerTexture,
    getFallbackTexture,
    dispose
  };
}

type _TypeLayer = {
  bits: FruitLayerBits;
  typeName: string;
  meshes: THREE.InstancedMesh[];
  count: number;
  baseScale: number;
  _dirty: boolean;
};

type _FruitInstance = {
  bits: FruitLayerBits;
  _typeLayer: _TypeLayer;
  _index: number;
  _seed: number;
  _sizeRand: number;
  _zRand: number;
  _axis: THREE.Vector3;
  _angVel: number;
  _quat: THREE.Quaternion;
  _pos: THREE.Vector3;
  _velDir: THREE.Vector2;
  _inited: boolean;
};

type _Assigned = { types: string[]; countByType: Map<string, number> };

type _TypeDef = {
  name: string;
  normalizedScale: number;
  parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial }>;
};

function _buildTypeDefs(entries: FoodEntry[]): Map<string, _TypeDef> {
  const out = new Map<string, _TypeDef>();
  for (const e of entries) {
    // собрать части (меши) в координатах корня группы
    const group = e.object;
    group.updateMatrixWorld(true);
    const inv = group.matrixWorld.clone().invert();
    const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial }> = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.updateMatrixWorld(true);
      const localToGroup = inv.clone().multiply(mesh.matrixWorld);
      const geo = (mesh.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(localToGroup);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      _patchMaterialForBackground(mat);
      parts.push({ geometry: geo, material: mat });
    });
    if (parts.length <= 0) continue;
    out.set(e.name, { name: e.name, normalizedScale: e.normalizedScale, parts });
  }
  return out;
}

function _assignInstancesToTypes(picked: FoodEntry[], count: number, seed: number): _Assigned {
  const types: string[] = [];
  const countByType = new Map<string, number>();
  if (picked.length <= 0 || count <= 0) return { types, countByType };
  for (let i = 0; i < count; i++) {
    const r = _rand01((seed + i * 31) | 0);
    const entry = picked[Math.min(picked.length - 1, Math.floor(r * picked.length))];
    types.push(entry.name);
    countByType.set(entry.name, (countByType.get(entry.name) ?? 0) + 1);
  }
  return { types, countByType };
}

function _createTypeLayersForBits(bits: FruitLayerBits, defs: Map<string, _TypeDef>, counts: Map<string, number>): Map<string, _TypeLayer> {
  const out = new Map<string, _TypeLayer>();
  for (const [name, cnt] of counts) {
    const def = defs.get(name);
    if (!def || cnt <= 0) continue;
    const meshes: THREE.InstancedMesh[] = [];
    for (let p = 0; p < def.parts.length; p++) {
      const part = def.parts[p];
      const im = new THREE.InstancedMesh(part.geometry, part.material, cnt);
      im.frustumCulled = false;
      im.layers.set(bits);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      meshes.push(im);
    }
    out.set(name, { bits, typeName: name, meshes, count: cnt, baseScale: def.normalizedScale, _dirty: true });
  }
  return out;
}

// (intentionally empty) — per-instance upload lives inside createFruitBackgroundRenderer closure.

