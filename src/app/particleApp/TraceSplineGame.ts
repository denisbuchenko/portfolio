import * as THREE from "three";
import { CONFIG } from "../../config";

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

  // Тюнинг (в CSS-пикселях) вынесен в CONFIG.traceGame
  private _spacingPx = CONFIG.traceGame.spacingPx;
  private _startRadiusPx = CONFIG.traceGame.startRadiusPx;
  private _reachRadiusPx = CONFIG.traceGame.reachRadiusPx;
  private _failRadiusPx = CONFIG.traceGame.failRadiusPx;
  private _failBacktrackPx = CONFIG.traceGame.failBacktrackPx;

  private _startLabel: THREE.Sprite;
  private _startLabelOpacity = 1;
  private _startLabelTargetOpacity = 1;

  constructor(opts: { scene: THREE.Scene }) {
    const tex = this._createStartTextTexture();
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false
    });
    this._startLabel = new THREE.Sprite(mat);
    this._startLabel.renderOrder = 999;
    this._startLabel.visible = false;
    opts.scene.add(this._startLabel);
  }

  get isInPath(): boolean {
    return this._phase === "inPath";
  }

  getProgress01(): number {
    const total = this._waypoints.length;
    if (total < 2) return 0;
    if (this._phase === "completed") return 1;
    if (this._phase !== "inPath") return 0;
    // _targetIdx — индекс "следующей" точки.
    // Если мы идём к 1-й (targetIdx=1), то 0% уже пройдено.
    const reached = Math.max(0, this._targetIdx - 1);
    return THREE.MathUtils.clamp(reached / (total - 1), 0, 1);
  }

  getNextTargetWorld(): THREE.Vector2 | null {
    if (this._phase !== "inPath") return null;
    if (this._targetIdx < 0 || this._targetIdx >= this._waypoints.length) return null;
    return this._waypoints[this._targetIdx];
  }

  consumeEndEvent(): { outcome: "failed" | "completed"; reason?: string } | null {
    const ev = this._endEvent;
    this._endEvent = null;
    return ev;
  }

  update(dt: number): void {
    const hasStart = this._enabled && this._waypoints.length >= 1;
    const shouldShow = hasStart && this._phase !== "inPath";
    this._startLabelTargetOpacity = shouldShow ? 1 : 0;

    const k = 1.0 - Math.exp(-Math.max(0, dt) / 0.12);
    this._startLabelOpacity = THREE.MathUtils.lerp(this._startLabelOpacity, this._startLabelTargetOpacity, k);

    const mat = this._startLabel.material as THREE.SpriteMaterial;
    mat.opacity = this._startLabelOpacity;
    this._startLabel.visible = hasStart && this._startLabelOpacity > 1e-3;
  }

  getDanger01(): number {
    if (this._phase !== "inPath") return 0;
    if (!Number.isFinite(this._distWorld)) return 0;
    const failWorld = this._failRadiusPx / Math.max(1e-6, this._pixelsPerWorld);
    const warnStart = THREE.MathUtils.clamp(CONFIG.traceGame.warnStartFrac, 0.0, 0.99) * failWorld;
    const t = THREE.MathUtils.clamp((this._distWorld - warnStart) / Math.max(1e-6, failWorld - warnStart), 0, 1);
    // smoothstep
    return t * t * (3.0 - 2.0 * t);
  }

  setEnabled(v: boolean): void {
    this._enabled = v;
    this._startLabel.visible = v && this._waypoints.length >= 1;
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
    this._startLabelTargetOpacity = 1;
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
    this._startLabelTargetOpacity = 0;

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
    // "Отдалился от лучшего приближения":
    // bestDistWorld — минимальная дистанция до текущей цели, которая была достигнута во время движения.
    // Если ты пошёл обратно (в сторону от цели) сильнее порога — провал, чтобы нельзя было "гулять" вокруг.
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
    const progress01 = this.getProgress01();

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
      this._startLabel.visible = false;
      return;
    }

    const stepWorld = this._spacingPx / this._pixelsPerWorld;
    this._waypoints = this._resamplePolyline(this._rawPtsWorld, stepWorld);
    this._updateStartLabel();
    this._startLabel.visible = this._enabled && this._waypoints.length >= 1;
  }

  private _updateStartLabel(): void {
    if (this._waypoints.length < 1) return;

    const p = this._waypoints[0];
    this._startLabel.position.set(p.x, p.y, 0.01);

    const hPx = Math.max(6, CONFIG.traceGame.startLabelHeightPx);
    const aspect = 2.0; // canvas 256x128
    const wPx = hPx * aspect;
    this._startLabel.scale.set(wPx / this._pixelsPerWorld, hPx / this._pixelsPerWorld, 1);
  }

  private _createStartTextTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Texture();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "600 56px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("start", canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
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


