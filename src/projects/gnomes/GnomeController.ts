import * as THREE from "three";

export type GnomeCharacterKey = "hor" | "fi" | "pi";

export class GnomeController {
  private _root: THREE.Object3D;
  private _mixer: THREE.AnimationMixer;
  private _clips: THREE.AnimationClip[];
  private _actionsByKey = new Map<string, THREE.AnimationAction>();
  private _active: THREE.AnimationAction | null = null;

  private _poseAction: THREE.AnimationAction | null = null;
  private _helloAction: THREE.AnimationAction | null = null;
  private _defAction: THREE.AnimationAction | null = null;

  private _mode: "pose" | "hello" | "def" = "pose";
  private _defCooldownSec = 4;
  private _defCountdownSec = 4;

  constructor(opts: { root: THREE.Object3D; mixer: THREE.AnimationMixer; clips: THREE.AnimationClip[] }) {
    this._root = opts.root;
    this._mixer = opts.mixer;
    this._clips = opts.clips;

    for (let i = 0; i < this._clips.length; i++) {
      const clip = this._clips[i];
      const key = this._clipKey(clip, i);
      this._actionsByKey.set(key, this._mixer.clipAction(clip));
    }

    this._mixer.addEventListener("finished", this._onMixerFinished);
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

  /**
   * Установить персонажа (hor/fi/pi) и подготовить связку поза/hello/def.
   * После вызова можно использовать playPose / playHelloOnce.
   */
  setCharacterKey(characterKey: GnomeCharacterKey): void {
    this._poseAction = this._actionsByKey.get(characterKey) ?? null;
    this._helloAction = this._actionsByKey.get(`${characterKey} hello`) ?? null;
    this._defAction = this._actionsByKey.get(`${characterKey} def`) ?? null;

    this._mode = "pose";
    this._defCountdownSec = this._defCooldownSec;
  }

  /** Базовая поза персонажа — должна быть активна \"по умолчанию\". */
  playPose(opts?: { fadeSec?: number }): void {
    if (!this._poseAction) return;
    this._mode = "pose";
    this._playOneShotClamped(this._poseAction, opts?.fadeSec ?? 0.01);
  }

  /** Hello: проигрывается один раз при входе в диалог. */
  playHelloOnce(opts?: { fadeSec?: number }): void {
    if (!this._helloAction) return;
    this._mode = "hello";
    // Чтобы hello не совпал с ближайшим def, перезапускаем таймер.
    this._defCountdownSec = this._defCooldownSec;
    this._playOneShotClamped(this._helloAction, opts?.fadeSec ?? 0.08);
  }

  update(deltaSec: number): void {
    this._mixer.update(deltaSec);

    // def должен срабатывать только когда мы в \"позе\" (не во время hello/def).
    if (!this._defAction) return;
    if (this._mode !== "pose") return;

    this._defCountdownSec -= deltaSec;
    if (this._defCountdownSec > 0) return;

    this._mode = "def";
    this._playOneShotClamped(this._defAction, 0.08);
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

  private _playOneShotClamped(action: THREE.AnimationAction, fadeSec: number): void {
    action.enabled = true;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.play();

    if (this._active && this._active !== action) {
      this._active.crossFadeTo(action, Math.max(0, fadeSec), false);
    } else if (!this._active) {
      action.fadeIn(Math.max(0, fadeSec));
    }

    this._active = action;
  }

  private _onMixerFinished = (e: THREE.Event): void => {
    const anyEvent = e as unknown as { action?: THREE.AnimationAction };
    const finished = anyEvent.action ?? null;
    if (!finished) return;

    if (this._helloAction && finished === this._helloAction) {
      this._mode = "pose";
      this._defCountdownSec = this._defCooldownSec;
      this.playPose({ fadeSec: 0.08 });
      return;
    }

    if (this._defAction && finished === this._defAction) {
      this._mode = "pose";
      this._defCountdownSec = this._defCooldownSec;
      this.playPose({ fadeSec: 0.08 });
      return;
    }
  };

  private _clipKey(clip: THREE.AnimationClip, index: number): string {
    return clip.name && clip.name.trim().length > 0 ? clip.name : `clip-${index}`;
  }
}

