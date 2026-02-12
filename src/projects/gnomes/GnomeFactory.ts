import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GNOMES_CONFIG } from "./config";
import { loadSkinnedCharacterFromGlb } from "./gltf/loadSkinnedCharacterFromGlb";
import { GnomeController } from "./GnomeController";
import { GnomeInstance } from "./GnomeInstance";

type FactoryRig = Awaited<ReturnType<typeof loadSkinnedCharacterFromGlb>>;

export class GnomeFactory {
  private _rig: FactoryRig | null = null;
  private _scale = 1;
  private _focusOffsetY = 0.8;
  private _normalizedHeight = 1;

  async load(): Promise<void> {
    if (this._rig) return;
    const rig = await loadSkinnedCharacterFromGlb(GNOMES_CONFIG.glbUrl);
    this._rig = rig;

    // Рассчитываем масштаб так, чтобы высота персонажа была примерно targetHeight.
    const srcHeight = Math.max(1e-6, rig.bounds.size.y);
    this._scale = GNOMES_CONFIG.targetHeight / srcHeight;
    this._normalizedHeight = GNOMES_CONFIG.targetHeight;

    // Фокус камеры обычно лучше смотреть чуть выше середины (голова/туловище).
    // Чтобы гном не упирался макушкой в верх экрана, целимся чуть выше центра.
    this._focusOffsetY = GNOMES_CONFIG.targetHeight * 0.72;
  }

  get focusOffsetY(): number {
    return this._focusOffsetY;
  }

  get normalizedHeight(): number {
    return this._normalizedHeight;
  }

  createInstance(opts?: { animationIndex?: number }): GnomeInstance {
    if (!this._rig) {
      throw new Error("GnomeFactory: сначала вызови load()");
    }

    // Важно: для skinned моделей обычный clone(true) ломает скелет — используем SkeletonUtils.
    const cloned = cloneSkeleton(this._rig.characterRoot) as THREE.Object3D;

    // Заворачиваем в контейнер — на него будем вешать позицию/вращение/скейл.
    const root = new THREE.Group();
    root.name = "Gnome";
    root.add(cloned);

    // Масштабирование.
    cloned.scale.multiplyScalar(this._scale);

    // Выравнивание: центр по XZ и \"ступни\" на y=0.
    this._centerAndGround(cloned);

    // Тени.
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // У skinned мешей bounds часто не совпадают с анимацией → ранний culling у краёв.
      // Для 3 гномов проще/надёжнее отключить culling полностью.
      mesh.frustumCulled = false;
    });

    const mixer = new THREE.AnimationMixer(cloned);
    const controller = new GnomeController({ root, mixer, clips: this._rig.animations });

    // Выбираем стартовую анимацию.
    const animIndex = opts?.animationIndex ?? 0;
    controller.playByIndex(animIndex, { fadeSec: 0.01 });

    return new GnomeInstance({ root, controller });
  }

  private _centerAndGround(target: THREE.Object3D): void {
    target.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(target);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Центрируем XZ.
    target.position.x -= center.x;
    target.position.z -= center.z;

    // На пол: minY -> 0.
    target.position.y -= box.min.y;
  }
}

