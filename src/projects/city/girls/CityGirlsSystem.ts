import * as THREE from "three";
import { CITY_GIRLS } from "./girlsConfig";
import { GirlLoader } from "./GirlLoader";
import { GirlController } from "./GirlController";
import { GirlAnimationController } from "./GirlAnimationController";

export type CityGirlRuntime = Readonly<{
  id: string;
  markerName: string;
  controller: GirlController;
  anim: GirlAnimationController;
  goal: THREE.Mesh;
  axes?: THREE.AxesHelper;
  bounds?: THREE.BoxHelper;
  helloRing?: THREE.Mesh;
  home: {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  };
  state: {
    mode: "stay" | "hello" | "love" | "love2";
    wasNear: boolean;
    goalReached: boolean;
  };
}>;

export class CityGirlsSystem {
  private _scene: THREE.Scene;

  private _girlLoader: GirlLoader | null = null;
  private _girls: CityGirlRuntime[] = [];

  constructor(opts: Readonly<{ scene: THREE.Scene }>) {
    this._scene = opts.scene;
  }

  get girls(): ReadonlyArray<CityGirlRuntime> {
    return this._girls;
  }

  /**
   * Инициализация девочек:
   * - грузим rig один раз
   * - ищем маркеры в сцене
   * - создаём инстансы и визуальные помощники
   */
  async init(opts: Readonly<{ cityRoot: THREE.Object3D }>): Promise<void> {
    this._girlLoader = new GirlLoader();
    await this._girlLoader.load();

    this._girls = [];

    const markers = this._resolveGirlMarkers(opts.cityRoot);

    // eslint-disable-next-line no-console
    console.log("[CityGirl] init", { requested: CITY_GIRLS.markerNames.slice(0), resolved: markers.map((m) => m.name) });

    for (let i = 0; i < markers.length; i++) {
      const markerName = markers[i].name;
      const marker = markers[i].object3d;

      // Маркер — пустышка. Прячем.
      marker.traverse((o) => {
        o.visible = false;
      });

      const markerPos = new THREE.Vector3();
      const markerQ = new THREE.Quaternion();
      marker.getWorldPosition(markerPos);
      marker.getWorldQuaternion(markerQ);

      // eslint-disable-next-line no-console
      console.log("[CityGirl] marker", { markerName, markerPos: markerPos.toArray() });

      const instance = this._girlLoader.createInstance({ name: `GirlNpc-${i + 1}` });
      this._scene.add(instance.root);

      // Ставим на карту: XZ из маркера, Y = 0 как у игрока.
      instance.root.position.set(markerPos.x, 0, markerPos.z);
      instance.root.quaternion.copy(markerQ);
      if (Math.abs(CITY_GIRLS.spawnExtraYawDeg) > 1e-6) {
        instance.root.rotation.y += (CITY_GIRLS.spawnExtraYawDeg * Math.PI) / 180;
      }

      const homePos = instance.root.position.clone();
      const homeQ = instance.root.quaternion.clone();

      // Debug helpers.
      let axes: THREE.AxesHelper | undefined;
      let bounds: THREE.BoxHelper | undefined;
      let helloRing: THREE.Mesh | undefined;
      if (CITY_GIRLS.debug.showAxes) {
        axes = new THREE.AxesHelper(2.2);
        axes.name = "GirlNpcAxes";
        instance.root.add(axes);
      }
      if (CITY_GIRLS.debug.showBounds) {
        bounds = new THREE.BoxHelper(instance.root, 0xff00ff);
        bounds.name = "GirlNpcBounds";
        bounds.update();
        this._scene.add(bounds);
      }
      if (CITY_GIRLS.debug.showHelloRadiusRing) {
        helloRing = this._createGirlHelloRadiusRing(CITY_GIRLS.hello.distance);
        helloRing.position.set(homePos.x, homePos.y + CITY_GIRLS.debug.helloRadiusRing.y, homePos.z);
        this._scene.add(helloRing);
      }

      const controller = new GirlController({ id: `girl-${i + 1}`, instance });

      const goal = this._createGirlGoalCylinder(instance.root);
      this._scene.add(goal);
      // Появляется только при приближении.
      goal.visible = false;

      this._girls.push({
        id: `girl-${i + 1}`,
        markerName,
        controller,
        anim: new GirlAnimationController(controller),
        goal,
        axes,
        bounds,
        helloRing,
        home: { position: homePos, quaternion: homeQ },
        state: {
          mode: "stay",
          wasNear: false,
          goalReached: false
        }
      });
    }
  }

  dispose(): void {
    for (const g of this._girls) {
      g.controller.dispose();
      g.goal.removeFromParent();
      g.axes?.removeFromParent();
      g.bounds?.removeFromParent();
      g.helloRing?.removeFromParent();
    }
    this._girls = [];
    this._girlLoader = null;
  }

  updateAlways(dtSec: number): void {
    for (const g of this._girls) {
      g.controller.update(dtSec);
      g.bounds?.update();
    }
  }

  resetToHome(reason: string): void {
    if (this._girls.length === 0) return;
    // eslint-disable-next-line no-console
    console.log("[CityGirl] reset", { reason });

    for (const g of this._girls) {
      // state
      g.state.mode = "stay";
      g.state.wasNear = false;
      g.state.goalReached = false;

      // transform
      g.controller.setWorldPosition(g.home.position);
      g.controller.setWorldQuaternion(g.home.quaternion);

      // visuals
      this.setGoalVisible(g, false);

      // animation
      g.anim.resetToStay();

      if (g.bounds) g.bounds.update();
    }
  }

  setGoalVisible(g: CityGirlRuntime, visible: boolean): void {
    // Полный контроль видимости в одном месте (для синхронизации с анимацией/состояниями).
    g.goal.visible = (CITY_GIRLS.debug.showGoalCylinders ?? true) && visible && !g.state.goalReached;
  }

  asGameLogicGirls(): ReadonlyArray<{
    controller: GirlController;
    anim: GirlAnimationController;
    goal: THREE.Object3D;
    homePos: THREE.Vector3;
    homeQ: THREE.Quaternion;
    state: { wasNear: boolean; goalReached: boolean };
    setGoalVisible: (visible: boolean) => void;
  }> {
    return this._girls.map((g) => ({
      controller: g.controller,
      anim: g.anim,
      goal: g.goal,
      homePos: g.home.position,
      homeQ: g.home.quaternion,
      state: g.state,
      setGoalVisible: (visible) => this.setGoalVisible(g, visible)
    }));
  }

  private _resolveGirlMarkers(root: THREE.Object3D): ReadonlyArray<{ name: string; object3d: THREE.Object3D }> {
    // 1) Пробуем точные имена из конфига.
    const exact: { name: string; object3d: THREE.Object3D }[] = [];
    const missing: string[] = [];
    for (const name of CITY_GIRLS.markerNames) {
      const o = root.getObjectByName(name);
      if (o) exact.push({ name, object3d: o });
      else missing.push(name);
    }
    if (exact.length > 0) return exact;

    // 2) Авто-поиск: в city.glb имена могут отличаться от city.gltf.
    const candidates: { name: string; object3d: THREE.Object3D; num: number }[] = [];
    const anyUserLike: string[] = [];

    root.traverse((o) => {
      const raw = (o.name ?? "").trim();
      if (!raw) return;
      const lower = raw.toLowerCase();
      if (lower.includes("user")) anyUserLike.push(raw);

      // "user 1" / "user1" / "user_1" / "users/user 1" etc.
      const m = /user[^0-9]*([0-9]+)/i.exec(raw);
      if (!m) return;
      const num = Number(m[1]);
      if (!Number.isFinite(num)) return;
      candidates.push({ name: raw, object3d: o, num });
    });

    candidates.sort((a, b) => a.num - b.num);

    // eslint-disable-next-line no-console
    console.warn("[CityGirl] exact markers not found; auto-scan", {
      missing,
      foundUserLikeCount: anyUserLike.length,
      foundUserLikeSample: anyUserLike.slice(0, 30),
      resolvedCount: candidates.length,
      resolvedNames: candidates.map((c) => c.name)
    });

    return candidates;
  }

  private _createGirlHelloRadiusRing(radius: number): THREE.Mesh {
    const t = Math.max(0.01, CITY_GIRLS.debug.helloRadiusRing.thickness);
    const inner = Math.max(0.001, radius - t);
    const outer = Math.max(inner + 0.001, radius);
    const geo = new THREE.RingGeometry(inner, outer, 48, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: CITY_GIRLS.debug.helloRadiusRing.color,
      transparent: true,
      opacity: CITY_GIRLS.debug.helloRadiusRing.opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "GirlHelloRadiusRing";
    mesh.rotation.x = -Math.PI / 2; // XY -> XZ
    mesh.renderOrder = 10;
    return mesh;
  }

  private _createGirlGoalCylinder(girlRoot: THREE.Object3D): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(CITY_GIRLS.goal.radius, CITY_GIRLS.goal.radius, CITY_GIRLS.goal.height, 32, 1, false);
    // Важно: цилиндр лежит очень близко к дороге, а у пола включён polygonOffset → depth может "съесть" цилиндр.
    // Поэтому делаем материал без depthTest и чуть ярче — это чисто UI/маркер цели.
    const mat = new THREE.MeshBasicMaterial({
      color: CITY_GIRLS.goal.color,
      transparent: true,
      opacity: CITY_GIRLS.goal.opacity,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "GirlGoalCylinder";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 20;

    const pos = girlRoot.getWorldPosition(new THREE.Vector3());
    const q = girlRoot.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
    mesh.position.copy(pos).addScaledVector(forward, CITY_GIRLS.goal.offsetForward);
    // Поднимаем так, чтобы цилиндр гарантированно был над поверхностью.
    mesh.position.y = pos.y + CITY_GIRLS.goal.y + CITY_GIRLS.goal.height * 0.5 + 0.03;

    mesh.visible = CITY_GIRLS.debug.showGoalCylinders;
    return mesh;
  }
}

