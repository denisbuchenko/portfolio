import * as THREE from "three";
import type { GasPoints } from "../../particles/gasPoints";
import { loadSvgPathSamples, mapSvgPointsToWorld } from "../../scene/svgPath";

export class SplineSvgPath {
  private _rawSvgPoints: THREE.Vector2[] | null = null;
  private _tex: THREE.DataTexture | null = null;
  private _ptsWorld: THREE.Vector2[] | null = null;
  private _samples: number;
  private _fit: number;

  constructor(opts: { samples: number; fit: number }) {
    this._samples = Math.max(2, Math.floor(opts.samples));
    this._fit = THREE.MathUtils.clamp(opts.fit, 0.05, 1.0);
  }

  async load(url: string): Promise<void> {
    const sample = await loadSvgPathSamples({ url, samples: this._samples });
    this._rawSvgPoints = sample.pointsSvg;
  }

  get worldPoints(): THREE.Vector2[] | null {
    return this._ptsWorld;
  }

  applyToWorld(opts: { viewBounds: THREE.Vector2; pathLine: THREE.Line; gas: GasPoints }): void {
    if (!this._rawSvgPoints) return;

    const ptsWorld = mapSvgPointsToWorld({
      pointsSvg: this._rawSvgPoints,
      targetHalfBounds: opts.viewBounds,
      fit: this._fit
    });
    this._ptsWorld = ptsWorld;

    this._updateLine(opts.pathLine, ptsWorld);
    const tex = this._createPathTexture(ptsWorld);

    if (this._tex) this._tex.dispose();
    this._tex = tex;

    (opts.gas.uniforms.uPathTex.value as THREE.Texture | null) = tex;
    (opts.gas.uniforms.uPathCount.value as number) = ptsWorld.length;
    (opts.gas.uniforms.uPathUseTexture.value as number) = 1;
  }

  disable(gas: GasPoints): void {
    (gas.uniforms.uPathUseTexture.value as number) = 0;
  }

  dispose(): void {
    if (this._tex) this._tex.dispose();
    this._tex = null;
  }

  private _updateLine(line: THREE.Line, ptsWorld: THREE.Vector2[]): void {
    const verts = ptsWorld.map((p) => new THREE.Vector3(p.x, p.y, 0));
    const geom = new THREE.BufferGeometry().setFromPoints(verts);
    line.geometry.dispose();
    line.geometry = geom;
  }

  private _createPathTexture(ptsWorld: THREE.Vector2[]): THREE.DataTexture {
    const n = ptsWorld.length;
    const data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = ptsWorld[i];
      const o = i * 4;
      data[o + 0] = p.x;
      data[o + 1] = p.y;
      data[o + 2] = 0;
      data[o + 3] = 1;
    }

    const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  }
}


