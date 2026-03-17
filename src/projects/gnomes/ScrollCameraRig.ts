import * as THREE from "three";
import { GNOMES_CONFIG } from "./config";

export class ScrollCameraRig {
  private _camera: THREE.PerspectiveCamera;
  private _pages: number;
  private _pageWorldHeight = 3;
  private _viewportHeightPx = 1;
  private _focusOffsetY = 0.8;

  private _targetY = 0;

  constructor(opts: { pages: number }) {
    this._pages = Math.max(1, Math.floor(opts.pages));
    this._camera = new THREE.PerspectiveCamera(GNOMES_CONFIG.camera.fov, 1, GNOMES_CONFIG.camera.near, GNOMES_CONFIG.camera.far);
    this._camera.position.set(0, 0, GNOMES_CONFIG.camera.z);
    this._camera.lookAt(0, this._focusOffsetY, 0);
  }

  get camera(): THREE.PerspectiveCamera {
    return this._camera;
  }

  get pageWorldHeight(): number {
    return this._pageWorldHeight;
  }

  get viewportHeightPx(): number {
    return this._viewportHeightPx;
  }

  setFocusOffsetY(y: number): void {
    this._focusOffsetY = y;
  }

  resize(w: number, h: number): void {
    this._viewportHeightPx = Math.max(1, h);

    this._camera.aspect = Math.max(1e-6, w / h);
    this._camera.updateProjectionMatrix();

    const dist = Math.abs(this._camera.position.z - 0); // гномы около z=0
    const fovRad = (this._camera.fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(fovRad * 0.5) * dist;
    this._pageWorldHeight = visibleHeight;
  }

  /** window.scrollY -> целевая позиция камеры */
  setScrollY(scrollY: number): void {
    const maxPage = Math.max(0, this._pages - 1);
    const scrollSpeed = Math.max(0.01, GNOMES_CONFIG.camera.scrollSpeed);
    const rawPage = (scrollY / this._viewportHeightPx) * scrollSpeed;
    const page = Math.min(maxPage, Math.max(0, rawPage));
    this._targetY = -page * this._pageWorldHeight;
  }

  update(deltaSec: number): void {
    // Экспоненциальное сглаживание: одинаково чувствительно на 30/60/120 FPS.
    const k = GNOMES_CONFIG.camera.damping;
    const a = 1 - Math.exp(-k * Math.max(0, deltaSec));

    this._camera.position.y += (this._targetY - this._camera.position.y) * a;
    this._camera.lookAt(0, this._camera.position.y + this._focusOffsetY, 0);
  }
}

