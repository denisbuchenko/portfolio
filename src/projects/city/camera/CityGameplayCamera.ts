import * as THREE from "three";
import { CITY_CAMERA } from "../cityConfig";

/**
 * Выделенная математика камеры игрового режима (3/4), чтобы не раздувать CityApp.
 * Хранит временные объекты (Quaternion/Vector3) для минимизации аллокаций.
 */
export class CityGameplayCamera {
  private _baseQuat = new THREE.Quaternion();
  private _tmpQ = new THREE.Quaternion();
  private _tmpQ2 = new THREE.Quaternion();
  private _tmpV3a = new THREE.Vector3();
  private _tmpV3b = new THREE.Vector3();

  computeFixedQuaternionInto(out: THREE.Quaternion): THREE.Quaternion {
    const view = CITY_CAMERA.gameplay.view;
    const yaw = (view.yawDeg * Math.PI) / 180;
    const pitch = (view.pitchDeg * Math.PI) / 180;
    const roll = (view.rollDeg * Math.PI) / 180;
    this._baseQuat.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    return this._composeGameplayQuaternionInto(out);
  }

  computeCameraPosForTarget(targetPos: THREE.Vector3): THREE.Vector3 {
    const view = CITY_CAMERA.gameplay.view;
    const yaw = (view.yawDeg * Math.PI) / 180;
    const pitch = (view.pitchDeg * Math.PI) / 180;
    const roll = (view.rollDeg * Math.PI) / 180;

    this._baseQuat.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    const q = this._composeGameplayQuaternionInto(this._tmpQ);

    const forward = this._tmpV3a.set(0, 0, -1).applyQuaternion(q);
    const target = this._tmpV3b.set(targetPos.x, view.targetY, targetPos.z);
    const pos = target.addScaledVector(forward, -view.distance);

    const off = CITY_CAMERA.gameplay.extraTransform.positionOffset;
    pos.add(this._tmpV3a.set(off.x, off.y, off.z).applyQuaternion(q));
    return pos.clone(); // used rarely (focus target); ok to allocate here
  }

  applyFixedRotation(camera: THREE.Camera): void {
    camera.quaternion.copy(this._composeGameplayQuaternionInto(this._tmpQ));
  }

  applyFixedView(camera: THREE.Camera, targetPos: THREE.Vector3, followLerp: number, distanceMultiplier = 1): void {
    const view = CITY_CAMERA.gameplay.view;
    const yaw = (view.yawDeg * Math.PI) / 180;
    const pitch = (view.pitchDeg * Math.PI) / 180;
    const roll = (view.rollDeg * Math.PI) / 180;

    // Фиксированный поворот (3/4) + доп. поворот из конфига.
    this._baseQuat.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    camera.quaternion.copy(this._composeGameplayQuaternionInto(this._tmpQ));

    // Позиция: держим персонажа на оси взгляда, камера ездит только по плоскости.
    const forward = this._tmpV3a.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dist = view.distance * Math.max(0.05, distanceMultiplier);
    const desired = this._tmpV3b.set(targetPos.x, view.targetY, targetPos.z).addScaledVector(forward, -dist);

    // Доп. локальный сдвиг.
    const off = CITY_CAMERA.gameplay.extraTransform.positionOffset;
    desired.add(this._tmpV3a.set(off.x, off.y, off.z).applyQuaternion(camera.quaternion));

    const k = Math.max(0, Math.min(1, followLerp));
    camera.position.lerp(desired, k);
  }

  private _composeGameplayQuaternionInto(tmpOut: THREE.Quaternion): THREE.Quaternion {
    const extraRot = CITY_CAMERA.gameplay.extraTransform.rotationOffsetDeg;
    this._tmpQ2.setFromEuler(
      new THREE.Euler((extraRot.x * Math.PI) / 180, (extraRot.y * Math.PI) / 180, (extraRot.z * Math.PI) / 180, "XYZ")
    );
    tmpOut.copy(this._baseQuat).multiply(this._tmpQ2);
    return tmpOut;
  }
}

