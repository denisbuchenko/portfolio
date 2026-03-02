import * as THREE from "three";
import { CITY_GIRLS } from "./girlsConfig";
import type { GirlInstance } from "./GirlLoader";
import { GirlRigController } from "./GirlRigController";

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

  private _rig: GirlRigController;

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

    this._rig = new GirlRigController({ root: this.instance.root, clips: this.instance.clips });
    this.applyDefaultNonPose();
    this.play(CITY_GIRLS.animations.stay, { fadeSec: 0.01, loop: THREE.LoopRepeat, repetitions: Infinity, restart: true });
  }

  dispose(): void {
    this._rig.dispose();
    this.instance.root.removeFromParent();
  }

  update(dtSec: number): void {
    this._rig.update(dtSec);
  }

  get activeClipName(): string | null {
    return this._rig.activeClipName;
  }

  isActive(name: string): boolean {
    return this._rig.isActive(name);
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
    this._rig.fadeOutClip(name, sec);
  }

  /** Установить A-pose (bind pose) на всех skinned meshes и выключить веса всех actions. */
  applyAPose(): void {
    // В этом ассете девочка собрана из rigid-частей под костями (без skinned mesh),
    // поэтому "A-pose" как skeleton.pose здесь не применим.
    // Оставляем метод как "hard reset": удерживаем базовую позу.
    this.applyDefaultNonPose();
  }

  /** Дефолтная поза: для каждой арматуры включаем `non` (если он на неё влияет). */
  applyDefaultNonPose(): void {
    this._rig.applyDefaultPose();
  }

  play(name: string, opts?: _PlayOpts): void {
    this._rig.play(name, opts);
  }
}

