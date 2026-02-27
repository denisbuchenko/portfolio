import * as THREE from "three";
import { CITY_GIRLS } from "./girlsConfig";
import type { GirlInstance } from "./GirlLoader";

type _PlayOpts = Readonly<{
  fadeSec?: number;
  loop?: THREE.AnimationActionLoopStyles;
  repetitions?: number;
  clampWhenFinished?: boolean;
  restart?: boolean;
}>;

export class GirlController {
  readonly id: string;
  readonly instance: GirlInstance;

  private _rigs: Array<{
    root: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    actionsByName: Map<string, THREE.AnimationAction>;
    hasBindingsByName: Map<string, boolean>;
    activeName: string;
  }> = [];

  private _fl: THREE.Object3D | null = null;

  private _tmpV3a = new THREE.Vector3();
  private _tmpV3b = new THREE.Vector3();
  private _tmpQ = new THREE.Quaternion();
  private _lookHelper = new THREE.Object3D();

  constructor(opts: Readonly<{ id: string; instance: GirlInstance }>) {
    this.id = opts.id;
    this.instance = opts.instance;

    // Вспомогательный объект в ассете (public/city/Girl.gltf): "fl"
    // Должен быть видим только в love/love2.
    this._fl = this.instance.root.getObjectByName("fl") ?? null;
    if (this._fl) this._fl.visible = false;

    this._initRigs();
    this.applyDefaultNonPose();
    this.play(CITY_GIRLS.animations.stay, { fadeSec: 0.01, loop: THREE.LoopRepeat, repetitions: Infinity, restart: true });
  }

  dispose(): void {
    this._rigs = [];
    this.instance.root.removeFromParent();
  }

  update(dtSec: number): void {
    const dt = Math.max(0, dtSec);
    for (const r of this._rigs) r.mixer.update(dt);
  }

  get activeClipName(): string | null {
    return this._rigs[0]?.activeName ?? null;
  }

  isActive(name: string): boolean {
    for (const r of this._rigs) {
      if (r.activeName === name) return true;
    }
    return false;
  }

  setWorldPosition(pos: THREE.Vector3): void {
    this.instance.root.position.copy(pos);
  }

  setWorldQuaternion(q: THREE.Quaternion): void {
    this.instance.root.quaternion.copy(q);
  }

  setYawRad(yaw: number): void {
    this.instance.root.rotation.y = yaw;
  }

  faceToWorld(targetWorldPos: THREE.Vector3, slerp01: number): void {
    // Смотрим по XZ, чтобы не "кивать".
    const pos = this.instance.root.getWorldPosition(this._tmpV3a);
    this._tmpV3b.set(targetWorldPos.x, pos.y, targetWorldPos.z);

    this._lookHelper.position.copy(pos);
    this._lookHelper.lookAt(this._tmpV3b);
    this._lookHelper.getWorldQuaternion(this._tmpQ);

    // Компенсация forward оси модели.
    if (Math.abs(CITY_GIRLS.faceYawOffsetDeg) > 1e-6) {
      const yaw = (CITY_GIRLS.faceYawOffsetDeg * Math.PI) / 180;
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this._tmpQ.multiply(qYaw);
    }

    this.instance.root.quaternion.slerp(this._tmpQ, THREE.MathUtils.clamp(slerp01, 0, 1));
  }

  setFlVisible(visible: boolean): void {
    if (!this._fl) return;
    this._fl.visible = visible;
  }

  fadeOutClip(name: string, sec: number): void {
    const s = Math.max(0.001, sec);
    for (const r of this._rigs) {
      const a = r.actionsByName.get(name);
      if (!a) continue;
      a.fadeOut(s);
    }
  }

  /** Установить A-pose (bind pose) на всех skinned meshes и выключить веса всех actions. */
  applyAPose(): void {
    for (const r of this._rigs) {
      for (const [, a] of r.actionsByName) {
        a.enabled = true;
        a.setEffectiveWeight(0);
        a.paused = true;
        a.time = 0;
      }
      r.activeName = "__a_pose__";
    }

    this.instance.root.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.skeleton.pose();
    });
  }

  /** Дефолтная поза: для каждой арматуры включаем `non` (если он на неё влияет). */
  applyDefaultNonPose(): void {
    for (const r of this._rigs) {
      if (r.hasBindingsByName.get(CITY_GIRLS.animations.non) === true) {
        this._snapRigToClip(r, CITY_GIRLS.animations.non);
      } else {
        // Если non на эту арматуру не забиндился, хотя бы не оставляем её в A-pose:
        // ставим bind pose как fallback.
        this.instance.root.traverse((o) => {
          const sm = o as THREE.SkinnedMesh;
          if (!sm.isSkinnedMesh) return;
          sm.skeleton.pose();
        });
        r.activeName = "__bind_fallback__";
      }
    }
    this._applyPoseSnapshot();
  }

  play(name: string, opts?: _PlayOpts): void {
    const fadeSec = Math.max(0, opts?.fadeSec ?? 0.2);
    const restart = opts?.restart ?? false;
    const loop = opts?.loop ?? THREE.LoopRepeat;
    const repetitions = opts?.repetitions ?? Infinity;
    const clamp = opts?.clampWhenFinished ?? false;

    for (const r of this._rigs) {
      const has = r.hasBindingsByName.get(name) ?? false;
      if (has) {
        this._playRig(r, name, { fadeSec, restart, loop, repetitions, clampWhenFinished: clamp });
      } else {
        // Правило: если для арматуры не задана анимация — она должна быть в `non`, а не в A-pose.
        if (r.hasBindingsByName.get(CITY_GIRLS.animations.non) === true) {
          this._playRig(r, CITY_GIRLS.animations.non, { fadeSec: fadeSec, restart: false, loop: THREE.LoopOnce, repetitions: 1, clampWhenFinished: true });
        }
      }
    }
  }

  private _applyPoseSnapshot(): void {
    // delta > 0, чтобы миксер гарантированно “применил” треки в текущем времени.
    for (const r of this._rigs) r.mixer.update(1e-6);
  }

  private _initRigs(): void {
    const roots: THREE.Object3D[] = [];
    this.instance.root.traverse((o) => {
      const n = (o.name ?? "").trim();
      if (!n) return;
      if (n === "Armature" || n.startsWith("Armature.")) roots.push(o);
    });
    if (roots.length === 0) roots.push(this.instance.root);

    // Уникализируем.
    const uniq = new Set<string>();
    const uniqueRoots = roots.filter((r) => {
      const k = r.uuid;
      if (uniq.has(k)) return false;
      uniq.add(k);
      return true;
    });

    this._rigs = uniqueRoots.map((root) => {
      const mixer = new THREE.AnimationMixer(root);
      const actionsByName = new Map<string, THREE.AnimationAction>();
      const hasBindingsByName = new Map<string, boolean>();

      for (const clip of this.instance.clips) {
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

      return {
        root,
        mixer,
        actionsByName,
        hasBindingsByName,
        activeName: "__none__"
      };
    });
  }

  private _snapRigToClip(r: GirlController["_rigs"][number], clipName: string): void {
    const a = r.actionsByName.get(clipName);
    if (!a) return;
    a.enabled = true;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(1);
    a.setEffectiveTimeScale(1);
    a.play();
    a.paused = true;
    a.time = 0;
    r.activeName = clipName;
  }

  private _playRig(r: GirlController["_rigs"][number], clipName: string, opts: _PlayOpts & Required<Pick<_PlayOpts, "loop" | "repetitions" | "clampWhenFinished">>): void {
    const next = r.actionsByName.get(clipName);
    if (!next) return;

    const prev = r.actionsByName.get(r.activeName) ?? null;

    next.enabled = true;
    next.setLoop(opts.loop, opts.repetitions);
    next.clampWhenFinished = opts.clampWhenFinished;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    if (opts.restart) next.reset();
    next.paused = false;
    next.play();

    if (prev && prev !== next) {
      prev.crossFadeTo(next, Math.max(0.001, opts.fadeSec ?? 0.2), false);
    } else {
      next.fadeIn(Math.max(0.001, opts.fadeSec ?? 0.2));
    }
    r.activeName = clipName;
  }
}

