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

  private _actionsByName = new Map<string, THREE.AnimationAction>();
  private _active: THREE.AnimationAction | null = null;
  private _finishedQueue: string[] = [];

  private _tmpV3a = new THREE.Vector3();
  private _tmpV3b = new THREE.Vector3();
  private _tmpQ = new THREE.Quaternion();
  private _lookHelper = new THREE.Object3D();

  constructor(opts: Readonly<{ id: string; instance: GirlInstance }>) {
    this.id = opts.id;
    this.instance = opts.instance;

    for (const clip of this.instance.clips) {
      const a = this.instance.mixer.clipAction(clip);
      a.enabled = true;
      this._actionsByName.set(clip.name, a);
    }

    this.instance.mixer.addEventListener("finished", this._onFinished);

    // Дефолтная анимация.
    this.play(CITY_GIRLS.animations.stay, {
      fadeSec: 0.01,
      loop: THREE.LoopRepeat,
      repetitions: Infinity,
      clampWhenFinished: false
    });

    // Важно: применяем первый ключевой кадр сразу, чтобы не мигать bind/A-позой до первого update().
    this._applyPoseSnapshot();
  }

  dispose(): void {
    this.instance.mixer.removeEventListener("finished", this._onFinished);
    this._actionsByName.clear();
    this._finishedQueue = [];
    this.instance.root.removeFromParent();
  }

  update(dtSec: number): void {
    this.instance.mixer.update(Math.max(0, dtSec));
  }

  /** Забрать имена клипов, которые завершились с прошлого вызова. */
  consumeFinished(): string[] {
    if (this._finishedQueue.length === 0) return [];
    const res = this._finishedQueue.slice(0);
    this._finishedQueue.length = 0;
    return res;
  }

  get activeClipName(): string | null {
    return this._active ? this._active.getClip().name : null;
  }

  isActive(name: string): boolean {
    return this.activeClipName === name;
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

  play(name: string, opts?: _PlayOpts): void {
    const a = this._actionsByName.get(name);
    if (!a) {
      // eslint-disable-next-line no-console
      console.warn("[CityGirl] missing clip", { id: this.id, clip: name, available: [...this._actionsByName.keys()] });
      return;
    }

    const fadeSec = Math.max(0, opts?.fadeSec ?? 0.2);
    const restart = opts?.restart ?? false;
    const loop = opts?.loop ?? THREE.LoopRepeat;
    const repetitions = opts?.repetitions ?? Infinity;
    const clamp = opts?.clampWhenFinished ?? false;

    a.enabled = true;
    a.setLoop(loop, repetitions);
    a.clampWhenFinished = clamp;

    if (this._active === a && !restart) return;

    a.reset();
    a.setEffectiveWeight(1);
    a.setEffectiveTimeScale(1);
    a.play();

    if (this._active) {
      this._active.crossFadeTo(a, fadeSec, false);
    } else {
      a.fadeIn(fadeSec);
    }
    this._active = a;
  }

  private _applyPoseSnapshot(): void {
    // delta > 0, чтобы миксер гарантированно “применил” треки в текущем времени.
    this.instance.mixer.update(1e-6);
  }

  private _onFinished = (e: unknown): void => {
    const evt = e as { action?: THREE.AnimationAction };
    const action = evt.action;
    if (!action) return;
    const clipName = action.getClip().name;
    this._finishedQueue.push(clipName);
  };
}

