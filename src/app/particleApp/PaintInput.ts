import * as THREE from "three";

export type PaintStamp = { uv: THREE.Vector2 };

export class PaintInput {
  private _pointerId: number | null = null;
  private _lastUv: THREE.Vector2 | null = null;
  private _stamps: THREE.Vector2[] = [];

  private _spacingUv = 0.01;

  get isCaptured(): boolean {
    return this._pointerId !== null;
  }

  setSpacingUv(v: number): void {
    this._spacingUv = Math.max(1e-6, v);
  }

  capture(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this._pointerId !== null) return;
    this._pointerId = e.pointerId;
    this._stamps.length = 0;
    const uv = this._eventToUv(e, canvas);
    this._lastUv = uv.clone();
    this._stamps.push(uv);
    canvas.setPointerCapture(e.pointerId);
  }

  release(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this._pointerId !== e.pointerId) return;
    this._pointerId = null;
    this._lastUv = null;
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
    this._lastUv = null;
    try {
      canvas.releasePointerCapture(id);
    } catch {
      // ignore
    }
  }

  onMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this._pointerId !== e.pointerId) return;
    const uv = this._eventToUv(e, canvas);
    this._pushSegment(uv);
  }

  consumeStamps(): PaintStamp[] {
    const out = this._stamps.map((uv) => ({ uv }));
    this._stamps = [];
    return out;
  }

  private _eventToUv(e: PointerEvent, canvas: HTMLCanvasElement): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1e-6, rect.width);
    const y = (e.clientY - rect.top) / Math.max(1e-6, rect.height);
    return new THREE.Vector2(THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(1 - y, 0, 1));
  }

  private _pushSegment(uv: THREE.Vector2): void {
    if (!this._lastUv) {
      this._lastUv = uv.clone();
      this._stamps.push(this._lastUv.clone());
      return;
    }

    const a = this._lastUv;
    const b = uv;
    const d = a.distanceTo(b);
    if (d < this._spacingUv) return;

    const steps = Math.min(64, Math.ceil(d / this._spacingUv));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this._stamps.push(new THREE.Vector2(THREE.MathUtils.lerp(a.x, b.x, t), THREE.MathUtils.lerp(a.y, b.y, t)));
    }
    this._lastUv = b.clone();
  }
}


