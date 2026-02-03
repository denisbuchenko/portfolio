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
  syncPuzzleBackgroundQuadUniforms
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

export function createPuzzleRenderer(opts: {
  canvas: HTMLCanvasElement;
  paintCanvas: HTMLCanvasElement;
  background3d: FruitBackgroundPresetsConfig;
  shaders: {
    vert: string;
    bgFrag: string;
    pieceFrag: string;
  };
}): PuzzleRenderer {
  const renderer = createWebGLRenderer2D(opts.canvas);
  const scene = new THREE.Scene();
  const camera = createYDownOrthoCamera(1, 1);
  const maskTex = createCanvasMaskTexture(opts.paintCanvas);

  const resolution = new THREE.Vector2(2, 2);
  let fruitBg: FruitBackgroundRenderer | null = null;
  let isPrewarmed = false;
  let isCompiled = false;

  const fallback = createPuzzleFallbackBgTextures(opts.background3d);
  const bgQuads = createPuzzleBackgroundQuads({
    scene,
    config: opts.background3d,
    maskTex,
    fallbackTexByBits: fallback.textures,
    resolution,
    shaders: { vert: opts.shaders.vert, bgFrag: opts.shaders.bgFrag }
  });

  function resize(w: number, h: number, dpr: number): void {
    renderer.setSize(w, h, false);
    resizeYDownOrthoCamera(camera, w, h);

    resolution.set(w, h);
    resizePuzzleBackgroundQuads(bgQuads, w, h);

    fruitBg?.resize(w, h, dpr);
  }

  const maskAnalyzer = new MaskActiveLayerAnalyzer({ analyzeSize: 64, analysisIntervalFrames: 30 });

  function markMaskDirty(): void {
    maskTex.needsUpdate = true;
    maskAnalyzer.markDirty();
  }

  async function loadAndPrewarm(dpr: number): Promise<void> {
    if (isPrewarmed) return;

    fruitBg = opts.background3d.enabled ? createFruitBackgroundRenderer({ config: opts.background3d }) : null;
    if (!fruitBg) {
      isPrewarmed = true;
      return;
    }

    await fruitBg.load();

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    if (w > 0 && h > 0) {
      fruitBg.resize(w, h, dpr);
    }

    // Прогреваем все 7 слоёв сразу, чтобы компиляция шейдеров и первый рендер RT
    // не происходили в момент первого штриха.
    const all = new Set<FruitLayerBits>([1, 2, 3, 4, 5, 6, 7]);
    fruitBg.setActiveLayers(all);
    setPuzzleBackgroundQuadVisibility(bgQuads, all);

    const t0 = performance.now() * 0.001;
    for (let i = 0; i < 3; i++) {
      fruitBg.update(t0 + i * (1 / 60), dpr);
      fruitBg.renderTargets(renderer);
    }

    // Обновим ссылки на текстуры заранее (избегаем “свопа” в первом кадре).
    for (let i = 0; i < bgQuads.length; i++) {
      const bits = (i + 1) as FruitLayerBits;
      setPuzzleBackgroundQuadTexture(bgQuads, bits, fruitBg.getLayerTexture(bits));
    }

    // Прогреваем компиляцию материалов пазла (фон/кусочки) один раз.
    if (!isCompiled) {
      renderer.compile(scene, camera);
      isCompiled = true;
    }

    isPrewarmed = true;
  }

  function setPiecesMeshesPublic(pieces: RuntimePiece[]): void {
    setPiecesMeshes({
      scene,
      pieces,
      maskTex,
      threshold: opts.background3d.maskThreshold,
      shaders: { vert: opts.shaders.vert, pieceFrag: opts.shaders.pieceFrag }
    });
  }

  function disposePiecesMeshesPublic(pieces: RuntimePiece[]): void {
    disposePiecesMeshes(scene, pieces);
  }

  function render(pieces: RuntimePiece[], timeSec: number, dpr: number): void {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    resolution.set(w, h);
    syncPuzzleBackgroundQuadUniforms(bgQuads, opts.background3d);

    if (fruitBg) {
      const maskUpdate = maskAnalyzer.update({
        maskTex,
        width: w,
        height: h,
        threshold: opts.background3d.maskThreshold,
        timeSec
      });
      if (maskUpdate.didRun) {
        setPuzzleBackgroundQuadVisibility(bgQuads, maskUpdate.activeLayers);
        if (maskUpdate.didChange) fruitBg.setActiveLayers(maskUpdate.activeLayers);
      }

      fruitBg.update(timeSec, dpr);
      fruitBg.renderTargets(renderer);

      for (let i = 0; i < bgQuads.length; i++) {
        const q = bgQuads[i];
        if (!q.visible) continue;
        const bits = (i + 1) as FruitLayerBits;
        const texture = fruitBg.getLayerTexture(bits);
        setPuzzleBackgroundQuadTexture(bgQuads, bits, texture);
      }
    } else {
      fallback.syncFromConfig();
      for (let bits = 1; bits <= 7; bits++) {
        const b = bits as FruitLayerBits;
        setPuzzleBackgroundQuadTexture(bgQuads, b, fallback.textures[b]);
        bgQuads[bits - 1].visible = true;
      }
    }

    updatePiecesMeshes({ pieces, w, h, threshold: opts.background3d.maskThreshold });

    renderer.setClearColor(0x070a10, 1);
    renderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    maskTex,
    loadAndPrewarm,
    resize,
    markMaskDirty,
    render,
    setPiecesMeshes: setPiecesMeshesPublic,
    disposePiecesMeshes: disposePiecesMeshesPublic
  };
}


