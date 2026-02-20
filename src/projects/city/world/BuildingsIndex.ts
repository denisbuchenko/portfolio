import * as THREE from "three";

export type BuildingEntry = {
  id: string;
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  box: THREE.Box3;
  center: THREE.Vector3;
  baseScale: THREE.Vector3;
  /** 0..1: 0 скрыт (scale.y=0), 1 полностью показан. */
  appear01: number;
  targetVisible: boolean;
};

export class BuildingsIndex {
  private _buildings: BuildingEntry[] = [];

  get buildings(): readonly BuildingEntry[] {
    return this._buildings;
  }

  buildFromCityScene(root: THREE.Object3D): void {
    const found: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (!o.name) return;
      if (!o.name.startsWith("Building")) return;
      if (!o.name.includes("_CTRL")) return;
      found.push(o);
    });

    this._buildings = found.map((b, i) => {
      const meshes: THREE.Mesh[] = [];
      b.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) meshes.push(m);
      });
      const box = new THREE.Box3().setFromObject(b);
      const center = new THREE.Vector3();
      box.getCenter(center);
      return {
        id: `${i}`,
        root: b,
        meshes,
        box,
        center,
        baseScale: b.scale.clone(),
        appear01: 1,
        targetVisible: true
      };
    });
  }

  /**
   * Обновляет targetVisible по реальной видимости камеры (frustum).
   * Возвращает список зданий, у которых поменялся targetVisible.
   */
  setVisibilityByCamera(camera: THREE.Camera, marginWorldUnits = 0): BuildingEntry[] {
    const changed: BuildingEntry[] = [];
    _tmpMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _tmpFrustum.setFromProjectionMatrix(_tmpMat);

    for (const b of this._buildings) {
      _tmpBox.copy(b.box);
      if (marginWorldUnits > 0) _tmpBox.expandByScalar(marginWorldUnits);
      const next = _tmpFrustum.intersectsBox(_tmpBox);
      if (next !== b.targetVisible) {
        b.targetVisible = next;
        changed.push(b);
      }
    }
    return changed;
  }

  /**
   * ONLY для режима города (overview):
   * Игнорируем левую/правую границы и следим только за верхом/низом экрана.
   *
   * `edgeInsetNdc` — насколько “внутрь” отступаем от реального края (в NDC),
   * чтобы анимация стартовала, когда дом уже буквально в паре пикселей от границы.
   *
   * Видимым считаем дом, если его bbox по Y пересекает диапазон [-1+inset .. 1-inset].
   */
  setVisibilityByVerticalBounds(camera: THREE.Camera, edgeInsetNdc = 0): BuildingEntry[] {
    const changed: BuildingEntry[] = [];
    const inset = Math.max(0, edgeInsetNdc);
    const yMin = -1 + inset;
    const yMax = 1 - inset;

    camera.updateMatrixWorld(true);

    for (const b of this._buildings) {
      const next = _boxOverlapsVerticalNdc(camera, b.box, yMin, yMax);
      if (next !== b.targetVisible) {
        b.targetVisible = next;
        changed.push(b);
      }
    }
    return changed;
  }

  /**
   * Плавно анимирует появление/исчезновение по Y (scale.y): “растём в высоту”.
   */
  updateAppear(dtSec: number, speedSec: number): void {
    const k = speedSec <= 0 ? 1 : Math.min(1, dtSec / speedSec);
    for (const b of this._buildings) {
      const target = b.targetVisible ? 1 : 0;
      b.appear01 = _lerp(b.appear01, target, k);
      const eased = _smoothstep01(b.appear01);
      b.root.scale.set(b.baseScale.x, b.baseScale.y * eased, b.baseScale.z);

      // Порог “супертонкий дом”: чтобы не конфликтовал с другими мешами.
      // - на появлении: не показываем самый первый “0.00x” кадр
      // - на исчезновении: скрываем чуть раньше, чем доходим до совсем тонкого состояния
      const showEps = 0.02;
      const hideEps = 0.08;
      if (b.appear01 <= showEps) {
        b.root.visible = false;
      } else if (!b.targetVisible && b.appear01 <= hideEps) {
        b.root.visible = false;
      } else {
        b.root.visible = true;
      }
    }
  }
}

function _lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function _smoothstep01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

const _tmpMat = new THREE.Matrix4();
const _tmpFrustum = new THREE.Frustum();
const _tmpBox = new THREE.Box3();
const _tmpV = new THREE.Vector3();

function _boxOverlapsVerticalNdc(camera: THREE.Camera, worldBox: THREE.Box3, yMin: number, yMax: number): boolean {
  const min = worldBox.min;
  const max = worldBox.max;

  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;

  const xs = [min.x, max.x];
  const ys = [min.y, max.y];
  const zs = [min.z, max.z];

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        _tmpV.set(x, y, z).project(camera);
        if (!Number.isFinite(_tmpV.y) || !Number.isFinite(_tmpV.z)) continue;
        if (_tmpV.z < -1 || _tmpV.z > 1) continue;
        any = true;
        if (_tmpV.y < minY) minY = _tmpV.y;
        if (_tmpV.y > maxY) maxY = _tmpV.y;
      }
    }
  }

  if (!any) return false;
  return maxY >= yMin && minY <= yMax;
}

