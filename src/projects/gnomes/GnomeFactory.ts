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
  private _sitByName = new Map<string, THREE.Object3D>();
  private _sitTemplates: { hor: THREE.Object3D; fi: THREE.Object3D; pi: THREE.Object3D } | null = null;

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

    this._sitByName.clear();
    this._sitTemplates = null;

    // 1) Пытаемся найти по именам (если GLB содержит "hor sit"/"fi sit"/"pi sit").
    rig.scene.traverse((o) => {
      const n = this._normalizeName(o.name);
      if (n === "hor sit" || n === "fi sit" || n === "pi sit") this._sitByName.set(n, o);
    });

    // 2) Если имён нет (как у тебя сейчас) — извлекаем "железобетонно" по геометрии/позиции.
    if (this._sitByName.size < 3) {
      const extracted = this._extractSitTemplatesByHeuristic(rig.characterRoot) ?? this._extractSitTemplatesByHeuristic(rig.scene);
      if (extracted) {
        this._sitTemplates = extracted;
        this._sitByName.set("hor sit", extracted.hor);
        this._sitByName.set("fi sit", extracted.fi);
        this._sitByName.set("pi sit", extracted.pi);
      }
    }
  }

  get focusOffsetY(): number {
    return this._focusOffsetY;
  }

  get normalizedHeight(): number {
    return this._normalizedHeight;
  }

  /**
   * Создаёт инстанс гнома.
   * Ветка (sit) передаётся как объект-шаблон из исходной сцены (см. getSitObjectByName),
   * а внутрь инстанса добавляется она как есть (поэтому getSitObjectByName возвращает клон).
   */
  createInstance(opts?: { characterKey?: GnomeCharacterKey; sitObject?: THREE.Object3D | null }): GnomeInstance {
    if (!this._rig) {
      throw new Error("GnomeFactory: сначала вызови load()");
    }

    // Важно: для skinned моделей обычный clone(true) ломает скелет — используем SkeletonUtils.
    // Клонируем только персонажа (characterRoot), иначе в каждый инстанс попадут все 3 ветки sit.
    const character = cloneSkeleton(this._rig.characterRoot) as THREE.Object3D;
    const characterKey = opts?.characterKey ?? this._defaultCharacterKey;
    const sitTemplate = opts?.sitObject ?? null;

    // Заворачиваем в контейнер — на него будем вешать позицию/вращение/скейл.
    const root = new THREE.Group();
    root.name = "Gnome";

    // Контент (персонаж + ветка) живёт в одном контейнере, чтобы центрирование/grounding
    // сдвигало их вместе и ветка оставалась \"под\" гномом.
    const content = new THREE.Group();
    content.name = "GnomeContent";
    root.add(content);

    // На некоторых экспортерах ветки могут оказаться внутри characterRoot.
    // Удаляем их из клона, чтобы гарантировать "в инстансе только 1 ветка".
    if (this._sitTemplates) {
      this._stripTopStaticMeshes(character, 3);
    }

    content.add(character);
    if (sitTemplate) {
      content.add(sitTemplate);
      this._applySitStyle(sitTemplate);
    }

    // Масштабирование.
    content.scale.multiplyScalar(this._scale);

    // Выравнивание считаем по персонажу, а двигаем контейнер content.
    this._centerAndGroundBy(character, content);

    // Невидимый коллайдер для \"уверенного\" клика по гному (а не по отдельным мешам).
    // Это особенно полезно, когда модель состоит из многих частей и по тонким элементам трудно попасть raycast'ом.
    content.updateMatrixWorld(true);
    const pickCollider = this._createPickCollider(character);
    pickCollider.name = "GnomePickCollider";
    root.add(pickCollider);

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

    const mixer = new THREE.AnimationMixer(character);
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

  getSitObjectByName(name: string): THREE.Object3D | null {
    const key = this._normalizeName(name);
    const template = this._sitByName.get(key) ?? null;
    // Важно: возвращаем клон, чтобы у каждого гнома был свой объект с уникальным uuid,
    // и чтобы один и тот же template не пытался иметь нескольких родителей.
    return template ? template.clone(true) : null;
  }

  private _applySitStyle(sitRoot: THREE.Object3D): void {
    const brown = new THREE.Color(0x6b4b2a);
    sitRoot.traverse((o) => {
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

  private _normalizeName(name: string): string {
    return (name ?? "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  /**
   * Простое решение, которое не зависит от имён внутри GLB:
   * - берём 3 самых "крупных" меша, которые НЕ skinned
   * - маппим их в fi/hor/pi по world position (как в export.gltf: fi далеко по Z, pi имеет +X)
   */
  private _extractSitTemplatesByHeuristic(
    root: THREE.Object3D,
  ): { hor: THREE.Object3D; fi: THREE.Object3D; pi: THREE.Object3D } | null {
    root.updateMatrixWorld(true);

    const candidates: Array<{ mesh: THREE.Mesh; score: number; worldPos: THREE.Vector3 }> = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;

      // score по world bbox — так учитываем scale/rotation/translation.
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const score = Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z);
      if (!Number.isFinite(score) || score <= 0) return;

      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);
      candidates.push({ mesh, score, worldPos });
    });

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 3);
    if (top.length < 3) return null;

    // fi sit — самая дальняя по Z.
    top.sort((a, b) => b.worldPos.z - a.worldPos.z);
    const fi = top[0].mesh;

    const rest = [top[1], top[2]];
    // pi sit — с большим X (обычно положительным), hor — оставшаяся.
    rest.sort((a, b) => b.worldPos.x - a.worldPos.x);
    const pi = rest[0].mesh;
    const hor = rest[1].mesh;

    return { hor, fi, pi };
  }

  private _stripTopStaticMeshes(root: THREE.Object3D, count: number): void {
    root.updateMatrixWorld(true);

    const items: Array<{ mesh: THREE.Mesh; score: number }> = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);
      const score = Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z);
      if (!Number.isFinite(score) || score <= 0) return;
      items.push({ mesh, score });
    });

    items.sort((a, b) => b.score - a.score);
    const toRemove = items.slice(0, Math.max(0, count)).map((x) => x.mesh);
    for (const m of toRemove) m.parent?.remove(m);
  }

}

