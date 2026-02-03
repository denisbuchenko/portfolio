import * as THREE from "three";
import type { RuntimePiece } from "../runtimeTypes";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../../../fruits/types";
import type { FruitBackgroundRenderer } from "../../../fruits/index";
import { createFruitBackgroundRenderer } from "../../../fruits/index";
import { createCanvasMaskTexture, createWebGLRenderer2D, createYDownOrthoCamera, resizeYDownOrthoCamera } from "./puzzle/three2d";
import { createPuzzleFallbackBgTextures } from "./puzzle/fallbackTextures";
import {
  createPuzzleBackgroundQuads,
  resizePuzzleBackgroundQuads,
  setPuzzleBackgroundQuadTexture,
  setPuzzleBackgroundQuadVisibility,
  syncPuzzleBackgroundQuadUniforms,
  type PuzzleBgQuad
} from "./puzzle/backgroundQuads";
import { MaskActiveLayerAnalyzer } from "./puzzle/maskActiveLayers";
import { disposePiecesMeshes, setPiecesMeshes, updatePiecesMeshes } from "./puzzle/pieceMeshes";

export type PuzzleRenderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  maskTex: THREE.CanvasTexture;
  loadAndPrewarm(dpr: number): Promise<void>;
  resize(w: number, h: number, dpr: number): void;
  markMaskDirty(): void;
  render(pieces: RuntimePiece[], timeSec: number, dpr: number): void;
  setPiecesMeshes(pieces: RuntimePiece[]): void;
  disposePiecesMeshes(pieces: RuntimePiece[]): void;
};

export class PuzzleRendererImpl implements PuzzleRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly maskTex: THREE.CanvasTexture;

  private _resolution: THREE.Vector2;
  private _fruitBg: FruitBackgroundRenderer | null = null;
  private _isPrewarmed = false;
  private _isCompiled = false;
  private _fallback: ReturnType<typeof createPuzzleFallbackBgTextures>;
  private _bgQuads: PuzzleBgQuad[];
  private _maskAnalyzer: MaskActiveLayerAnalyzer;
  private _config: FruitBackgroundPresetsConfig;
  private _shaders: { vert: string; bgFrag: string; pieceFrag: string };

  constructor(opts: {
    canvas: HTMLCanvasElement;
    paintCanvas: HTMLCanvasElement;
    background3d: FruitBackgroundPresetsConfig;
    shaders: { vert: string; bgFrag: string; pieceFrag: string };
  }) {
    this._config = opts.background3d;
    this._shaders = opts.shaders;

    this.renderer = createWebGLRenderer2D(opts.canvas);
    this.scene = new THREE.Scene();
    this.camera = createYDownOrthoCamera(1, 1);
    this.maskTex = createCanvasMaskTexture(opts.paintCanvas);
    this._resolution = new THREE.Vector2(2, 2);

    this._fallback = createPuzzleFallbackBgTextures(opts.background3d);
    this._bgQuads = createPuzzleBackgroundQuads({
      scene: this.scene,
      config: opts.background3d,
      maskTex: this.maskTex,
      fallbackTexByBits: this._fallback.textures,
      resolution: this._resolution,
      shaders: { vert: opts.shaders.vert, bgFrag: opts.shaders.bgFrag }
    });

    this._maskAnalyzer = new MaskActiveLayerAnalyzer({ analyzeSize: 64, analysisIntervalFrames: 30 });
  }

  resize(w: number, h: number, dpr: number): void {
    this.renderer.setSize(w, h, false);
    resizeYDownOrthoCamera(this.camera, w, h);

    this._resolution.set(w, h);
    resizePuzzleBackgroundQuads(this._bgQuads, w, h);

    this._fruitBg?.resize(w, h, dpr);
  }

  markMaskDirty(): void {
    this.maskTex.needsUpdate = true;
    this._maskAnalyzer.markDirty();
  }

  async loadAndPrewarm(dpr: number): Promise<void> {
    if (this._isPrewarmed) return;

    this._fruitBg = this._config.enabled ? createFruitBackgroundRenderer({ config: this._config }) : null;
    if (!this._fruitBg) {
      this._isPrewarmed = true;
      return;
    }

    await this._fruitBg.load();

    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    if (w > 0 && h > 0) {
      this._fruitBg.resize(w, h, dpr);
    }

    this._prewarmFruitBackground(dpr);
    this._compileShaders();
    this._isPrewarmed = true;
  }

  private _prewarmFruitBackground(dpr: number): void {
    if (!this._fruitBg) return;

    const all = new Set<FruitLayerBits>([1, 2, 3, 4, 5, 6, 7]);
    this._fruitBg.setActiveLayers(all);
    setPuzzleBackgroundQuadVisibility(this._bgQuads, all);

    const t0 = performance.now() * 0.001;
    for (let i = 0; i < 3; i++) {
      this._fruitBg.update(t0 + i * (1 / 60), dpr);
      this._fruitBg.renderTargets(this.renderer);
    }

    for (let i = 0; i < this._bgQuads.length; i++) {
      const bits = (i + 1) as FruitLayerBits;
      setPuzzleBackgroundQuadTexture(this._bgQuads, bits, this._fruitBg.getLayerTexture(bits));
    }
  }

  private _compileShaders(): void {
    if (this._isCompiled) return;
    this.renderer.compile(this.scene, this.camera);
    this._isCompiled = true;
  }

  setPiecesMeshes(pieces: RuntimePiece[]): void {
    setPiecesMeshes({
      scene: this.scene,
      pieces,
      maskTex: this.maskTex,
      threshold: this._config.maskThreshold,
      shaders: { vert: this._shaders.vert, pieceFrag: this._shaders.pieceFrag }
    });
  }

  disposePiecesMeshes(pieces: RuntimePiece[]): void {
    disposePiecesMeshes(this.scene, pieces);
  }

  render(pieces: RuntimePiece[], timeSec: number, dpr: number): void {
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;

    this._resolution.set(w, h);
    syncPuzzleBackgroundQuadUniforms(this._bgQuads, this._config);

    this._renderBackground(w, h, timeSec, dpr);
    updatePiecesMeshes({ pieces, w, h, threshold: this._config.maskThreshold });

    this.renderer.setClearColor(0x070a10, 1);
    this.renderer.render(this.scene, this.camera);
  }

  private _renderBackground(w: number, h: number, timeSec: number, dpr: number): void {
    if (this._fruitBg) {
      this._renderFruitBackground(w, h, timeSec, dpr);
    } else {
      this._renderFallbackBackground();
    }
  }

  private _renderFruitBackground(w: number, h: number, timeSec: number, dpr: number): void {
    if (!this._fruitBg) return;

    const maskUpdate = this._maskAnalyzer.update({
      maskTex: this.maskTex,
      width: w,
      height: h,
      threshold: this._config.maskThreshold,
      timeSec
    });

    if (maskUpdate.didRun) {
      setPuzzleBackgroundQuadVisibility(this._bgQuads, maskUpdate.activeLayers);
      if (maskUpdate.didChange) {
        this._fruitBg.setActiveLayers(maskUpdate.activeLayers);
      }
    }

    this._fruitBg.update(timeSec, dpr);
    this._fruitBg.renderTargets(this.renderer);

    for (let i = 0; i < this._bgQuads.length; i++) {
      const q = this._bgQuads[i];
      if (!q.visible) continue;
      const bits = (i + 1) as FruitLayerBits;
      const texture = this._fruitBg.getLayerTexture(bits);
      setPuzzleBackgroundQuadTexture(this._bgQuads, bits, texture);
    }
  }

  private _renderFallbackBackground(): void {
    this._fallback.syncFromConfig();
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      setPuzzleBackgroundQuadTexture(this._bgQuads, b, this._fallback.textures[b]);
      this._bgQuads[bits - 1].visible = true;
    }
  }
}

export function createPuzzleRenderer(opts: {
  canvas: HTMLCanvasElement;
  paintCanvas: HTMLCanvasElement;
  background3d: FruitBackgroundPresetsConfig;
  shaders: { vert: string; bgFrag: string; pieceFrag: string };
}): PuzzleRenderer {
  return new PuzzleRendererImpl(opts);
}
