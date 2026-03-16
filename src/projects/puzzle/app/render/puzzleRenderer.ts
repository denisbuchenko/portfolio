import * as THREE from "three";
import type { RuntimePiece } from "../runtimeTypes";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../../../fruits/types";
import type { FruitBackgroundRenderer } from "../../../fruits/index";
import type { FruitMaskedBackgroundRenderer } from "../../../fruits/index";
import { createFruitBackgroundRenderer, createFruitMaskedBackgroundRenderer } from "../../../fruits/index";
import type { PaintSystemGL } from "../paint/paintSystemGL";
import { createWebGLRenderer2D, createYDownOrthoCamera, resizeYDownOrthoCamera } from "./puzzle/three2d";
import { createPuzzleFallbackBgTextures } from "./puzzle/fallbackTextures";
import {
  createPuzzleBackgroundQuads,
  resizePuzzleBackgroundQuads,
  setPuzzleBackgroundQuadTexture,
  setPuzzleBackgroundQuadVisibility,
  syncPuzzleBackgroundQuadUniforms,
  type PuzzleBgQuad
} from "./puzzle/backgroundQuads";
import { disposePiecesMeshes, setPiecesMeshes, updatePiecesMeshes } from "./puzzle/pieceMeshes";
import puzzleVert from "../../../../shaders/puzzleTextured.vert.glsl?raw";
import texturePresentFrag from "../../../../shaders/texturePresent.frag.glsl?raw";

export type PuzzleRenderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  maskTex: THREE.Texture;
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
  readonly maskTex: THREE.Texture;

  private _resolution: THREE.Vector2;
  private _fruitBgLegacy: FruitBackgroundRenderer | null = null;
  private _fruitBgMasked: FruitMaskedBackgroundRenderer | null = null;
  private _isPrewarmed = false;
  private _isCompiled = false;
  private _fallback: ReturnType<typeof createPuzzleFallbackBgTextures>;
  private _bgQuads: PuzzleBgQuad[] = [];
  private _config: FruitBackgroundPresetsConfig;
  private _shaders: { vert: string; bgFrag: string; pieceFrag: string };
  private _paint: PaintSystemGL;
  private _mode: NonNullable<FruitBackgroundPresetsConfig["mode"]>;
  private _debugMaskQuad: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial> | null = null;

  constructor(opts: {
    canvas: HTMLCanvasElement;
    paint: PaintSystemGL;
    background3d: FruitBackgroundPresetsConfig;
    shaders: { vert: string; bgFrag: string; pieceFrag: string };
  }) {
    this._config = opts.background3d;
    this._shaders = opts.shaders;
    this._paint = opts.paint;
    this._mode = this._config.mode ?? "legacy7rt";

    this.renderer = createWebGLRenderer2D(opts.canvas);
    this.scene = new THREE.Scene();
    this.camera = createYDownOrthoCamera(1, 1);
    this._paint.attachRenderer(this.renderer);
    this.maskTex = this._paint.maskTexture;
    this._resolution = new THREE.Vector2(2, 2);

    this._fallback = createPuzzleFallbackBgTextures(opts.background3d);
    if (this._mode === "legacy7rt") {
      this._bgQuads = createPuzzleBackgroundQuads({
        scene: this.scene,
        config: opts.background3d,
        maskTex: this.maskTex,
        fallbackTexByBits: this._fallback.textures,
        resolution: this._resolution,
        shaders: { vert: opts.shaders.vert, bgFrag: opts.shaders.bgFrag }
      });
    }

    if (this._config.debugShowMask) {
      this._debugMaskQuad = this._createDebugMaskQuad();
      this.scene.add(this._debugMaskQuad);
    }
  }

  resize(w: number, h: number, dpr: number): void {
    this.renderer.setSize(w, h, false);
    resizeYDownOrthoCamera(this.camera, w, h);

    this._resolution.set(w, h);
    this._resizeDebugMaskQuad(w, h);
    if (this._mode === "legacy7rt") {
      resizePuzzleBackgroundQuads(this._bgQuads, w, h);
      this._fruitBgLegacy?.resize(w, h, dpr);
    } else {
      this._fruitBgMasked?.resize(w, h, dpr);
    }
  }

  markMaskDirty(): void {
    // RenderTarget texture не требует needsUpdate, но мы можем использовать этот хук
    // для legacy-пути (анализ активных слоёв) или для отладочных целей.
  }

  async loadAndPrewarm(dpr: number): Promise<void> {
    if (this._isPrewarmed) return;

    if (!this._config.enabled) {
      this._isPrewarmed = true;
      return;
    }

    if (this._mode === "legacy7rt") {
      this._fruitBgLegacy = createFruitBackgroundRenderer({ config: this._config });
      await this._fruitBgLegacy.load();
      const w = this.renderer.domElement.width;
      const h = this.renderer.domElement.height;
      if (w > 0 && h > 0) this._fruitBgLegacy.resize(w, h, dpr);
      this._prewarmLegacyBackground(dpr);
    } else {
      this._fruitBgMasked = createFruitMaskedBackgroundRenderer({ config: this._config });
      await this._fruitBgMasked.load();
      const w = this.renderer.domElement.width;
      const h = this.renderer.domElement.height;
      if (w > 0 && h > 0) this._fruitBgMasked.resize(w, h, dpr);
    }

    this._compileShaders();
    this._isPrewarmed = true;
  }

  private _prewarmLegacyBackground(dpr: number): void {
    if (!this._fruitBgLegacy) return;

    const all = new Set<FruitLayerBits>([1, 2, 3, 4, 5, 6, 7]);
    this._fruitBgLegacy.setActiveLayers(all);
    setPuzzleBackgroundQuadVisibility(this._bgQuads, all);

    const t0 = performance.now() * 0.001;
    for (let i = 0; i < 3; i++) {
      this._fruitBgLegacy.update(t0 + i * (1 / 60), dpr);
      this._fruitBgLegacy.renderTargets(this.renderer);
    }

    for (let i = 0; i < this._bgQuads.length; i++) {
      const bits = (i + 1) as FruitLayerBits;
      setPuzzleBackgroundQuadTexture(this._bgQuads, bits, this._fruitBgLegacy.getLayerTexture(bits));
    }
  }

  private _compileShaders(): void {
    if (this._isCompiled) return;
    this.renderer.compile(this.scene, this.camera);
    this._isCompiled = true;
  }

  private _createDebugMaskQuad(): THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial> {
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        tTex: { value: this.maskTex },
      },
      vertexShader: puzzleVert,
      fragmentShader: texturePresentFrag,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 1000;
    mesh.position.z = 5;
    return mesh;
  }

  private _resizeDebugMaskQuad(w: number, h: number): void {
    if (!this._debugMaskQuad) return;
    const size = Math.floor(Math.min(w, h) * 0.28);
    const pad = Math.floor(Math.min(w, h) * 0.02);
    this._debugMaskQuad.scale.set(size, size, 1);
    this._debugMaskQuad.position.set(w - pad - size * 0.5, pad + size * 0.5, 5);
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

    // Если фон отключен — ведём себя как “простой” 2D рендер пазла на clearColor.
    if (!this._config.enabled) {
      updatePiecesMeshes({ pieces, w, h, threshold: this._config.maskThreshold });
      const prevAutoClear = this.renderer.autoClear;
      const prevClr = new THREE.Color();
      this.renderer.getClearColor(prevClr);
      const prevAlpha = this.renderer.getClearAlpha();
      this.renderer.autoClear = true;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setClearColor(prevClr, prevAlpha);
      this.renderer.autoClear = prevAutoClear;
      return;
    }

    this._resolution.set(w, h);
    if (this._mode === "legacy7rt") {
      syncPuzzleBackgroundQuadUniforms(this._bgQuads, this._config);
      this._renderLegacyBackground(w, h, timeSec, dpr);
    } else {
      this._renderMaskedBackground(w, h, timeSec, dpr);
    }
    updatePiecesMeshes({ pieces, w, h, threshold: this._config.maskThreshold });

    const prevAutoClear = this.renderer.autoClear;
    const prevClr = new THREE.Color();
    this.renderer.getClearColor(prevClr);
    const prevAlpha = this.renderer.getClearAlpha();
    if (this._mode !== "legacy7rt") {
      // Фон+фрукты уже нарисованы отдельными pass'ами. Здесь только оверлей пазлов.
      this.renderer.autoClear = false;
    }
    if (this._mode === "legacy7rt") {
      this.renderer.setClearColor(0x000000, 0);
    }
    this.renderer.render(this.scene, this.camera);
    this.renderer.setClearColor(prevClr, prevAlpha);
    this.renderer.autoClear = prevAutoClear;
  }

  private _renderMaskedBackground(w: number, h: number, timeSec: number, dpr: number): void {
    if (!this._fruitBgMasked) return;
    this._fruitBgMasked.update(timeSec, dpr);
    this._fruitBgMasked.render({
      renderer: this.renderer,
      maskTex: this.maskTex,
      width: w,
      height: h,
      threshold: this._config.maskThreshold
    });
  }

  private _renderLegacyBackground(_w: number, _h: number, timeSec: number, dpr: number): void {
    if (this._fruitBgLegacy) {
      this._fruitBgLegacy.update(timeSec, dpr);
      this._fruitBgLegacy.renderTargets(this.renderer);
      for (let i = 0; i < this._bgQuads.length; i++) {
        const bits = (i + 1) as FruitLayerBits;
        setPuzzleBackgroundQuadTexture(this._bgQuads, bits, this._fruitBgLegacy.getLayerTexture(bits));
        this._bgQuads[i].visible = true;
      }
      return;
    }
    this._renderFallbackBackground();
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
  paint: PaintSystemGL;
  background3d: FruitBackgroundPresetsConfig;
  shaders: { vert: string; bgFrag: string; pieceFrag: string };
}): PuzzleRenderer {
  return new PuzzleRendererImpl(opts);
}
