import * as THREE from "three";
import { SUNDUC_CONFIG } from "../config";

export type SunducRotationController = {
  update(deltaSeconds: number): void;
  dispose(): void;
};

type CreateSunducRotationControllerOptions = {
  canvas: HTMLCanvasElement;
  target: THREE.Object3D;
};

export function createSunducRotationController(
  options: CreateSunducRotationControllerOptions
): SunducRotationController {
  const state = {
    _dragPointerId: null as number | null,
    _lastPointer: new THREE.Vector2(),
    _yaw: THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.y),
    _pitch: THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.x),
    _targetYaw: THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.y),
    _targetPitch: THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.x)
  };

  const onPointerDown = (event: PointerEvent): void => {
    state._dragPointerId = event.pointerId;
    state._lastPointer.set(event.clientX, event.clientY);
    options.canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (state._dragPointerId !== event.pointerId) return;

    const dx = event.clientX - state._lastPointer.x;
    const dy = event.clientY - state._lastPointer.y;
    state._lastPointer.set(event.clientX, event.clientY);

    state._targetYaw += dx * SUNDUC_CONFIG.model.dragSensitivity.x;
    state._targetPitch += dy * SUNDUC_CONFIG.model.dragSensitivity.y;

    const minPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.minPitchDeg);
    const maxPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.maxPitchDeg);
    state._targetPitch = THREE.MathUtils.clamp(state._targetPitch, minPitch, maxPitch);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (state._dragPointerId !== event.pointerId) return;

    if (options.canvas.hasPointerCapture(event.pointerId)) {
      options.canvas.releasePointerCapture(event.pointerId);
    }

    state._dragPointerId = null;
  };

  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointercancel", onPointerUp);
  options.canvas.addEventListener("pointerleave", onPointerUp);

  return {
    update(deltaSeconds: number): void {
      const damping = 1 - Math.pow(1 - SUNDUC_CONFIG.model.damping, deltaSeconds * 60);
      state._yaw = THREE.MathUtils.lerp(state._yaw, state._targetYaw, damping);
      state._pitch = THREE.MathUtils.lerp(state._pitch, state._targetPitch, damping);

      options.target.rotation.y = state._yaw;
      options.target.rotation.x = state._pitch;
    },
    dispose(): void {
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerup", onPointerUp);
      options.canvas.removeEventListener("pointercancel", onPointerUp);
      options.canvas.removeEventListener("pointerleave", onPointerUp);
    }
  };
}
