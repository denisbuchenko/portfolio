import * as THREE from "three";

export class GnomeController {
  private _root: THREE.Object3D;
  private _mixer: THREE.AnimationMixer;
  private _clips: THREE.AnimationClip[];
  private _actionsByKey = new Map<string, THREE.AnimationAction>();
  private _active: THREE.AnimationAction | null = null;

  constructor(opts: { root: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[] }) {
    this._root = opts.root;
    this._mixer = opts.mixer;
    this._clips = opts.clips;

    for (let i = 0; i < this._clips.length; i++) {
      const clip = this._clips[i];
      const key = this._clipKey(clip, i);
      this._actionsByKey.set(key, this._mixer.clipAction(clip));
    }
  }

  get root(): THREE.Object3D {
    return this._root;
  }

  /** Удобные трансформации — чтобы дальше расширять поведение. */
  get position(): THREE.Vector3 {
    return this._root.position;
  }
  get rotation(): THREE.Euler {
    return this._root.rotation;
  }
  get quaternion(): THREE.Quaternion {
    return this._root.quaternion;
  }
  get scale(): THREE.Vector3 {
    return this._root.scale;
  }

  setPosition(x: number, y: number, z: number): void {
    this._root.position.set(x, y, z);
  }

  setRotationEuler(x: number, y: number, z: number): void {
    this._root.rotation.set(x, y, z);
  }

  /**
   * Проиграть анимацию по индексу.
   * Если клипа нет — ничего не делает.
   */
  playByIndex(index: number, opts?: { fadeSec?: number }): void {
    if (this._clips.length === 0) return;
    const i = ((index % this._clips.length) + this._clips.length) % this._clips.length;
    const clip = this._clips[i];
    const key = this._clipKey(clip, i);
    this.playByKey(key, opts);
  }

  playByName(name: string, opts?: { fadeSec?: number }): void {
    // В GLB часто имена клипов уникальны — используем их как ключ.
    const action = this._actionsByKey.get(name);
    if (!action) return;
    this._playAction(action, opts?.fadeSec ?? 0.2);
  }

  playByKey(key: string, opts?: { fadeSec?: number }): void {
    const action = this._actionsByKey.get(key);
    if (!action) return;
    this._playAction(action, opts?.fadeSec ?? 0.2);
  }

  update(deltaSec: number): void {
    this._mixer.update(deltaSec);
  }

  private _playAction(action: THREE.AnimationAction, fadeSec: number): void {
    if (this._active === action) return;

    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();

    if (this._active) {
      this._active.crossFadeTo(action, Math.max(0, fadeSec), false);
    } else {
      action.fadeIn(Math.max(0, fadeSec));
    }

    this._active = action;
  }

  private _clipKey(clip: THREE.AnimationClip, index: number): string {
    return clip.name && clip.name.trim().length > 0 ? clip.name : `clip-${index}`;
  }
}

