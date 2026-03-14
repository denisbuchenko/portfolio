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
  canStartDrag: (clientX: number, clientY: number) => boolean;
};

export function createSunducRotationController(
  options: CreateSunducRotationControllerOptions
): SunducRotationController {
  const _initialYaw = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.y);
  const _initialPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.initialRotationDeg.x);
  const state = {
    _dragPointerId: null as number | null,
    _dragTouchId: null as number | null,
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

  const _applyDragDelta = (clientX: number, clientY: number): void => {
    const dx = clientX - state._lastPointer.x;
    const dy = clientY - state._lastPointer.y;
    state._lastPointer.set(clientX, clientY);

    state._targetYaw += dx * SUNDUC_CONFIG.model.dragSensitivity.x;
    state._targetPitch += dy * SUNDUC_CONFIG.model.dragSensitivity.y;

    const minPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.minPitchDeg);
    const maxPitch = THREE.MathUtils.degToRad(SUNDUC_CONFIG.model.maxPitchDeg);
    state._targetPitch = THREE.MathUtils.clamp(state._targetPitch, minPitch, maxPitch);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    if (!options.canStartDrag(event.clientX, event.clientY)) return;

    state._dragPointerId = event.pointerId;
    state._lastPointer.set(event.clientX, event.clientY);
    options.canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    if (state._dragPointerId !== event.pointerId) return;
    _applyDragDelta(event.clientX, event.clientY);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    if (state._dragPointerId !== event.pointerId) return;

    if (options.canvas.hasPointerCapture(event.pointerId)) {
      options.canvas.releasePointerCapture(event.pointerId);
    }

    state._dragPointerId = null;
  };

  const _getActiveTouch = (touches: TouchList): Touch | null => {
    if (state._dragTouchId === null) return null;
    for (let i = 0; i < touches.length; i++) {
      const touch = touches.item(i);
      if (touch?.identifier === state._dragTouchId) return touch;
    }
    return null;
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (state._dragTouchId !== null) return;
    const touch = event.changedTouches.item(0);
    if (!touch) return;
    if (!options.canStartDrag(touch.clientX, touch.clientY)) return;

    state._dragTouchId = touch.identifier;
    state._lastPointer.set(touch.clientX, touch.clientY);
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent): void => {
    const touch = _getActiveTouch(event.touches);
    if (!touch) return;
    event.preventDefault();
    _applyDragDelta(touch.clientX, touch.clientY);
  };

  const onTouchEnd = (event: TouchEvent): void => {
    if (state._dragTouchId === null) return;
    const touch = _getActiveTouch(event.changedTouches);
    if (!touch) return;
    state._dragTouchId = null;
  };

  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointercancel", onPointerUp);
  options.canvas.addEventListener("pointerleave", onPointerUp);
  options.canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  options.canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  options.canvas.addEventListener("touchend", onTouchEnd);
  options.canvas.addEventListener("touchcancel", onTouchEnd);

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
      state._dragTouchId = null;
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
      options.canvas.removeEventListener("touchstart", onTouchStart);
      options.canvas.removeEventListener("touchmove", onTouchMove);
      options.canvas.removeEventListener("touchend", onTouchEnd);
      options.canvas.removeEventListener("touchcancel", onTouchEnd);
    }
  };
}
