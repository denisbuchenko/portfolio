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

    const finished = this._girl.consumeFinished();
    for (const clipName of finished) {
      if (clipName === CITY_GIRLS.animations.hello) {
        helloFinished = true;
        this._helloCooldownSec = CITY_GIRLS.hello.repeatDelaySec;
        this.playStay({ fadeSec: CITY_GIRLS.hello.fadeSec, restart: true });
      } else if (clipName === CITY_GIRLS.animations.love) {
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
    this._girl.play(CITY_GIRLS.animations.hello, {
      fadeSec: opts?.fadeSec ?? CITY_GIRLS.hello.fadeSec,
      loop: THREE.LoopOnce,
      repetitions: 1,
      restart: opts?.restart ?? true,
      clampWhenFinished: true
    });
  }

  playLove(opts?: Readonly<{ fadeSec?: number; restart?: boolean }>): void {
    this._girl.setFlVisible(true);
    this._girl.play(CITY_GIRLS.animations.love, {
      fadeSec: opts?.fadeSec ?? CITY_GIRLS.love.fadeSec,
      loop: THREE.LoopOnce,
      repetitions: 1,
      restart: opts?.restart ?? true,
      clampWhenFinished: true
    });
  }

  playLove2(opts?: Readonly<{ fadeSec?: number; restart?: boolean }>): void {
    this._girl.setFlVisible(true);
    this._girl.play(CITY_GIRLS.animations.love2, {
      fadeSec: opts?.fadeSec ?? CITY_GIRLS.love.fadeSec,
      loop: THREE.LoopRepeat,
      repetitions: Infinity,
      restart: opts?.restart ?? false,
      clampWhenFinished: false
    });
  }

  resetToStay(): void {
    this._helloCooldownSec = 0;
    this._girl.consumeFinished();
    this.playStay({ fadeSec: 0.01, restart: true });
  }
}

