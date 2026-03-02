import * as THREE from "three";

type _PlayOpts = Readonly<{
  fadeSec?: number;
  loop?: THREE.AnimationActionLoopStyles;
  repetitions?: number;
  clampWhenFinished?: boolean;
  restart?: boolean;
}>;

type _Snapshot = Map<
  string,
  Readonly<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
  }>
>;

type _RigPartName = "body" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg";

type _RigPart = Readonly<{
  name: _RigPartName;
  group: THREE.AnimationObjectGroup;
  mixer: THREE.AnimationMixer;
  actionsByName: Map<string, THREE.AnimationAction>;
  hasBindingsByName: Map<string, boolean>;
  baseClipName: string | null;
  mutable: {
    activeName: string;
    snapshot: _Snapshot;
  };
}>;

export class GirlRigController {
  private _root: THREE.Object3D;
  private _clips: ReadonlyArray<THREE.AnimationClip>;
  private _parts: _RigPart[] = [];

  constructor(opts: Readonly<{ root: THREE.Object3D; clips: ReadonlyArray<THREE.AnimationClip> }>) {
    this._root = opts.root;
    this._clips = opts.clips;
    this._init();
  }

  dispose(): void {
    this._parts = [];
  }

  update(dtSec: number): void {
    const dt = Math.max(0, dtSec);
    for (const p of this._parts) p.mixer.update(dt);
  }

  get activeClipName(): string | null {
    return this._parts[0]?.mutable.activeName ?? null;
  }

  isActive(name: string): boolean {
    for (const p of this._parts) {
      if (p.mutable.activeName === name) return true;
    }
    return false;
  }

  /**
   * Дефолтная поза: для каждого риг-парта применяем его base (желательно `non`),
   * причём base хранится как "снапшот" локальных трансформов на время t=0.
   */
  applyDefaultPose(): void {
    for (const p of this._parts) this._applyBasePose(p);
    this._applyPoseSnapshot();
  }

  play(name: string, opts?: _PlayOpts): void {
    const fadeSec = Math.max(0, opts?.fadeSec ?? 0.2);
    const restart = opts?.restart ?? false;
    const loop = opts?.loop ?? THREE.LoopRepeat;
    const repetitions = opts?.repetitions ?? Infinity;
    const clamp = opts?.clampWhenFinished ?? false;

    for (const p of this._parts) {
      const has = p.hasBindingsByName.get(name) ?? false;
      if (!has) {
        // Если для парта нет треков — он должен удерживать base (а не "случайную" позу от предыдущего клипа).
        this._applyBasePose(p);
        p.mutable.activeName = "__base__";
        continue;
      }

      // Важно: перед запуском клипа нормализуем позу в base, чтобы отсутствующие треки
      // оставались в правильном дефолте, а не в A-pose/rest.
      this._applyBasePose(p);
      this._playPart(p, name, { fadeSec, restart, loop, repetitions, clampWhenFinished: clamp });
    }
  }

  fadeOutClip(name: string, sec: number): void {
    const s = Math.max(0.001, sec);
    for (const p of this._parts) {
      const a = p.actionsByName.get(name);
      if (!a) continue;
      a.fadeOut(s);
    }
  }

  private _init(): void {
    // Новый ассет: одна арматура (без Armature.00x). Чтобы не усложнять и не ловить рассинхрон,
    // делаем один парт на весь Armature (или на весь root как fallback).
    const armature = this._root.getObjectByName("Armature") ?? null;
    const parts: Array<Readonly<{ name: _RigPartName; objects: THREE.Object3D[] }>> = [
      { name: "body", objects: this._collectObjects(armature ?? this._root) }
    ];

    // 3) Создаём миксеры/экшены.
    this._parts = parts.map((p) => {
      const group = new THREE.AnimationObjectGroup();
      for (const o of p.objects) group.add(o);

      const mixer = new THREE.AnimationMixer(group);
      const actionsByName = new Map<string, THREE.AnimationAction>();
      const hasBindingsByName = new Map<string, boolean>();

      for (const clip of this._clips) {
        const a = mixer.clipAction(clip);
        a.enabled = true;
        a.setEffectiveWeight(0);
        a.setEffectiveTimeScale(1);
        a.play();
        a.paused = true;
        a.time = 0;
        actionsByName.set(clip.name, a);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bindingsLen = ((a as any)._propertyBindings?.length ?? 0) as number;
        hasBindingsByName.set(clip.name, bindingsLen > 0);
      }

      const baseClipName = this._resolveBaseClipName({ hasBindingsByName });

      const rigPart: _RigPart = {
        name: p.name,
        group,
        mixer,
        actionsByName,
        hasBindingsByName,
        baseClipName,
        mutable: { activeName: "__none__", snapshot: new Map() }
      };

      // Подготовим base: либо snap к клипу, либо снимем "rest" снапшот.
      this._applyBasePose(rigPart);
      rigPart.mutable.snapshot = this._captureSnapshot(p.objects);

      return rigPart;
    });
  }

  private _collectObjects(root: THREE.Object3D, opts?: Readonly<{ skipRoots?: Set<THREE.Object3D> }>): THREE.Object3D[] {
    const skip = opts?.skipRoots ?? null;
    const out: THREE.Object3D[] = [];
    root.traverse((o) => {
      out.push(o);
    });

    // Если skipRoots задан, traverse всё равно обходит детей: нужно вручную фильтровать поддеревья.
    if (skip && skip.size > 0) {
      const isUnderSkipped = (o: THREE.Object3D): boolean => {
        let cur: THREE.Object3D | null = o;
        while (cur && cur !== root) {
          if (skip.has(cur)) return true;
          cur = cur.parent;
        }
        return false;
      };
      return out.filter((o) => !isUnderSkipped(o));
    }

    return out;
  }

  private _resolveBaseClipName(partLike: Readonly<{ hasBindingsByName: Map<string, boolean> }>): string | null {
    // В новом ассете `non` удалён. Предпочтение: stay → love2 → love → Hello
    const pref = ["stay", "love2", "love", "Hello"];
    for (const n of pref) {
      if (partLike.hasBindingsByName.get(n) === true) return n;
    }
    return null;
  }

  private _applyBasePose(p: _RigPart): void {
    if (p.baseClipName) {
      this._snapPartToClip(p, p.baseClipName);
      p.mutable.activeName = p.baseClipName;
      return;
    }
    // Нет base клипа: применяем снапшот (если уже снят), иначе ничего не трогаем.
    if (p.mutable.snapshot.size > 0) {
      this._applySnapshot(p.mutable.snapshot);
      p.mutable.activeName = "__snapshot__";
    }
  }

  private _captureSnapshot(objects: ReadonlyArray<THREE.Object3D>): _Snapshot {
    const snap: _Snapshot = new Map();
    for (const o of objects) {
      snap.set(o.uuid, {
        position: o.position.clone(),
        quaternion: o.quaternion.clone(),
        scale: o.scale.clone()
      });
    }
    return snap;
  }

  private _applySnapshot(snap: _Snapshot): void {
    // Применяем по uuid (быстрее и без проблем с дублями имён).
    for (const [uuid, t] of snap) {
      const o = this._root.getObjectByProperty("uuid", uuid);
      if (!o) continue;
      o.position.copy(t.position);
      o.quaternion.copy(t.quaternion);
      o.scale.copy(t.scale);
    }
  }

  private _applyPoseSnapshot(): void {
    // delta > 0, чтобы миксер гарантированно “применил” треки в текущем времени.
    for (const p of this._parts) p.mixer.update(1e-6);
  }

  private _snapPartToClip(p: _RigPart, clipName: string): void {
    const a = p.actionsByName.get(clipName);
    if (!a) return;
    a.enabled = true;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(1);
    a.setEffectiveTimeScale(1);
    a.play();
    a.paused = true;
    a.time = 0;
    p.mixer.update(1e-6);
  }

  private _playPart(
    p: _RigPart,
    clipName: string,
    opts: _PlayOpts & Required<Pick<_PlayOpts, "loop" | "repetitions" | "clampWhenFinished">>
  ): void {
    const next = p.actionsByName.get(clipName);
    if (!next) return;

    const prev = p.actionsByName.get(p.mutable.activeName) ?? null;

    next.enabled = true;
    next.setLoop(opts.loop, opts.repetitions);
    next.clampWhenFinished = opts.clampWhenFinished;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    if (opts.restart) next.reset();
    next.paused = false;
    next.play();

    const fade = Math.max(0.001, opts.fadeSec ?? 0.2);
    if (prev && prev !== next) {
      prev.fadeOut(fade);
      next.fadeIn(fade);
    } else {
      next.fadeIn(fade);
    }

    p.mutable.activeName = clipName;
  }
}

