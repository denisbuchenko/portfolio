import * as THREE from "three";

export class PointerTracker {
  private _mouseWorld = new THREE.Vector3(0, 0, 0);
  private _mouseNDC = new THREE.Vector2(0, 0);
  private _raycaster = new THREE.Raycaster();
  private _planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private _tmpIntersect = new THREE.Vector3();

  private _pointerId: number | null = null;
  private _startTime = 0;

  get mouseWorld(): THREE.Vector3 {
    return this._mouseWorld;
  }

  get isCaptured(): boolean {
    return this._pointerId !== null;
  }

  get startTime(): number {
    return this._startTime;
  }

  updateFromEvent(e: PointerEvent, canvas: HTMLCanvasElement, camera: THREE.Camera): void {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this._mouseNDC.set(x, y);

    this._raycaster.setFromCamera(this._mouseNDC, camera);
    const hit = this._raycaster.ray.intersectPlane(this._planeZ0, this._tmpIntersect);
    if (hit) this._mouseWorld.copy(hit);
  }

  capture(e: PointerEvent, canvas: HTMLCanvasElement, startTime: number): void {
    if (this._pointerId !== null) return;
    this._pointerId = e.pointerId;
    this._startTime = startTime;
    canvas.setPointerCapture(e.pointerId);
  }

  release(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this._pointerId !== e.pointerId) return;
    this._pointerId = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  forceRelease(canvas: HTMLCanvasElement): void {
    if (this._pointerId === null) return;
    const id = this._pointerId;
    this._pointerId = null;
    try {
      canvas.releasePointerCapture(id);
    } catch {
      // ignore
    }
  }
}


