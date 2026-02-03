import * as THREE from "three";
import type { FruitLayerBits } from "../../../../fruits/types";

function _allBits(): Set<FruitLayerBits> {
  return new Set<FruitLayerBits>([1, 2, 3, 4, 5, 6, 7]);
}

function _setEquals(a: Set<FruitLayerBits>, b: Set<FruitLayerBits>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export class MaskActiveLayerAnalyzer {
  _lastMaskAnalysisFrame = 0;
  _maskAnalysisIntervalFrames: number;
  _isMaskDirty = true;
  _lastActiveLayers: Set<FruitLayerBits> = _allBits();

  _analyzeSize: number;
  _canvas: HTMLCanvasElement;
  _ctx: CanvasRenderingContext2D | null;

  constructor(opts: { analyzeSize: number; analysisIntervalFrames: number }) {
    this._analyzeSize = opts.analyzeSize;
    this._maskAnalysisIntervalFrames = opts.analysisIntervalFrames;
    this._canvas = document.createElement("canvas");
    this._canvas.width = this._analyzeSize;
    this._canvas.height = this._analyzeSize;
    this._ctx = this._canvas.getContext("2d", { willReadFrequently: true });
  }

  markDirty(): void {
    this._isMaskDirty = true;
  }

  update(opts: {
    maskTex: THREE.CanvasTexture;
    width: number;
    height: number;
    threshold: number;
    timeSec: number;
  }): { didRun: boolean; activeLayers: Set<FruitLayerBits>; didChange: boolean } {
    const currentFrame = Math.floor(opts.timeSec * 60);
    if (!this._isMaskDirty || currentFrame - this._lastMaskAnalysisFrame < this._maskAnalysisIntervalFrames) {
      return { didRun: false, activeLayers: this._lastActiveLayers, didChange: false };
    }

    const activeLayers = this._analyze(opts.maskTex, opts.width, opts.height, opts.threshold);
    const didChange = !_setEquals(this._lastActiveLayers, activeLayers);
    this._lastActiveLayers = activeLayers;
    this._lastMaskAnalysisFrame = currentFrame;
    this._isMaskDirty = false;
    return { didRun: true, activeLayers, didChange };
  }

  _analyze(maskTex: THREE.CanvasTexture, width: number, height: number, threshold: number): Set<FruitLayerBits> {
    const activeBits = new Set<FruitLayerBits>();
    const canvas = maskTex.image as HTMLCanvasElement;
    if (!canvas || !this._ctx) return _allBits();

    this._ctx.clearRect(0, 0, this._analyzeSize, this._analyzeSize);
    this._ctx.drawImage(canvas, 0, 0, width, height, 0, 0, this._analyzeSize, this._analyzeSize);

    const imgData = this._ctx.getImageData(0, 0, this._analyzeSize, this._analyzeSize);
    const data = imgData.data;
    const threshold255 = threshold * 255;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const br = r >= threshold255 ? 1 : 0;
      const bg = g >= threshold255 ? 1 : 0;
      const bb = b >= threshold255 ? 1 : 0;
      const bits = (br + 2 * bg + 4 * bb) as FruitLayerBits;
      if (bits >= 1 && bits <= 7) activeBits.add(bits);
    }

    if (activeBits.size === 0) return _allBits();
    return activeBits;
  }
}

