import * as THREE from "three";

export type GnomeCharacterKey = "hor" | "fi" | "pi";

export type GnomeActionConfig = {
  fadeInSec: number;
  fadeOutSec: number;
  weight: number;
  timeScale: number;
  repetitions: number;
  clampWhenFinished: boolean;
};

export type GnomeDefActionConfig = GnomeActionConfig & {
  enabled: boolean;
  intervalSec: number;
  intervalJitterSec: number;
  cycleRepetitions: number;
  variation: number;
};

export type GnomeAnimationProfile = {
  pose: GnomeActionConfig;
  hello: GnomeActionConfig;
  def: GnomeDefActionConfig;
};

const DEFAULT_ANIMATION_PROFILE: GnomeAnimationProfile = {
  pose: {
    fadeInSec: 0.08,
    fadeOutSec: 0.08,
    weight: 1,
    timeScale: 1,
    repetitions: 1,
    clampWhenFinished: true,
  },
  hello: {
    fadeInSec: 0.12,
    fadeOutSec: 0.14,
    weight: 1,
    timeScale: 1,
    repetitions: 1,
    clampWhenFinished: true,
  },
  def: {
    enabled: true,
    intervalSec: 4,
    intervalJitterSec: 0,
    cycleRepetitions: 1,
    variation: 0,
    fadeInSec: 0.18,
    fadeOutSec: 0.2,
    weight: 1,
    timeScale: 1,
    repetitions: 1,
    clampWhenFinished: true,
  },
};

export class GnomeController {
  private _root: THREE.Object3D;
  private _mixer: THREE.AnimationMixer;
  private _clips: THREE.AnimationClip[];
  private _actionsByKey = new Map<string, THREE.AnimationAction>();
  private _active: THREE.AnimationAction | null = null;

  private _poseAction: THREE.AnimationAction | null = null;
  private _helloAction: THREE.AnimationAction | null = null;
  private _defAction: THREE.AnimationAction | null = null;
  private _animationProfile: GnomeAnimationProfile = DEFAULT_ANIMATION_PROFILE;

  private _mode: "pose" | "hello" | "def" = "pose";
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
    this._resetDefCountdown();
  }

  setAnimationProfile(profile: GnomeAnimationProfile): void {
    this._animationProfile = profile;
    this._resetDefCountdown();
  }

  /** Базовая поза персонажа — должна быть активна \"по умолчанию\". */
  playPose(opts?: { fadeSec?: number }): void {
    if (!this._poseAction) return;
    this._mode = "pose";
    const poseCfg = this._animationProfile.pose;
    this._playOneShot(this._poseAction, {
      fadeSec: opts?.fadeSec ?? poseCfg.fadeInSec,
      timeScale: poseCfg.timeScale,
      weight: poseCfg.weight,
      repetitions: poseCfg.repetitions,
      clampWhenFinished: poseCfg.clampWhenFinished,
    });
  }

  /** Hello: проигрывается один раз при входе в диалог. */
  playHelloOnce(opts?: { fadeSec?: number }): void {
    if (!this._helloAction) return;
    this._mode = "hello";
    this._resetDefCountdown();
    const helloCfg = this._animationProfile.hello;
    this._playOneShot(this._helloAction, {
      fadeSec: opts?.fadeSec ?? helloCfg.fadeInSec,
      timeScale: helloCfg.timeScale,
      weight: helloCfg.weight,
      repetitions: helloCfg.repetitions,
      clampWhenFinished: helloCfg.clampWhenFinished,
    });
  }

  update(deltaSec: number): void {
    this._mixer.update(deltaSec);

    // def должен срабатывать только когда мы в \"позе\" (не во время hello/def).
    if (!this._defAction) return;
    if (!this._animationProfile.def.enabled) return;
    if (this._mode !== "pose") return;

    this._defCountdownSec -= deltaSec;
    if (this._defCountdownSec > 0) return;

    this._mode = "def";
    const defCfg = this._animationProfile.def;
    this._playOneShot(this._defAction, {
      fadeSec: defCfg.fadeInSec,
      timeScale: defCfg.timeScale,
      weight: defCfg.weight,
      repetitions: this._resolveDefRepetitions(defCfg),
      clampWhenFinished: defCfg.clampWhenFinished,
    });
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

  private _playOneShot(
    action: THREE.AnimationAction,
    opts: {
      fadeSec: number;
      timeScale: number;
      weight: number;
      repetitions: number;
      clampWhenFinished: boolean;
    },
  ): void {
    const repetitions = Math.max(1, Math.floor(opts.repetitions));
    action.enabled = true;
    action.reset();
    action.setLoop(repetitions > 1 ? THREE.LoopRepeat : THREE.LoopOnce, repetitions);
    action.clampWhenFinished = opts.clampWhenFinished;
    action.setEffectiveTimeScale(opts.timeScale);
    action.setEffectiveWeight(opts.weight);
    action.play();

    if (this._active && this._active !== action) {
      this._active.crossFadeTo(action, Math.max(0, opts.fadeSec), false);
    } else if (!this._active) {
      action.fadeIn(Math.max(0, opts.fadeSec));
    }

    this._active = action;
  }

  private _onMixerFinished = (e: THREE.Event): void => {
    const anyEvent = e as unknown as { action?: THREE.AnimationAction };
    const finished = anyEvent.action ?? null;
    if (!finished) return;

    if (this._helloAction && finished === this._helloAction) {
      this._mode = "pose";
      this._resetDefCountdown();
      this.playPose({ fadeSec: this._animationProfile.hello.fadeOutSec });
      return;
    }

    if (this._defAction && finished === this._defAction) {
      this._mode = "pose";
      this._resetDefCountdown();
      this.playPose({ fadeSec: this._animationProfile.def.fadeOutSec });
      return;
    }
  };

  private _resolveDefRepetitions(defCfg: GnomeDefActionConfig): number {
    const base = Math.max(1, Math.floor(defCfg.cycleRepetitions));
    const variation = Math.max(0, Math.floor(defCfg.variation));
    if (variation === 0) return base;
    return base + this._randomInt(0, variation);
  }

  private _randomInt(min: number, max: number): number {
    const from = Math.ceil(Math.min(min, max));
    const to = Math.floor(Math.max(min, max));
    return Math.floor(Math.random() * (to - from + 1)) + from;
  }

  private _resetDefCountdown(): void {
    const defCfg = this._animationProfile.def;
    const jitter = Math.max(0, defCfg.intervalJitterSec);
    const offset = jitter > 0 ? (Math.random() * 2 - 1) * jitter : 0;
    this._defCountdownSec = Math.max(0, defCfg.intervalSec + offset);
  }

  private _clipKey(clip: THREE.AnimationClip, index: number): string {
    return clip.name && clip.name.trim().length > 0 ? clip.name : `clip-${index}`;
  }
}

