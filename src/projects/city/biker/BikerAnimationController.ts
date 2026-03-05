import * as THREE from "three";

export type BikerTurnConfig = Readonly<{
  fadeInSec: number;
  returnToNeutralSec: number;
  reverseSnapSec: number;
}>;

export class BikerAnimationController {
  private _mixer: THREE.AnimationMixer;

  private _pedalActions: THREE.AnimationAction[] = [];

  private _turnLeftActions: THREE.AnimationAction[] = [];
  private _turnRightActions: THREE.AnimationAction[] = [];

  private _turnPending: -1 | 1 | null = null;
  private _turnActive: -1 | 1 = -1; // какой набор клипов сейчас “активен” по весу (по дефолту right)
  private _turnPhase: "completed" | "forward" | "hold" | "reverse" = "completed";

  private _turnConfig: BikerTurnConfig;

  constructor(opts: Readonly<{ root: THREE.Object3D; clips: THREE.AnimationClip[]; pedalClipNames: readonly string[]; turnLeftNames: readonly string[]; turnRightNames: readonly string[]; turn: BikerTurnConfig }>) {
    this._mixer = new THREE.AnimationMixer(opts.root);
    this._turnConfig = opts.turn;

    this._pedalActions = this._createPedalActions(opts.clips, opts.pedalClipNames);
    this._turnLeftActions = this._createTurnActions(opts.clips, opts.turnLeftNames);
    this._turnRightActions = this._createTurnActions(opts.clips, opts.turnRightNames);
    this._initTurnActions();

    // Важно: применяем первый ключевой кадр right/right armR/right armL сразу,
    // чтобы не мигать bind/A-позой до первого update().
    this._applyPoseSnapshot();
  }

  update(dtSec: number): void {
    this._mixer.update(Math.max(0, dtSec));
  }

  /**
   * Синхронизировать скорость педалей (0..1).
   * `maxPlaybackSpeed` — максимальная скорость клипа при speed01=1.
   */
  setPedalSpeed01(speed01: number, maxPlaybackSpeed: number): void {
    const k = Math.max(0, speed01) * Math.max(0, maxPlaybackSpeed);
    // Когда speed01=0, педали не должны "держать" первый кадр и портить дефолтную позу.
    const w = THREE.MathUtils.clamp(speed01, 0, 1);
    for (const a of this._pedalActions) {
      a.setEffectiveWeight(w);
      a.setEffectiveTimeScale(k);
    }
  }

  /**
   * Обновить FSM поворота руля/тела.
   * requested: 1=left, -1=right, 0=none
   */
  updateTurn(requested: -1 | 0 | 1): void {
    const want: -1 | 1 | null = requested === 0 ? null : requested;

    // 1) Стадия reverse: ждём пока вернёмся на 0, и только потом можем переключать сторону.
    if (this._turnPhase === "reverse") {
      const actions = this._getTurnActions(this._turnActive);
      if (this._areActionsAtStart(actions)) {
        for (const a of actions) {
          a.paused = true;
          a.time = 0;
        }
        this._turnPhase = "completed";

        const pending = this._turnPending;
        this._turnPending = null;
        if (pending !== null) {
          this._turnActive = pending;
          this._setTurnWeights(pending);
          this._startTurnForward(pending, this._turnConfig.fadeInSec);
          this._turnPhase = "forward";
        }
      }

      // Исключение: если во время reverse нажали ту же сторону — разворачиваемся обратно и докручиваем до конца.
      if (want !== null && want === this._turnActive) {
        this._turnPending = null;
        this._startTurnForward(this._turnActive, this._turnConfig.reverseSnapSec);
        this._turnPhase = "forward";
      } else if (want !== null && want !== this._turnActive) {
        // Противоположная сторона — просто ждём конца reverse и держим в pending.
        this._turnPending = want;
      }
      return;
    }

    // 2) completed: стоим на первом ключе, анимация “завершена”.
    if (this._turnPhase === "completed") {
      if (want === null) return;
      if (this._turnActive !== want) {
        this._turnActive = want;
        this._setTurnWeights(want);
        this._snapTurnToStart(want);
      }
      this._startTurnForward(want, this._turnConfig.fadeInSec);
      this._turnPhase = "forward";
      return;
    }

    // 3) forward/hold: анимация “незавершена” (либо идём вперёд, либо залипли в конце).
    if (this._turnPhase === "forward") {
      const actions = this._getTurnActions(this._turnActive);
      if (this._areActionsAtEnd(actions)) {
        for (const a of actions) {
          a.paused = true;
          a.time = a.getClip().duration;
        }
        this._turnPhase = "hold";
      }
    }

    // Отпустили — reverse назад до 0.
    if (want === null) {
      this._startTurnReturn(this._turnActive, this._turnConfig.returnToNeutralSec);
      this._turnPhase = "reverse";
      return;
    }

    // Нажали другую сторону, пока “незавершено”: сначала reverse до 0, потом новое.
    if (want !== this._turnActive) {
      this._turnPending = want;
      this._startTurnReturn(this._turnActive, this._turnConfig.reverseSnapSec);
      this._turnPhase = "reverse";
      return;
    }
  }

  reset(): void {
    // Педали — в ноль.
    for (const a of this._pedalActions) {
      a.stop();
      a.enabled = true;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.time = 0;
      a.paused = false;
      a.play();
      a.setEffectiveWeight(0);
      a.setEffectiveTimeScale(0.0001);
    }

    // Повороты — вернуть на старт.
    this._turnPending = null;
    this._turnActive = -1;
    this._turnPhase = "completed";
    for (const a of this._turnLeftActions) {
      a.stop();
      a.enabled = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.time = 0;
      a.paused = true;
      a.play();
      a.setEffectiveWeight(0);
      a.setEffectiveTimeScale(1);
    }
    for (const a of this._turnRightActions) {
      a.stop();
      a.enabled = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.time = 0;
      a.paused = true;
      a.play();
      a.setEffectiveWeight(1);
      a.setEffectiveTimeScale(1);
    }
    this._mixer.update(1e-6);
  }

  private _applyPoseSnapshot(): void {
    // Педали на старте не должны мешать дефолтной позе.
    for (const a of this._pedalActions) a.setEffectiveWeight(0);
    // Right-поза: right + arms, на первом ключе.
    this._setTurnWeights(-1);
    this._snapTurnToStart(-1);
    // delta > 0, чтобы миксер гарантированно “применил” треки в текущем времени.
    this._mixer.update(1e-6);
  }

  private _createPedalActions(clips: THREE.AnimationClip[], pedalClipNames: readonly string[]): THREE.AnimationAction[] {
    const actions: THREE.AnimationAction[] = [];
    for (const name of pedalClipNames) {
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const a = this._mixer.clipAction(clip);
      a.enabled = true;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      // Вес задаём через `setPedalSpeed01`, чтобы speed01=0 не портил позу.
      a.setEffectiveWeight(0);
      a.setEffectiveTimeScale(0.0001);
      actions.push(a);
    }
    return actions;
  }

  private _createTurnActions(clips: THREE.AnimationClip[], names: readonly string[]): THREE.AnimationAction[] {
    const actions: THREE.AnimationAction[] = [];
    for (const name of names) {
      if (!name) continue;
      const clip = clips.find((c) => c.name === name);
      if (!clip) continue;
      const a = this._mixer.clipAction(clip);
      a.enabled = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(0);
      a.play();
      actions.push(a);
    }
    return actions;
  }

  /**
   * Анимация поворота должна быть “включена” с самого начала, но стоять на первом ключевом кадре.
   * По дефолту активен набор `right`.
   */
  private _initTurnActions(): void {
    // Ставим оба набора на первый кадр и паузим.
    for (const a of [...this._turnLeftActions, ...this._turnRightActions]) {
      a.enabled = true;
      a.clampWhenFinished = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.play(); // чтобы action был “живой” в миксере
      a.paused = true;
      a.time = 0;
      a.setEffectiveWeight(0);
      a.setEffectiveTimeScale(1);
    }

    // По умолчанию “включены right”, но всё равно на первом ключе.
    this._turnActive = -1;
    this._turnPhase = "completed";
    this._turnPending = null;
    this._setTurnWeights(-1);
  }

  private _startTurnForward(dir: -1 | 1, travelSec: number): void {
    const actions = this._getTurnActions(dir);
    for (const a of actions) {
      const d = a.getClip().duration;
      a.enabled = true;
      a.clampWhenFinished = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.paused = false;
      a.timeScale = this._timeScaleFor(d, travelSec);
      a.play();
    }
  }

  private _startTurnReturn(dir: -1 | 1, travelSec: number): void {
    const actions = this._getTurnActions(dir);
    for (const a of actions) {
      const d = a.getClip().duration;
      a.enabled = true;
      a.clampWhenFinished = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.paused = false;
      a.play();
      // начинаем “с текущего положения”: если мы в hold — это d, если в forward — это уже накопленное время
      if (a.time > d) a.time = d;
      a.timeScale = -this._timeScaleFor(d, travelSec);
    }
  }

  private _areActionsAtStart(actions: readonly THREE.AnimationAction[]): boolean {
    for (const a of actions) {
      if (a.time > 0.001) return false;
    }
    return true;
  }

  private _areActionsAtEnd(actions: readonly THREE.AnimationAction[]): boolean {
    for (const a of actions) {
      const d = a.getClip().duration;
      if (a.time < d - 0.001) return false;
    }
    return true;
  }

  private _getTurnActions(dir: -1 | 1): THREE.AnimationAction[] {
    return dir === 1 ? this._turnLeftActions : this._turnRightActions;
  }

  private _setTurnWeights(dir: -1 | 1): void {
    const leftW = dir === 1 ? 1 : 0;
    const rightW = dir === -1 ? 1 : 0;
    for (const a of this._turnLeftActions) a.setEffectiveWeight(leftW);
    for (const a of this._turnRightActions) a.setEffectiveWeight(rightW);
  }

  private _snapTurnToStart(dir: -1 | 1): void {
    const actions = this._getTurnActions(dir);
    for (const a of actions) {
      a.paused = true;
      a.time = 0;
    }
  }

  private _timeScaleFor(clipDurationSec: number, travelSec: number): number {
    const d = Math.max(1e-6, clipDurationSec);
    const t = Math.max(1e-6, travelSec);
    return d / t;
  }
}

