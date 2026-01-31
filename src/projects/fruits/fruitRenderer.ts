import * as THREE from "three";
import { loadFoodCatalog } from "./foodCatalog";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "./types";

// Реэкспорт типов для удобства
export type { FruitBackgroundPresetsConfig, FruitLayerBits } from "./types";
import { clamp, norm2, rand01, createSolidTexture } from "./utils";
import { filterCatalogEntries, pickUnique } from "./utils";
import { buildTypeDefs, assignInstancesToTypes, createTypeLayersForBits, type TypeLayer } from "./instancing";
import { getPlacementState, tryPlace, clearPlacementCache, type PlacementState } from "./placement";

/**
 * Главный рендерер фруктов.
 * Управляет загрузкой, анимацией и рендером всех фруктов в 7 слоях (bits=1..7).
 *
 * Технические детали:
 * - Использует InstancedMesh для оптимизации (общая геометрия, отдельные матрицы)
 * - Рендерит в 7 отдельных RenderTarget для каждого bits-слоя
 * - Поддерживает PerspectiveCamera для объёмного вида
 * - Использует spatial hash для размещения без пересечений
 */
export type FruitBackgroundRenderer = {
  /** Загружены ли модели и готов ли к рендеру */
  isReady(): boolean;
  /** Асинхронная загрузка всех 3D моделей и создание инстансов */
  load(): Promise<void>;
  /** Обновление размеров сцены (вызывать при resize) */
  resize(w: number, h: number, dpr: number): void;
  /** Обновление анимации (вызывать каждый кадр) */
  update(timeSec: number, dpr: number): void;
  /** Рендер всех слоёв в offscreen RenderTarget'ы (для пазлов) */
  renderTargets(renderer: THREE.WebGLRenderer): void;
  /** Рендер конкретного слоя на экран (для превью) */
  renderLayerToScreen(renderer: THREE.WebGLRenderer, bits: FruitLayerBits): void;
  /** Получить текстуру фона для слоя */
  getLayerTexture(bits: FruitLayerBits): THREE.Texture;
  /** Получить fallback текстуру (если слой ещё не загружен) */
  getFallbackTexture(bits: FruitLayerBits): THREE.Texture;
  /** Освободить ресурсы */
  dispose(): void;
};

/**
 * Инстанс фрукта: данные для одного объекта на экране.
 */
type FruitInstance = {
  bits: FruitLayerBits;
  _typeLayer: TypeLayer;
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

/**
 * Создаёт рендерер фруктов с заданной конфигурацией.
 */
export function createFruitBackgroundRenderer(opts: { config: FruitBackgroundPresetsConfig }): FruitBackgroundRenderer {
  const { config } = opts;

  // Сцена и камера
  const scene = new THREE.Scene();
  let camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  camera.up.set(0, -1, 0); // y вниз, как в пазле

  // Освещение (для совместимости, но сейчас используется unlit материал)
  const lightGroup = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff, config.lighting.ambientIntensity);
  const dir = new THREE.DirectionalLight(0xffffff, config.lighting.dirIntensity);
  dir.position.set(config.lighting.dirDirection.x, config.lighting.dirDirection.y, config.lighting.dirDirection.z).normalize();
  ambient.layers.enableAll();
  dir.layers.enableAll();
  lightGroup.add(ambient);
  lightGroup.add(dir);
  scene.add(lightGroup);

  // Состояние
  const instances: FruitInstance[] = [];
  const typeLayers: TypeLayer[] = [];
  const isReadyRef = { v: false };
  const placementByBits = new Map<FruitLayerBits, PlacementState>();

  // Временные объекты для обновления матриц (переиспользуем для экономии памяти)
  const _tmpDeltaQuat = new THREE.Quaternion();
  const _tmpMat = new THREE.Matrix4();
  const _tmpScale = new THREE.Vector3(1, 1, 1);

  // Размеры и камера
  let _viewW = 2;
  let _viewH = 2;
  let _cameraZ = 1000;
  let _depthPx = 600;

  // RenderTarget'ы для каждого bits-слоя
  const rtByBits = new Map<FruitLayerBits, THREE.WebGLRenderTarget>();
  const fallbackTexByBits: Record<FruitLayerBits, THREE.DataTexture> = {
    1: createSolidTexture(config.layers[1].bg),
    2: createSolidTexture(config.layers[2].bg),
    3: createSolidTexture(config.layers[3].bg),
    4: createSolidTexture(config.layers[4].bg),
    5: createSolidTexture(config.layers[5].bg),
    6: createSolidTexture(config.layers[6].bg),
    7: createSolidTexture(config.layers[7].bg)
  };

  /**
   * Создаёт или обновляет RenderTarget'ы для всех слоёв.
   */
  function ensureTargets(w: number, h: number): void {
    const s = clamp(config.rtScale, 0.25, 1.0);
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

  /**
   * Сбрасывает состояние размещения (вызывается при resize).
   */
  function resetPlacement(): void {
    clearPlacementCache();
    placementByBits.clear();
    for (const it of instances) it._inited = false;
  }

  /**
   * Загружает 3D модели и создаёт инстансы для всех слоёв.
   */
  async function load(): Promise<void> {
    if (!config.enabled) return;

    // Загружаем каталог фруктов
    const { entries } = await loadFoodCatalog(config.gltfUrl);

    // Собираем определения типов (геометрия + материалы)
    const typeDefs = buildTypeDefs(entries);

    // Количество типов фруктов для каждого bits-слоя
    const counts: number[] = [
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits6to7,
      config.counts.bits6to7
    ];

    // Создаём инстансы для каждого bits-слоя
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const layer = config.layers[b];

      // Фильтруем и выбираем типы фруктов для этого слоя
      const filtered = filterCatalogEntries(entries, layer.fruits?.include, layer.fruits?.exclude);
      const takeTypes = Math.max(0, (layer.fruits?.countTypes ?? counts[bits - 1]) | 0);
      const pickedTypes = pickUnique(filtered, takeTypes, (config.seed + bits * 131) | 0);

      // Вычисляем количество инстансов
      const baseInstances =
        (layer.fruits?.countInstances ?? Math.min(64, Math.max(pickedTypes.length, pickedTypes.length * 6))) | 0;
      const countInstances = Math.max(0, Math.min(256, Math.round(baseInstances * clamp(config.instanceMul, 0.1, 8.0))));

      // Направление движения
      const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));

      // Распределяем инстансы по типам и создаём TypeLayer'ы
      const assigned = assignInstancesToTypes(pickedTypes, countInstances, (config.seed + bits * 991) | 0);
      const layerTypeMap = createTypeLayersForBits(b, typeDefs, assigned.countByType);

      // Добавляем меши в сцену
      for (const tl of layerTypeMap.values()) {
        typeLayers.push(tl);
        for (const m of tl.meshes) scene.add(m);
      }

      // Создаём инстансы с их параметрами
      const perTypeCursor = new Map<string, number>();
      for (let i = 0; i < assigned.types.length; i++) {
        const typeName = assigned.types[i];
        const tl = layerTypeMap.get(typeName);
        if (!tl) continue;

        const localIdx = perTypeCursor.get(typeName) ?? 0;
        perTypeCursor.set(typeName, localIdx + 1);

        // Генерируем детерминированные параметры для инстанса
        const seed = (config.seed + bits * 1000 + i * 17 + typeName.length * 13) | 0;
        const axis = new THREE.Vector3(rand01(seed + 21) - 0.5, rand01(seed + 22) - 0.5, rand01(seed + 23) - 0.5);
        if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
        axis.normalize();

        instances.push({
          bits: b,
          _typeLayer: tl,
          _index: localIdx,
          _seed: seed,
          _sizeRand: rand01(seed + 3),
          _zRand: rand01(seed + 9),
          _axis: axis,
          _angVel: (0.15 + 0.55 * rand01(seed + 5)) * config.motion.axisSpinSpeed,
          _quat: new THREE.Quaternion(),
          _pos: new THREE.Vector3(0, 0, 0),
          _velDir: dirV.clone(),
          _inited: false
        });
      }
    }

    isReadyRef.v = true;
  }

  /**
   * Обновляет размеры сцены и камеры.
   */
  function resize(w: number, h: number, dpr: number): void {
    ensureTargets(w, h);
    _viewW = w;
    _viewH = h;

    // Настраиваем PerspectiveCamera
    camera = new THREE.PerspectiveCamera(clamp(config.camera.fovDeg, 12, 85), w / Math.max(1, h), 0.1, 8000);
    camera.up.set(0, -1, 0);

    // Выбираем Z так, чтобы на плоскости z=0 видимая высота примерно была равна h (в пикселях)
    const fovRad = (camera.fov * Math.PI) / 180;
    _cameraZ = h / Math.max(1e-3, 2 * Math.tan(fovRad * 0.5));
    _depthPx = Math.max(1, config.camera.depthCssPx * Math.max(0.5, dpr));

    camera.position.set(w * 0.5, h * 0.5, _cameraZ);
    camera.lookAt(w * 0.5, h * 0.5, 0);
    camera.updateProjectionMatrix();

    resetPlacement();
  }

  // Состояние для управления частотой рендера
  let _lastTimeSec: number | null = null;
  let _lastRenderedSec: number | null = null;
  let _shouldRenderThisFrame = true;

  /**
   * Обновляет анимацию всех инстансов.
   */
  function update(timeSec: number, dpr: number): void {
    if (!config.enabled) return;
    if (!isReadyRef.v) return;

    // Вычисляем delta time (ограничен для стабильности)
    const dt =
      _lastTimeSec === null
        ? 1 / 60
        : clamp(timeSec - _lastTimeSec, 1 / 240, 1 / 20); // 240fps..50fps
    _lastTimeSec = timeSec;

    const w = _viewW | 0;
    const h = _viewH | 0;
    const margin = config.motion.wrapMarginCssPx * dpr;
    const swayAmp = config.motion.swayAmpCssPx * dpr;
    const swaySpeed = config.motion.swaySpeed;
    const sizeMul = clamp(config.sizeMul, 0.2, 5.0);
    const chaos = clamp(config.positionChaos, 0.0, 1.0);

    // Обновляем каждый инстанс
    for (const it of instances) {
      const layer = config.layers[it.bits];
      const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
      const velPx = dirV.clone().multiplyScalar(layer.speedCssPxPerSec * dpr);

      // Инициализация позиции (только один раз)
      if (!it._inited) {
        const targetSizePx =
          (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * it._sizeRand) * dpr * sizeMul;
        const radius = targetSizePx * 0.55;

        // Получаем состояние размещения для этого bits-слоя
        const st = getPlacementState(
          it.bits,
          it._typeLayer.count,
          layer.sizeCssPx.max * dpr * sizeMul,
          w,
          h,
          margin,
          dpr,
          config.seed
        );

        // Пытаемся разместить без пересечений
        const p = tryPlace(st, it._seed, radius, chaos);
        it._pos.x = p.x;
        it._pos.y = p.y;
        it._pos.z = (rand01(it._seed + 77) - 0.5) * _depthPx;
        it._inited = true;
      }

      // Движение по направлению
      it._pos.x += velPx.x * dt;
      it._pos.y += velPx.y * dt;

      // Покачивание (sway) перпендикулярно направлению
      const sway =
        swayAmp *
        (0.5 +
          0.5 * Math.sin(timeSec * (swaySpeed + 0.3 * rand01(it._seed + 7)) + 6.28318 * rand01(it._seed + 11)));
      it._pos.x += -dirV.y * sway * dt;
      it._pos.y += dirV.x * sway * dt;

      // Wrap (зацикливание при выходе за границы)
      if (dirV.x > 0.0 && it._pos.x > w + margin) it._pos.x = -margin;
      if (dirV.x < 0.0 && it._pos.x < -margin) it._pos.x = w + margin;
      if (dirV.y > 0.0 && it._pos.y > h + margin) it._pos.y = -margin;
      if (dirV.y < 0.0 && it._pos.y < -margin) it._pos.y = h + margin;

      // Масштаб
      const targetSizePx =
        (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * it._sizeRand) * dpr * sizeMul;
      const scale = it._typeLayer.baseScale * targetSizePx;

      // 3D вращение вокруг случайной оси (tumble)
      const delta = it._angVel * dt;
      _tmpDeltaQuat.setFromAxisAngle(it._axis, delta);
      it._quat.multiply(_tmpDeltaQuat).normalize();

      // Обновляем матрицу инстанса
      _tmpScale.set(scale, scale, scale);
      _tmpMat.compose(it._pos, it._quat, _tmpScale);
      for (const mesh of it._typeLayer.meshes) mesh.setMatrixAt(it._index, _tmpMat);
      it._typeLayer._dirty = true;
    }

    // Управление частотой рендера (если updateFps > 0)
    if (config.updateFps <= 0) {
      _shouldRenderThisFrame = true;
      return;
    }
    const step = 1 / Math.max(1, config.updateFps);
    if (_lastRenderedSec === null || timeSec - _lastRenderedSec >= step) _shouldRenderThisFrame = true;
  }

  /**
   * Рендерит все слои в offscreen RenderTarget'ы (для пазлов).
   */
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
      flushInstanceMatrices(b);
      renderer.render(scene, camera);
    }

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevClearA);

    _lastRenderedSec = _lastTimeSec ?? _lastRenderedSec;
    _shouldRenderThisFrame = false;
  }

  /**
   * Рендерит конкретный слой на экран (для превью).
   */
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
    flushInstanceMatrices(bits);
    renderer.render(scene, camera);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevClearA);
  }

  /**
   * Помечает матрицы инстансов как "грязные" и требует обновления на GPU.
   */
  function flushInstanceMatrices(bits: FruitLayerBits): void {
    for (const tl of typeLayers) {
      if (tl.bits !== bits) continue;
      if (!tl._dirty) continue;
      for (const m of tl.meshes) m.instanceMatrix.needsUpdate = true;
      tl._dirty = false;
    }
  }

  /**
   * Получает текстуру для слоя (или fallback если ещё не загружен).
   */
  function getLayerTexture(bits: FruitLayerBits): THREE.Texture {
    return rtByBits.get(bits)?.texture ?? fallbackTexByBits[bits];
  }

  /**
   * Получает fallback текстуру (сплошной цвет).
   */
  function getFallbackTexture(bits: FruitLayerBits): THREE.Texture {
    return fallbackTexByBits[bits];
  }

  /**
   * Освобождает все ресурсы.
   */
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
