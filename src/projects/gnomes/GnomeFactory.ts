import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { GNOMES_CONFIG } from "./config";
import { loadSkinnedCharacterFromGlb } from "./gltf/loadSkinnedCharacterFromGlb";
import { GnomeController, type GnomeCharacterKey } from "./GnomeController";
import { GnomeInstance } from "./GnomeInstance";

type FactoryRig = Awaited<ReturnType<typeof loadSkinnedCharacterFromGlb>>;

export class GnomeFactory {
  private _rig: FactoryRig | null = null;
  private _scale = 1;
  private _focusOffsetY = 0.8;
  private _normalizedHeight = 1;
  private _defaultCharacterKey: GnomeCharacterKey = "hor";

  async load(): Promise<void> {
    if (this._rig) return;
    const rig = await loadSkinnedCharacterFromGlb(GNOMES_CONFIG.glbUrl);
    this._rig = rig;

    // Рассчитываем масштаб так, чтобы высота персонажа была примерно targetHeight.
    const srcHeight = Math.max(1e-6, rig.bounds.size.y);
    this._scale = (GNOMES_CONFIG.gnomes.targetHeight / srcHeight) * GNOMES_CONFIG.gnomes.scaleMultiplier;
    this._normalizedHeight = GNOMES_CONFIG.gnomes.targetHeight;

    // Фокус камеры обычно лучше смотреть чуть выше середины (голова/туловище).
    // Чтобы гном не упирался макушкой в верх экрана, целимся чуть выше центра.
    this._focusOffsetY = GNOMES_CONFIG.gnomes.targetHeight * 0.72;
  }

  get focusOffsetY(): number {
    return this._focusOffsetY;
  }

  get normalizedHeight(): number {
    return this._normalizedHeight;
  }

  createInstance(opts?: { characterKey?: GnomeCharacterKey }): GnomeInstance {
    if (!this._rig) {
      throw new Error("GnomeFactory: сначала вызови load()");
    }

    // Важно: для skinned моделей обычный clone(true) ломает скелет — используем SkeletonUtils.
    // Клонируем всю сцену, потому что в ней есть отдельные объекты (ветки sit), которые не входят в characterRoot.
    const cloned = cloneSkeleton(this._rig.scene) as THREE.Object3D;
    const characterKey = opts?.characterKey ?? this._defaultCharacterKey;

    // Заворачиваем в контейнер — на него будем вешать позицию/вращение/скейл.
    const root = new THREE.Group();
    root.name = "Gnome";
    root.add(cloned);

    // Масштабирование.
    cloned.scale.multiplyScalar(this._scale);

    // Важно: выравнивание нужно считать по персонажу (skinned root),
    // иначе ветки sit (которые лежат в сцене рядом) будут ломать bounds и поднимать гнома.
    const characterRoot = this._findCharacterRoot(cloned);

    // Выравнивание: центр по XZ и \"ступни\" на y=0. Смещение применяем ко всей сцене,
    // чтобы ветка sit оставалась правильно привязанной к гному.
    this._centerAndGroundBy(characterRoot, cloned);

    // Невидимый коллайдер для \"уверенного\" клика по гному (а не по отдельным мешам).
    // Это особенно полезно, когда модель состоит из многих частей и по тонким элементам трудно попасть raycast'ом.
    const pickCollider = this._createPickCollider(characterRoot);
    pickCollider.name = "GnomePickCollider";
    root.add(pickCollider);

    // Ветки \"sit\": показываем ровно одну, нужную для персонажа, и красим в коричневый.
    this._setupSitObjects(cloned, characterKey);

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

    controller.setCharacterKey(characterKey);
    controller.playPose({ fadeSec: 0.01 });

    return new GnomeInstance({ root, controller });
  }

  private _createPickCollider(target: THREE.Object3D): THREE.Mesh {
    target.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(target);
    const size = new THREE.Vector3();
    box.getSize(size);

    // \"Капсула\" вокруг персонажа.
    const height = Math.max(0.001, size.y);
    const radius = Math.max(0.08, Math.max(size.x, size.z) * 0.6);
    const length = Math.max(0.001, height - radius * 2);

    const geo = new THREE.CapsuleGeometry(radius, length, 6, 10);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, height * 0.5, 0);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  private _centerAndGroundBy(boundsSource: THREE.Object3D, targetToMove: THREE.Object3D): void {
    boundsSource.updateMatrixWorld(true);
    targetToMove.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(boundsSource);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Центрируем XZ.
    targetToMove.position.x -= center.x;
    targetToMove.position.z -= center.z;

    // На пол: minY -> 0.
    targetToMove.position.y -= box.min.y;
  }

  private _setupSitObjects(target: THREE.Object3D, characterKey: GnomeCharacterKey): void {
    const wantName = `${characterKey} sit`;
    const sitNames = new Set(["hor sit", "fi sit", "pi sit"]);
    const brown = new THREE.Color(0x6b4b2a);

    // 1) Скрываем все ветки, кроме нужной. Делаем это по \"предку\" с именем sit,
    // потому что внутри glTF ветка может быть Group, а меши внутри имеют другие имена.
    target.traverse((o) => {
      const sitAncestor = this._findAncestorByNameSet(o, sitNames);
      if (!sitAncestor) return;
      o.visible = sitAncestor.name === wantName;
    });

    // 2) Перекрашиваем ТОЛЬКО нужную ветку (все меши внутри неё).
    const wantRoot = this._findFirstByName(target, wantName);
    if (!wantRoot) return;
    wantRoot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clonedMaterials = materials.map((m) => {
        const mat = (m as THREE.Material).clone() as THREE.Material & Record<string, unknown>;
        const anyMat = mat as unknown as { color?: THREE.Color; map?: THREE.Texture | null; needsUpdate?: boolean };

        if (anyMat.color) anyMat.color.copy(brown);
        // У веток в export.gltf часто нет заданного материала → GLTFLoader даёт дефолтный белый.
        // Убираем текстуры на всякий случай, чтобы цвет был чисто коричневый.
        if ("map" in anyMat) anyMat.map = null;
        if ("needsUpdate" in anyMat) anyMat.needsUpdate = true;
        return mat;
      });

      mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
    });
  }

  private _findFirstByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (found) return;
      if (o.name === name) found = o;
    });
    return found;
  }

  private _findAncestorByNameSet(o: THREE.Object3D, names: Set<string>): THREE.Object3D | null {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      if (names.has(cur.name)) return cur;
      cur = cur.parent;
    }
    return null;
  }

  private _findCharacterRoot(sceneRoot: THREE.Object3D): THREE.Object3D {
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    sceneRoot.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) skinnedMeshes.push(sk);
    });
    if (skinnedMeshes.length === 0) return sceneRoot;

    const first = skinnedMeshes[0];
    const firstChain = this._ancestorChain(first, sceneRoot);
    const common = new Set(firstChain);

    for (let i = 1; i < skinnedMeshes.length; i++) {
      const chain = this._ancestorChain(skinnedMeshes[i], sceneRoot);
      const chainSet = new Set(chain);
      for (const node of Array.from(common)) {
        if (!chainSet.has(node)) common.delete(node);
      }
    }

    for (const node of firstChain) {
      if (common.has(node)) return node;
    }

    return sceneRoot;
  }

  private _ancestorChain(o: THREE.Object3D, stopAt: THREE.Object3D): THREE.Object3D[] {
    const chain: THREE.Object3D[] = [];
    let cur: THREE.Object3D | null = o;
    while (cur) {
      chain.push(cur);
      if (cur === stopAt) break;
      cur = cur.parent;
    }
    return chain;
  }
}

