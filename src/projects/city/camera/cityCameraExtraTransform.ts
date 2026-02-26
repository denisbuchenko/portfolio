import * as THREE from "three";
import { CITY_CAMERA } from "../cityConfig";

export function applyCityCameraExtraTransform(camera: THREE.Camera, kind: "overview" | "gameplay"): void {
  const cfg = kind === "overview" ? (CITY_CAMERA.overview.extraTransform ?? null) : CITY_CAMERA.gameplay.extraTransform;
  if (!cfg) return;

  // 1) Доп. поворот: умножаем quaternion на offset-quaternion (локальные оси камеры).
  const r = cfg.rotationOffsetDeg;
  const euler = new THREE.Euler((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180, "XYZ");
  const q = new THREE.Quaternion().setFromEuler(euler);
  camera.quaternion.multiply(q);

  // 2) Доп. сдвиг: трактуем positionOffset как локальный оффсет камеры (вправо/вверх/вперёд).
  const p = cfg.positionOffset;
  const local = new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(camera.quaternion);
  camera.position.add(local);
}

