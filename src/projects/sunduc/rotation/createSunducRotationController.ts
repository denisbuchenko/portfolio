import * as THREE from "three";
import { SUNDUC_CONFIG } from "../config";

export type SunducRotationController = {
  update(deltaSeconds: number): void;
  resetToInitialRotation(durationSec?: number): void;
  dispose(): void;
};

type CreateSunducRotationControllerOptions = {
  canvas: HTMLCanvasElement;
  target: THREE.Object3D;
};

export function createSunducRotationController(
  options: CreateSunducRotationControllerOptions
): SunducRotationController {
  const _initialYaw = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.y);
  const _initialPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.x);
  const state = {
    _dragPointerId: null as number | null,
    _lastPointer: new THREE.Vector2(),
    _yaw: _initialYaw,
    _pitch: _initialPitch,
    _targetYaw: _initialYaw,
    _targetPitch: _initialPitch,
    _resetElapsedSec: 0,
    _resetDurationSec: 0,
    _resetFromYaw: _initialYaw,
    _resetToYaw: _initialYaw,
    _resetFromPitch: _initialPitch,
    _resetToPitch: _initialPitch
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

  const _normalizeAngle = (angle: number): number => {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  };

  const _shortestAngleDelta = (from: number, to: number): number => {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  };

  return {
    update(deltaSeconds: number): void {
      if (state._resetElapsedSec < state._resetDurationSec) {
        state._resetElapsedSec = Math.min(state._resetDurationSec, state._resetElapsedSec + Math.max(0, deltaSeconds));
        const t01 =
          state._resetDurationSec <= 0 ? 1 : THREE.MathUtils.clamp(state._resetElapsedSec / state._resetDurationSec, 0, 1);
        const eased = t01 * t01 * (3 - 2 * t01);

        state._yaw = state._resetFromYaw + (state._resetToYaw - state._resetFromYaw) * eased;
        state._pitch = THREE.MathUtils.lerp(state._resetFromPitch, state._resetToPitch, eased);
        state._targetYaw = state._yaw;
        state._targetPitch = state._pitch;
      } else {
        const damping = 1 - Math.pow(1 - SUNDUC_CONFIG.model.damping, deltaSeconds * 60);
        state._yaw = THREE.MathUtils.lerp(state._yaw, state._targetYaw, damping);
        state._pitch = THREE.MathUtils.lerp(state._pitch, state._targetPitch, damping);
      }

      options.target.rotation.y = _normalizeAngle(state._yaw);
      options.target.rotation.x = state._pitch;
    },
    resetToInitialRotation(durationSec = 0.5): void {
      state._dragPointerId = null;
      state._resetElapsedSec = 0;
      state._resetDurationSec = Math.max(0, durationSec);
      state._resetFromYaw = _normalizeAngle(state._yaw);
      state._resetToYaw = state._resetFromYaw + _shortestAngleDelta(state._resetFromYaw, _initialYaw);
      state._resetFromPitch = state._pitch;
      state._resetToPitch = _initialPitch;
      state._targetYaw = state._resetToYaw;
      state._targetPitch = state._resetToPitch;
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
