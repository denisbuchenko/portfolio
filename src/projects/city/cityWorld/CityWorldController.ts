import * as THREE from "three";
import { buildMeshBvh, disposeMeshBvh } from "../three/meshBvh";
import { BuildingsIndex } from "../world/BuildingsIndex";
import { cloneOcclusionMaterial, setMaterialOpacity } from "./occlusionMaterial";

export type CityWorldOcclusionConfig = Readonly<{
  buildingOpacity: number;
  fadeSec: number;
}>;

export type CityWorldCollisionActivation = Readonly<{
  enableRadius: number;
  disableRadius: number;
}>;

export class CityWorldController {
  private _buildings = new BuildingsIndex();

  private _allBuildingMeshes: THREE.Mesh[] = [];
  private _activeBuildingMeshes: THREE.Mesh[] = [];
  private _boundaryWallRoot: THREE.Group | null = null;
  private _boundaryWallMeshes: THREE.Mesh[] = [];
  private _activeBuildings = new Set<THREE.Object3D>();
  private _meshToBuilding = new Map<string, { root: THREE.Object3D; meshes: THREE.Mesh[] }>();

  private _occlusionStates = new Map<
    THREE.Object3D,
    {
      meshes: THREE.Mesh[];
      from: number;
      current: number;
      target: number;
      t01: number;
    }
  >();

  private _raycaster = new THREE.Raycaster();
  private _tmpV3a = new THREE.Vector3();
  private _tmpV3b = new THREE.Vector3();

  // collision tip ray
  private _prevTip = new THREE.Vector3();
  private _tip = new THREE.Vector3();
  private _tipLocal = new THREE.Vector3(0, 0.35, 1.2);

  constructor() {
    // BVH raycast использует это свойство.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this._raycaster as any).firstHitOnly = true;
  }

  dispose(): void {
    // Сбрасываем BVH на активных мешах.
    for (const m of this._activeBuildingMeshes) disposeMeshBvh(m);
    this._activeBuildingMeshes = [];
    this._activeBuildings.clear();
    for (const m of this._boundaryWallMeshes) disposeMeshBvh(m);
    this._boundaryWallMeshes = [];
    this._boundaryWallRoot?.removeFromParent();
    this._boundaryWallRoot = null;

    // Восстанавливаем материалы, если какие-то были в состоянии окклюзии.
    for (const [, st] of this._occlusionStates) {
      for (const mesh of st.meshes) this._restoreMeshOcclusion(mesh);
    }
    this._occlusionStates.clear();
    this._meshToBuilding.clear();
    this._allBuildingMeshes = [];
  }

  get buildingsIndex(): BuildingsIndex {
    return this._buildings;
  }

  /** Настроить локальный оффсет "tip" для коллизий (координаты в локальной системе bikerRoot). */
  setBikerTipLocalOffset(offset: Readonly<{ x: number; y: number; z: number }>): void {
    this._tipLocal.set(offset.x, offset.y, offset.z);
  }

  buildFromCityRoot(cityRoot: THREE.Object3D): void {
    this._buildings.buildFromCityScene(cityRoot);
    this._indexBuildingMeshes();
  }

  initBoundaryWalls(params: Readonly<{
    scene: THREE.Object3D;
    worldBox: THREE.Box3;
    config: {
      enabled: boolean;
      height: number;
      thickness: number;
      inset: number;
      color: number;
    };
  }>): void {
    for (const m of this._boundaryWallMeshes) disposeMeshBvh(m);
    this._boundaryWallMeshes = [];
    this._boundaryWallRoot?.removeFromParent();
    this._boundaryWallRoot = null;

    if (!params.config.enabled) return;

    const height = Math.max(0.2, params.config.height);
    const thickness = Math.max(0.1, params.config.thickness);
    const inset = Math.max(0, params.config.inset);

    const minX = params.worldBox.min.x - inset;
    const maxX = params.worldBox.max.x + inset;
    const minZ = params.worldBox.min.z - inset;
    const maxZ = params.worldBox.max.z + inset;
    const spanX = Math.max(0.1, maxX - minX);
    const spanZ = Math.max(0.1, maxZ - minZ);
    const y = height * 0.5;

    const root = new THREE.Group();
    root.name = "CityBoundaryWalls";

    const material = new THREE.MeshStandardMaterial({
      color: params.config.color,
      roughness: 0.95,
      metalness: 0.02
    });

    const walls = [
      this._createBoundaryWall({
        width: spanX + thickness * 2,
        height,
        depth: thickness,
        x: (minX + maxX) * 0.5,
        y,
        z: minZ - thickness * 0.5,
        material,
        name: "CityBoundaryWallNorth"
      }),
      this._createBoundaryWall({
        width: spanX + thickness * 2,
        height,
        depth: thickness,
        x: (minX + maxX) * 0.5,
        y,
        z: maxZ + thickness * 0.5,
        material,
        name: "CityBoundaryWallSouth"
      }),
      this._createBoundaryWall({
        width: thickness,
        height,
        depth: spanZ,
        x: minX - thickness * 0.5,
        y,
        z: (minZ + maxZ) * 0.5,
        material,
        name: "CityBoundaryWallWest"
      }),
      this._createBoundaryWall({
        width: thickness,
        height,
        depth: spanZ,
        x: maxX + thickness * 0.5,
        y,
        z: (minZ + maxZ) * 0.5,
        material,
        name: "CityBoundaryWallEast"
      })
    ];

    for (const wall of walls) {
      root.add(wall);
      buildMeshBvh(wall);
      this._boundaryWallMeshes.push(wall);
    }

    params.scene.add(root);
    this._boundaryWallRoot = root;
  }

  setInitialBuildingsHidden(): void {
    for (const b of this._buildings.buildings) {
      b.targetVisible = false;
      b.appear01 = 0;
      b.root.visible = false;
      b.root.scale.set(b.baseScale.x, 0, b.baseScale.z);
    }
  }

  /**
   * Overview-режим: узкое окно видимости по вертикальным границам.
   * `edgeInsetNdc` — отступ от верх/низ экрана (NDC).
   */
  updateOverviewVisibility(camera: THREE.Camera, edgeInsetNdc: number, dtSec: number): void {
    this._buildings.setVisibilityByVerticalBounds(camera, edgeInsetNdc);
    this._buildings.updateAppear(dtSec, 0.35);
  }

  /** Игровой режим: frustum visibility. */
  updatePlayingVisibility(camera: THREE.Camera, dtSec: number): void {
    this._buildings.setVisibilityByCamera(camera, 0);
    this._buildings.updateAppear(dtSec, 0.25);
  }

  updateCollisionActivation(bikerPos: THREE.Vector3, rule: CityWorldCollisionActivation): void {
    const enableR = rule.enableRadius;
    const disableR = rule.disableRadius;

    for (const b of this._buildings.buildings) {
      const dx = b.center.x - bikerPos.x;
      const dz = b.center.z - bikerPos.z;
      const d = Math.hypot(dx, dz);
      const isActive = this._activeBuildings.has(b.root);
      if (!isActive && d <= enableR) {
        this._activeBuildings.add(b.root);
        for (const m of b.meshes) {
          buildMeshBvh(m);
          this._activeBuildingMeshes.push(m);
        }
      } else if (isActive && d >= disableR) {
        this._activeBuildings.delete(b.root);
        for (const m of b.meshes) disposeMeshBvh(m);
        // rebuild active list (редко, но просто)
        this._activeBuildingMeshes = this._activeBuildingMeshes.filter((m) => b.meshes.indexOf(m) < 0);
      }
    }
  }

  /**
   * Проверить коллизию по траектории tip (между кадрами).
   * Возвращает true, если есть hit.
   */
  checkCollision(bikerRoot: THREE.Object3D): boolean {
    const collisionMeshes = this._getCollisionMeshes();
    if (collisionMeshes.length === 0) return false;

    bikerRoot.updateMatrixWorld(true);
    this._tip.copy(this._tipLocal);
    bikerRoot.localToWorld(this._tip);

    const delta = new THREE.Vector3().subVectors(this._tip, this._prevTip);
    const len = delta.length();
    if (len <= 0.0001) {
      this._prevTip.copy(this._tip);
      return false;
    }
    delta.multiplyScalar(1 / len);
    this._raycaster.set(this._prevTip, delta);
    this._raycaster.near = 0;
    this._raycaster.far = len;

    const hits = this._raycaster.intersectObjects(collisionMeshes, false);
    this._prevTip.copy(this._tip);
    return hits.length > 0;
  }

  resetCollisionState(bikerRoot: THREE.Object3D): void {
    for (const m of this._activeBuildingMeshes) disposeMeshBvh(m);
    this._activeBuildingMeshes = [];
    this._activeBuildings.clear();

    bikerRoot.updateMatrixWorld(true);
    this._prevTip.copy(bikerRoot.localToWorld(this._tipLocal.clone()));
  }

  /**
   * Окклюзия: если дом между камерой и персонажем — делаем дом полупрозрачным.
   */
  updateBikerOcclusion(params: Readonly<{ camera: THREE.Camera; bikerPos: THREE.Vector3; targetY: number; dtSec: number; config: CityWorldOcclusionConfig }>): void {
    if (this._allBuildingMeshes.length === 0) return;

    const { camera, bikerPos, dtSec } = params;

    this._tmpV3a.set(bikerPos.x, params.targetY, bikerPos.z);
    this._tmpV3b.subVectors(this._tmpV3a, camera.position);
    const len = this._tmpV3b.length();
    if (len <= 0.0001) return;
    this._tmpV3b.multiplyScalar(1 / len);

    this._raycaster.set(camera.position, this._tmpV3b);
    this._raycaster.near = 0;
    this._raycaster.far = len;

    const candidates = this._activeBuildingMeshes.length > 0 ? this._activeBuildingMeshes : this._allBuildingMeshes;
    const hits = this._raycaster.intersectObjects(candidates, false);

    let nextRoot: THREE.Object3D | null = null;
    let nextMeshes: THREE.Mesh[] | null = null;
    for (const hit of hits) {
      const m = hit.object as THREE.Mesh;
      const entry = this._meshToBuilding.get(m.uuid);
      if (!entry) continue;
      if (!entry.root.visible) continue;
      nextRoot = entry.root;
      nextMeshes = entry.meshes;
      break;
    }

    const occlOpacity = params.config.buildingOpacity;
    const fadeSec = params.config.fadeSec;

    // Обновляем target для всех активных transitions.
    for (const [root, st] of this._occlusionStates) {
      const desired = root === nextRoot ? occlOpacity : 1;
      if (Math.abs(desired - st.target) > 1e-6) {
        st.from = st.current;
        st.target = desired;
        st.t01 = 0;
      }
    }

    // Если появился новый окклюдер — добавляем state.
    if (nextRoot && nextMeshes && !this._occlusionStates.has(nextRoot)) {
      this._occlusionStates.set(nextRoot, { meshes: nextMeshes, from: 1, current: 1, target: occlOpacity, t01: 0 });
      for (const mesh of nextMeshes) this._ensureMeshOcclusionMaterial(mesh, 1);
    }

    const dt01 = fadeSec <= 0 ? 1 : Math.min(1, Math.max(0, dtSec) / fadeSec);
    for (const [root, st] of this._occlusionStates) {
      if (Math.abs(st.current - st.target) <= 1e-4) {
        st.current = st.target;
      } else {
        st.t01 = Math.min(1, st.t01 + dt01);
        const eased = _easeInOutQuad(st.t01);
        st.current = st.from + (st.target - st.from) * eased;
      }

      for (const mesh of st.meshes) this._applyMeshOcclusionOpacity(mesh, st.current);

      // Полностью восстановили — возвращаем материалы и убираем state.
      if (st.target >= 0.999 && st.t01 >= 1) {
        for (const mesh of st.meshes) this._restoreMeshOcclusion(mesh);
        this._occlusionStates.delete(root);
      }
    }
  }

  private _indexBuildingMeshes(): void {
    this._allBuildingMeshes = [];
    this._meshToBuilding.clear();
    for (const b of this._buildings.buildings) {
      for (const m of b.meshes) {
        this._allBuildingMeshes.push(m);
        this._meshToBuilding.set(m.uuid, { root: b.root, meshes: b.meshes });
      }
    }
  }

  private _getCollisionMeshes(): THREE.Mesh[] {
    if (this._boundaryWallMeshes.length === 0) return this._activeBuildingMeshes;
    if (this._activeBuildingMeshes.length === 0) return this._boundaryWallMeshes;
    return [...this._activeBuildingMeshes, ...this._boundaryWallMeshes];
  }

  private _createBoundaryWall(params: Readonly<{
    width: number;
    height: number;
    depth: number;
    x: number;
    y: number;
    z: number;
    material: THREE.Material;
    name: string;
  }>): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(params.width, params.height, params.depth),
      params.material
    );
    mesh.name = params.name;
    mesh.position.set(params.x, params.y, params.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  private _ensureMeshOcclusionMaterial(mesh: THREE.Mesh, opacity: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = mesh.userData as any;
    if (!ud._cityOcclusionOrigMaterial) ud._cityOcclusionOrigMaterial = mesh.material;
    if (!ud._cityOcclusionMaterial) ud._cityOcclusionMaterial = cloneOcclusionMaterial(mesh.material, opacity);
    mesh.material = ud._cityOcclusionMaterial;
    setMaterialOpacity(ud._cityOcclusionMaterial, opacity);
  }

  private _applyMeshOcclusionOpacity(mesh: THREE.Mesh, opacity: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = mesh.userData as any;
    if (!ud._cityOcclusionMaterial) {
      this._ensureMeshOcclusionMaterial(mesh, opacity);
      return;
    }
    mesh.material = ud._cityOcclusionMaterial;
    setMaterialOpacity(ud._cityOcclusionMaterial, opacity);
  }

  private _restoreMeshOcclusion(mesh: THREE.Mesh): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ud = mesh.userData as any;
    if (ud._cityOcclusionOrigMaterial) mesh.material = ud._cityOcclusionOrigMaterial;
  }
}

function _easeInOutQuad(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
}

