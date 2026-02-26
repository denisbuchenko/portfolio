import * as THREE from "three";
import type { BikerAnimationController } from "../biker/BikerAnimationController";
import type { CityWorldController } from "../cityWorld/CityWorldController";
import type { GirlController } from "../girls/GirlController";
import type { GirlAnimationController } from "../girls/GirlAnimationController";
import { CITY_GIRLS } from "../girls/girlsConfig";
import type { TurnInput } from "../input/TurnInput";
import type { ScrollInput } from "../input/ScrollInput";

/**
 * Явная оркестрация игровой логики City (без UI/DOM):
 * - движение героя
 * - обновление мира (коллизии/окклюзия/видимость домов)
 * - логика NPC (девочки)
 *
 * CityApp остаётся “склейкой”: загрузка ассетов, сцена, камеры, UI и вызовы методов этого класса.
 */
export class CityGameLogic {
  private _turn: TurnInput;
  private _scroll: ScrollInput;

  private _world: CityWorldController;
  private _bikerRoot: THREE.Object3D;
  private _bikerAnim: BikerAnimationController | null;

  private _girls: ReadonlyArray<{
    controller: GirlController;
    anim: GirlAnimationController;
    goal: THREE.Object3D;
    homePos: THREE.Vector3;
    homeQ: THREE.Quaternion;
    state: { wasNear: boolean; goalReached: boolean };
    setGoalVisible: (visible: boolean) => void;
  }>;

  private _gameT = 0;
  private _forward = new THREE.Vector3(0, 0, -1);

  constructor(opts: Readonly<{
    turn: TurnInput;
    scroll: ScrollInput;
    world: CityWorldController;
    bikerRoot: THREE.Object3D;
    bikerAnim: BikerAnimationController | null;
    girls: ReadonlyArray<{
      controller: GirlController;
      anim: GirlAnimationController;
      goal: THREE.Object3D;
      homePos: THREE.Vector3;
      homeQ: THREE.Quaternion;
      state: { wasNear: boolean; goalReached: boolean };
      setGoalVisible: (visible: boolean) => void;
    }>;
  }>) {
    this._turn = opts.turn;
    this._scroll = opts.scroll;
    this._world = opts.world;
    this._bikerRoot = opts.bikerRoot;
    this._bikerAnim = opts.bikerAnim;
    this._girls = opts.girls;
  }

  reset(): void {
    this._gameT = 0;
    for (const g of this._girls) {
      g.state.wasNear = false;
      g.state.goalReached = false;
      g.setGoalVisible(false);
      g.controller.setWorldPosition(g.homePos);
      g.controller.setWorldQuaternion(g.homeQ);
      g.anim.resetToStay();
    }
  }

  /**
   * Тик режима playing.
   * Возвращает текущую позицию героя (удобно для камеры).
   */
  updatePlaying(params: Readonly<{ dtSec: number; speedIdleSec: number; speedRampSec: number; cruiseSpeed: number; turnRadiusStart: number; turnRadiusMin: number; turnRadiusEaseSec: number; pedalsMaxPlaybackSpeed: number; collisionActivation: { enableRadius: number; disableRadius: number } }>): THREE.Vector3 {
    const dt = Math.max(0, params.dtSec);
    this._gameT += dt;

    // Speed: idle -> ramp -> cruise.
    const speed01 = this._gameT <= params.speedIdleSec ? 0 : Math.min(1, (this._gameT - params.speedIdleSec) / Math.max(0.001, params.speedRampSec));
    const speed = params.cruiseSpeed * speed01;

    // Turn + animation.
    const input = this._turn.snapshot();
    this._bikerAnim?.updateTurn(input.turn);

    const sign = input.turn;
    const e01 = params.turnRadiusEaseSec <= 0 ? 1 : Math.min(1, input.holdSec / params.turnRadiusEaseSec);
    const radius = THREE.MathUtils.lerp(params.turnRadiusStart, params.turnRadiusMin, e01);
    if (sign !== 0 && speed > 0.001) {
      const omega = (speed / Math.max(0.001, radius)) * sign;
      this._bikerRoot.rotation.y += omega * dt;
    }

    // Move forward in XZ plane.
    this._forward.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this._bikerRoot.rotation.y);
    this._bikerRoot.position.addScaledVector(this._forward, speed * dt);

    // World collisions.
    this._world.updateCollisionActivation(this._bikerRoot.position, params.collisionActivation);
    // Важно: CityApp решает что делать при crash; здесь просто считаем столкновения.
    // (возврат collision flag можно добавить позже, если захотим полностью вынести crash flow).

    // Pedals.
    this._bikerAnim?.setPedalSpeed01(speed01, params.pedalsMaxPlaybackSpeed);

    // Girls (без камеры/окклюзии — это остаётся в CityApp/world).
    this._updateGirls(dt);

    // Scroll input не используется в playing, но держим зависимость явной.
    void this._scroll;

    return this._bikerRoot.position;
  }

  private _updateGirls(dtSec: number): void {
    const biker = this._bikerRoot.position;
    for (const g of this._girls) {
      g.anim.tick(dtSec);

      const girlPos = g.controller.instance.root.getWorldPosition(new THREE.Vector3());
      const dx = biker.x - girlPos.x;
      const dz = biker.z - girlPos.z;
      const distToGirl = Math.sqrt(dx * dx + dz * dz);
      const near = distToGirl <= CITY_GIRLS.hello.distance;

      const goalPos = g.goal.getWorldPosition(new THREE.Vector3());
      const gx = biker.x - goalPos.x;
      const gz = biker.z - goalPos.z;
      const distToGoal = Math.sqrt(gx * gx + gz * gz);

      if (!g.state.goalReached && distToGoal <= CITY_GIRLS.goal.reachRadius) {
        g.state.goalReached = true;
        g.setGoalVisible(false);
        g.anim.playLove({ restart: true });
      }

      if (!g.state.goalReached) {
        if (near) {
          g.controller.faceToWorld(biker, CITY_GIRLS.hello.faceSlerp01);
          if (g.anim.canStartHello()) {
            g.setGoalVisible(true);
            g.anim.playHello({ restart: true });
          }
        } else {
          g.setGoalVisible(false);
          g.controller.setWorldPosition(g.homePos);
          g.controller.setWorldQuaternion(g.homeQ);
          g.controller.instance.root.quaternion.slerp(g.homeQ, CITY_GIRLS.hello.returnSlerp01);
          if (g.state.wasNear) {
            g.anim.helloCooldownSec = 0;
            g.anim.playStay({ restart: true, fadeSec: CITY_GIRLS.hello.fadeSec });
          }
        }
        g.state.wasNear = near;
      }
    }
  }
}

