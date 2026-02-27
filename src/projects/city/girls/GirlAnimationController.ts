import * as THREE from "three";
import { CITY_GIRLS } from "./girlsConfig";
import type { GirlController } from "./GirlController";

/**
 * Узкоспециализированный слой "про анимации" девочки:
 * - семантические методы (stay/hello/love/love2)
 * - обработка завершений клипов (finished) и автоматические переходы
 *
 * Не отвечает за позицию/поворот/логические условия — это делает внешний оркестратор (CityApp/gameLogic).
 */
export class GirlAnimationController {
  private _girl: GirlController;
  private _helloCooldownSec = 0;
  private _helloTimeLeft: number | null = null;
  private _loveTimeLeft: number | null = null;

  constructor(girl: GirlController) {
    this._girl = girl;
  }

  /** Текущий кулдаун, чтобы hello не спамился. */
  get helloCooldownSec(): number {
    return this._helloCooldownSec;
  }

  set helloCooldownSec(v: number) {
    this._helloCooldownSec = Math.max(0, v);
  }

  tick(dtSec: number): Readonly<{ helloFinished: boolean; loveFinished: boolean }> {
    const dt = Math.max(0, dtSec);
    this._helloCooldownSec = Math.max(0, this._helloCooldownSec - dt);

    let helloFinished = false;
    let loveFinished = false;

    if (this._helloTimeLeft !== null) {
      this._helloTimeLeft = Math.max(0, this._helloTimeLeft - dt);
      if (this._helloTimeLeft <= 0) {
        this._helloTimeLeft = null;
        helloFinished = true;
        this._helloCooldownSec = CITY_GIRLS.hello.repeatDelaySec;
        this.playStay({ fadeSec: CITY_GIRLS.hello.fadeSec, restart: true });
      }
    }

    if (this._loveTimeLeft !== null) {
      this._loveTimeLeft = Math.max(0, this._loveTimeLeft - dt);
      if (this._loveTimeLeft <= 0) {
        this._loveTimeLeft = null;
        loveFinished = true;
        this.playLove2({ fadeSec: CITY_GIRLS.love.fadeSec, restart: true });
      }
    }

    return { helloFinished, loveFinished };
  }

  canStartHello(): boolean {
    return this._helloCooldownSec <= 0 && !this._girl.isActive(CITY_GIRLS.animations.hello);
  }

  playStay(opts?: Readonly<{ fadeSec?: number; restart?: boolean }>): void {
    this._girl.setFlVisible(false);
    this._helloTimeLeft = null;
    this._loveTimeLeft = null;
    this._girl.play(CITY_GIRLS.animations.stay, {
      fadeSec: opts?.fadeSec ?? 0.15,
      loop: THREE.LoopRepeat,
      repetitions: Infinity,
      restart: opts?.restart ?? false,
      clampWhenFinished: false
    });
  }

  playHello(opts?: Readonly<{ fadeSec?: number; restart?: boolean }>): void {
    this._girl.setFlVisible(false);
    this._loveTimeLeft = null;
    this._girl.play(CITY_GIRLS.animations.hello, {
      fadeSec: opts?.fadeSec ?? CITY_GIRLS.hello.fadeSec,
      loop: THREE.LoopOnce,
      repetitions: 1,
      restart: opts?.restart ?? true,
      clampWhenFinished: true
    });
    // Таймер конца клипа (надёжнее, чем finished events при нескольких armature mixers).
    const dur = this._girl.instance.clips.find((c) => c.name === CITY_GIRLS.animations.hello)?.duration ?? 0;
    this._helloTimeLeft = Math.max(0.001, dur);
  }

  playLove(opts?: Readonly<{ fadeSec?: number; restart?: boolean }>): void {
    // Базовый запуск love (one-shot). Переход в love2 произойдёт в tick по событию finished.
    this._helloTimeLeft = null;
    this._girl.setFlVisible(true);
    this._girl.play(CITY_GIRLS.animations.love, {
      fadeSec: opts?.fadeSec ?? CITY_GIRLS.love.fadeSec,
      loop: THREE.LoopOnce,
      repetitions: 1,
      restart: opts?.restart ?? true,
      clampWhenFinished: true
    });
    const dur = this._girl.instance.clips.find((c) => c.name === CITY_GIRLS.animations.love)?.duration ?? 0;
    this._loveTimeLeft = Math.max(0.001, dur);
  }

  playLove2(opts?: Readonly<{ fadeSec?: number; restart?: boolean }>): void {
    this._girl.setFlVisible(true);
    this._helloTimeLeft = null;
    this._loveTimeLeft = null;
    this._girl.play(CITY_GIRLS.animations.love2, {
      fadeSec: opts?.fadeSec ?? CITY_GIRLS.love.fadeSec,
      loop: THREE.LoopRepeat,
      repetitions: Infinity,
      restart: opts?.restart ?? false,
      clampWhenFinished: false
    });
  }

  /**
   * Явный метод, который делает "love → (после конца) love2 (loop)" и гарантирует,
   * что поза не развалится из-за отсутствующих треков в love2.
   */
  beginLoveSequence(): void {
    // Стабилизируем базовую позу (stay first keyframe уже применён в GirlController),
    // и гарантированно выключаем старый overlay.
    this._girl.setFlVisible(true);
    this.playLove({ fadeSec: CITY_GIRLS.love.fadeSec, restart: true });
  }

  resetToStay(): void {
    this._helloCooldownSec = 0;
    this._helloTimeLeft = null;
    this._loveTimeLeft = null;
    this.playStay({ fadeSec: 0.01, restart: true });
  }
}

