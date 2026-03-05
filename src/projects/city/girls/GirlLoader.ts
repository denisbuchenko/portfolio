import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadGltf } from "../three/loadGltf";
import { CITY_GIRLS } from "./girlsConfig";

export type GirlInstance = Readonly<{
  root: THREE.Group;
  model: THREE.Object3D;
  clips: THREE.AnimationClip[];
}>;

type _Rig = Readonly<{
  sourceRoot: THREE.Object3D;
  animations: THREE.AnimationClip[];
  sourceBounds: THREE.Box3;
}>;

export class GirlLoader {
  private _rig: _Rig | null = null;
  private _scale = 1;

  async load(): Promise<void> {
    if (this._rig) return;

    const gltf = await loadGltf(CITY_GIRLS.glbUrl);
    const sourceRoot = gltf.scene as THREE.Object3D;
    sourceRoot.updateMatrixWorld(true);

    const sourceBounds = new THREE.Box3().setFromObject(sourceRoot);
    const size = new THREE.Vector3();
    sourceBounds.getSize(size);
    const srcHeight = Math.max(1e-6, size.y);

    const mult = CITY_GIRLS.scale.multiplier ?? 1;
    if (CITY_GIRLS.scale.mode === "targetHeight") {
      const targetH = CITY_GIRLS.scale.targetHeight ?? 1.65;
      this._scale = (targetH / srcHeight) * mult;
    } else {
      this._scale = mult;
    }

    this._rig = {
      sourceRoot,
      animations: gltf.animations ?? [],
      sourceBounds
    };

    // eslint-disable-next-line no-console
    console.log("[CityGirl] loaded", {
      url: CITY_GIRLS.glbUrl,
      clips: (gltf.animations ?? []).map((a) => a.name),
      srcBoundsSize: size.toArray(),
      scaleMode: CITY_GIRLS.scale.mode,
      scaleMultiplier: mult,
      computedScale: this._scale
    });
  }

  createInstance(opts?: Readonly<{ name?: string }>): GirlInstance {
    if (!this._rig) throw new Error("GirlLoader: сначала вызови load()");

    const cloned = cloneSkeleton(this._rig.sourceRoot) as THREE.Object3D;

    const root = new THREE.Group();
    root.name = opts?.name ?? "GirlNpc";
    root.add(cloned);

    // Масштаб.
    cloned.scale.multiplyScalar(this._scale);

    // Выравнивание (по умолчанию выключено — как у Chel).
    if (CITY_GIRLS.align.centerXZ || CITY_GIRLS.align.groundToY0) {
      this._alignByBounds(cloned, { centerXZ: CITY_GIRLS.align.centerXZ, groundToY0: CITY_GIRLS.align.groundToY0 });
    }

    if (Math.abs(CITY_GIRLS.extraYOffset) > 1e-6) cloned.position.y += CITY_GIRLS.extraYOffset;

    // Тени / culling.
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });

    // eslint-disable-next-line no-console
    console.log("[CityGirl] instance created", {
      name: root.name,
      clips: this._rig.animations.map((a) => a.name),
      scale: this._scale
    });

    return { root, model: cloned, clips: this._rig.animations };
  }

  private _alignByBounds(target: THREE.Object3D, opts: Readonly<{ centerXZ: boolean; groundToY0: boolean }>): void {
    target.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(target);
    const center = new THREE.Vector3();
    box.getCenter(center);
    if (opts.centerXZ) {
      target.position.x -= center.x;
      target.position.z -= center.z;
    }
    if (opts.groundToY0) {
      target.position.y -= box.min.y;
    }
  }
}

