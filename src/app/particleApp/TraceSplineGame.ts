import * as THREE from "three";

type TracePhase = "idle" | "inPath" | "failed" | "completed";

export class TraceSplineGame {
  private _enabled = false;

  private _pixelsPerWorld = 100;
  private _rawPtsWorld: THREE.Vector2[] | null = null;
  private _waypoints: THREE.Vector2[] = [];

  private _phase: TracePhase = "idle";
  private _pointerId: number | null = null;
  private _targetIdx = 0; // индекс следующей точки, до которой нужно дойти

  private _bestDistWorld = Infinity;
  private _distWorld = Infinity;
  private _failReason: string | null = null;
  private _endEvent: { outcome: "failed" | "completed"; reason?: string } | null = null;

  // Тюнинг в CSS-пикселях (чтобы ощущалось одинаково на разных экранах)
  private _spacingPx = 22; // шаг точек по пути
  private _startRadiusPx = 26; // насколько близко нужно нажать к старту
  private _reachRadiusPx = 50; // когда точка считается достигнутой
  private _failRadiusPx = 300; // если слишком далеко от цели — провал
  private _failBacktrackPx = 300; // если отдалился от лучшего приближения — провал

  private _startMarker: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(opts: { scene: THREE.Scene }) {
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2b2b, transparent: true, opacity: 0.95, depthTest: false });
    this._startMarker = new THREE.Mesh(geom, mat);
    this._startMarker.renderOrder = 999;
    this._startMarker.visible = false;
    opts.scene.add(this._startMarker);
  }

  get isInPath(): boolean {
    return this._phase === "inPath";
  }

  consumeEndEvent(): { outcome: "failed" | "completed"; reason?: string } | null {
    const ev = this._endEvent;
    this._endEvent = null;
    return ev;
  }

  setEnabled(v: boolean): void {
    this._enabled = v;
    this._startMarker.visible = v && this._waypoints.length >= 1;
  }

  setPixelsPerWorld(ppw: number): void {
    this._pixelsPerWorld = Math.max(1e-6, ppw);
    this._rebuildWaypoints();
  }

  setSplinePointsWorld(points: THREE.Vector2[] | null): void {
    this._rawPtsWorld = points;
    this._rebuildWaypoints();
  }

  forceRelease(canvas: HTMLCanvasElement, reason = "режим сброшен"): void {
    if (this._pointerId !== null) {
      const id = this._pointerId;
      this._pointerId = null;
      try {
        canvas.releasePointerCapture(id);
      } catch {
        // ignore
      }
    }
    this._phase = "idle";
    this._targetIdx = 0;
    this._bestDistWorld = Infinity;
    this._distWorld = Infinity;
    this._failReason = reason;
    this._endEvent = null;
  }

  onPointerDown(e: PointerEvent, canvas: HTMLCanvasElement, pointerWorld: THREE.Vector3): boolean {
    if (!this._enabled) return false;
    if (this._pointerId !== null) return false;
    if (this._waypoints.length < 2) return false;

    const start = this._waypoints[0];
    const d = this._distToPointWorld(pointerWorld, start);
    const startRadiusWorld = this._startRadiusPx / this._pixelsPerWorld;
    if (d > startRadiusWorld) return false;

    this._pointerId = e.pointerId;
    this._phase = "inPath";
    this._targetIdx = 1;
    this._bestDistWorld = Infinity;
    this._distWorld = Infinity;
    this._failReason = null;
    this._endEvent = null;

    canvas.setPointerCapture(e.pointerId);
    return true;
  }

  onPointerMove(e: PointerEvent, canvas: HTMLCanvasElement, pointerWorld: THREE.Vector3): void {
    if (!this._enabled) return;
    if (this._pointerId !== e.pointerId) return;
    if (this._phase !== "inPath") return;

    if (this._targetIdx >= this._waypoints.length) {
      this._complete(canvas);
      return;
    }

    const target = this._waypoints[this._targetIdx];
    const distWorld = this._distToPointWorld(pointerWorld, target);
    this._distWorld = distWorld;
    this._bestDistWorld = Math.min(this._bestDistWorld, distWorld);

    const reachRadiusWorld = this._reachRadiusPx / this._pixelsPerWorld;
    if (distWorld <= reachRadiusWorld) {
      this._advanceTarget(canvas);
      return;
    }

    const failRadiusWorld = this._failRadiusPx / this._pixelsPerWorld;
    const failBacktrackWorld = this._failBacktrackPx / this._pixelsPerWorld;
    if (distWorld > failRadiusWorld) {
      this._fail(canvas, "слишком далеко от цели");
      return;
    }
    if (distWorld > this._bestDistWorld + failBacktrackWorld) {
      this._fail(canvas, "отдалился от цели");
      return;
    }
  }

  onPointerUp(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this._pointerId !== e.pointerId) return;
    if (this._phase === "inPath") this._fail(canvas, "палец отпущен");
    if (this._phase === "completed") this._release(canvas);
  }

  getDebugText(): string {
    const total = this._waypoints.length;
    const idx = this._phase === "inPath" ? this._targetIdx : Math.min(this._targetIdx, Math.max(0, total - 1));
    const progress01 = total >= 2 ? THREE.MathUtils.clamp(idx / (total - 1), 0, 1) : 0;

    const reachWorld = this._reachRadiusPx / this._pixelsPerWorld;
    const failWorld = this._failRadiusPx / this._pixelsPerWorld;
    const backWorld = this._failBacktrackPx / this._pixelsPerWorld;

    const lines: string[] = [];
    lines.push(`мини‑игра: прохождение сплайна`);
    lines.push(`phase: ${this._phase}${this._pointerId !== null ? ` (pointerId=${this._pointerId})` : ""}`);
    lines.push(`points: ${total} • nextIdx: ${this._targetIdx} • прогресс: ${(progress01 * 100).toFixed(1)}%`);
    lines.push(
      `dist: ${Number.isFinite(this._distWorld) ? this._distWorld.toFixed(3) : "—"} • best: ${
        Number.isFinite(this._bestDistWorld) ? this._bestDistWorld.toFixed(3) : "—"
      }`
    );
    lines.push(
      `reach<=${reachWorld.toFixed(3)}w (${this._reachRadiusPx}px) • fail>=${failWorld.toFixed(3)}w (${this._failRadiusPx}px) • back>${backWorld.toFixed(3)}w (${this._failBacktrackPx}px)`
    );
    if (this._failReason) lines.push(`reason: ${this._failReason}`);
    if (this._waypoints.length < 2) lines.push(`(сплайн ещё не загружен или слишком короткий)`);
    return lines.join("\n");
  }

  private _advanceTarget(canvas: HTMLCanvasElement): void {
    this._targetIdx++;
    this._bestDistWorld = Infinity;
    this._distWorld = Infinity;
    if (this._targetIdx >= this._waypoints.length) this._complete(canvas);
  }

  private _complete(canvas: HTMLCanvasElement): void {
    this._phase = "completed";
    this._failReason = null;
    this._endEvent = { outcome: "completed" };
    this._release(canvas);
  }

  private _fail(canvas: HTMLCanvasElement, reason: string): void {
    this._phase = "failed";
    this._failReason = reason;
    this._endEvent = { outcome: "failed", reason };
    this._targetIdx = 0;
    this._bestDistWorld = Infinity;
    this._distWorld = Infinity;
    this._release(canvas);
  }

  private _release(canvas: HTMLCanvasElement): void {
    if (this._pointerId === null) return;
    const id = this._pointerId;
    this._pointerId = null;
    try {
      canvas.releasePointerCapture(id);
    } catch {
      // ignore
    }
  }

  private _rebuildWaypoints(): void {
    if (!this._rawPtsWorld || this._rawPtsWorld.length < 2) {
      this._waypoints = [];
      this._startMarker.visible = false;
      return;
    }

    const stepWorld = this._spacingPx / this._pixelsPerWorld;
    this._waypoints = this._resamplePolyline(this._rawPtsWorld, stepWorld);
    this._updateStartMarker();
    this._startMarker.visible = this._enabled && this._waypoints.length >= 1;
  }

  private _updateStartMarker(): void {
    if (this._waypoints.length < 1) return;

    const p = this._waypoints[0];
    this._startMarker.position.set(p.x, p.y, 0.01);

    const sizePx = 10;
    const sizeWorld = sizePx / this._pixelsPerWorld;
    this._startMarker.scale.set(sizeWorld, sizeWorld, 1);
  }

  private _distToPointWorld(pointerWorld: THREE.Vector3, p: THREE.Vector2): number {
    const dx = pointerWorld.x - p.x;
    const dy = pointerWorld.y - p.y;
    return Math.hypot(dx, dy);
  }

  private _resamplePolyline(points: THREE.Vector2[], step: number): THREE.Vector2[] {
    const pts = points;
    const out: THREE.Vector2[] = [];
    if (pts.length === 0) return out;
    out.push(pts[0].clone());

    const stepClamped = Math.max(1e-6, step);
    let cursor = pts[0].clone();
    let carry = 0;

    for (let i = 1; i < pts.length; i++) {
      const b = pts[i];
      let segLen = cursor.distanceTo(b);
      if (segLen < 1e-9) continue;

      while (carry + segLen >= stepClamped) {
        const t = (stepClamped - carry) / segLen;
        cursor = new THREE.Vector2(THREE.MathUtils.lerp(cursor.x, b.x, t), THREE.MathUtils.lerp(cursor.y, b.y, t));
        out.push(cursor.clone());
        segLen = cursor.distanceTo(b);
        carry = 0;
        if (segLen < 1e-9) break;
      }

      carry += segLen;
      cursor = b.clone();
    }

    const last = pts[pts.length - 1];
    if (out.length === 0 || out[out.length - 1].distanceTo(last) > 1e-6) out.push(last.clone());
    return out;
  }
}


