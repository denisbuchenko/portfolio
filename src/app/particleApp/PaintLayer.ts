import * as THREE from "three";
import { assert } from "../../utils/assert";

import fullscreenVert from "../../shaders/fullscreenQuad.vert.glsl?raw";
import paintFadeFrag from "../../shaders/paintFade.frag.glsl?raw";
import paintStampFrag from "../../shaders/paintStamp.frag.glsl?raw";
import paintPresentFrag from "../../shaders/paintPresent.frag.glsl?raw";

export class PaintLayer {
  private _read!: THREE.WebGLRenderTarget;
  private _write!: THREE.WebGLRenderTarget;
  private _orthoCam!: THREE.OrthographicCamera;
  private _fadeScene!: THREE.Scene;
  private _presentScene!: THREE.Scene;
  private _stampScene!: THREE.Scene;
  private _fadeMat!: THREE.ShaderMaterial;
  private _presentMat!: THREE.ShaderMaterial;
  private _stampMat!: THREE.ShaderMaterial;

  private _w = 0;
  private _h = 0;

  init(renderer: THREE.WebGLRenderer): void {
    this._orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeom = new THREE.PlaneGeometry(2, 2);

    const { w, h } = this._computeSize(renderer);
    this._w = w;
    this._h = h;
    this._read = this._createRT(w, h);
    this._write = this._createRT(w, h);

    this._fadeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: {
        tPrev: { value: this._read.texture },
        uDecay: { value: 0.98 },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }
      },
      vertexShader: fullscreenVert,
      fragmentShader: paintFadeFrag
    });

    this._stampMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0.05 },
        uStrength: { value: 1.0 },
        uEdgeSoftness: { value: 0.14 }
      },
      vertexShader: fullscreenVert,
      fragmentShader: paintStampFrag
    });

    this._presentMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.NormalBlending,
      uniforms: {
        tTex: { value: this._read.texture },
        uTime: { value: 0 },
        uNoiseScale: { value: 14.0 },
        uEdgeAmp: { value: 0.28 },
        uEdgeSoftness: { value: 0.14 },
        uGlowIntensity: { value: 1.1 },
        uPulseSpeed: { value: 2.2 },
        uWarpScale: { value: 6.0 },
        uWarpSpeed: { value: 0.45 },
        uWarpAmp: { value: 0.028 },
        uContourThreshold: { value: 0.18 },
        uContourWidth: { value: 0.035 },
        uContourNoiseAmp: { value: 0.22 }
      },
      vertexShader: fullscreenVert,
      fragmentShader: paintPresentFrag
    });

    this._fadeScene = new THREE.Scene();
    this._fadeScene.add(new THREE.Mesh(quadGeom, this._fadeMat));
    this._presentScene = new THREE.Scene();
    this._presentScene.add(new THREE.Mesh(quadGeom, this._presentMat));
    this._stampScene = new THREE.Scene();
    this._stampScene.add(new THREE.Mesh(quadGeom, this._stampMat));
  }

  resize(renderer: THREE.WebGLRenderer): void {
    const { w, h } = this._computeSize(renderer);
    this._w = w;
    this._h = h;
    this._read.setSize(w, h);
    this._write.setSize(w, h);
    (this._fadeMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  getSize(): { w: number; h: number } {
    return { w: this._w, h: this._h };
  }

  step(opts: {
    renderer: THREE.WebGLRenderer;
    time: number;
    stamps: { uv: THREE.Vector2; radiusUv: number; strength: number }[];
    noiseScale: number;
    edgeAmp: number;
    edgeSoftness: number;
    glowIntensity: number;
    pulseSpeed: number;
  }): void {
    assert(this._w > 0 && this._h > 0, "PaintLayer not initialized");

    if (opts.stamps.length === 0) {
      (this._presentMat.uniforms.tTex.value as THREE.Texture) = this._read.texture;
      return;
    }

    (this._fadeMat.uniforms.tPrev.value as THREE.Texture) = this._read.texture;
    (this._fadeMat.uniforms.uDecay.value as number) = 1.0;

    opts.renderer.setRenderTarget(this._write);
    opts.renderer.autoClear = true;
    opts.renderer.render(this._fadeScene, this._orthoCam);

    if (opts.stamps.length > 0) {
      (this._stampMat.uniforms.uEdgeSoftness.value as number) = opts.edgeSoftness;

      opts.renderer.autoClear = false;
      for (const s of opts.stamps) {
        (this._stampMat.uniforms.uCenter.value as THREE.Vector2).copy(s.uv);
        (this._stampMat.uniforms.uRadius.value as number) = s.radiusUv;
        (this._stampMat.uniforms.uStrength.value as number) = s.strength;
        opts.renderer.render(this._stampScene, this._orthoCam);
      }
    }

    const tmp = this._read;
    this._read = this._write;
    this._write = tmp;
    (this._presentMat.uniforms.tTex.value as THREE.Texture) = this._read.texture;
  }

  present(
    renderer: THREE.WebGLRenderer,
    opts: {
      time: number;
      noiseScale: number;
      edgeAmp: number;
      edgeSoftness: number;
      glowIntensity: number;
      pulseSpeed: number;
      warpScale: number;
      warpSpeed: number;
      warpAmp: number;
      contourThreshold: number;
      contourWidth: number;
      contourNoiseAmp: number;
    }
  ): void {
    (this._presentMat.uniforms.uTime.value as number) = opts.time;
    (this._presentMat.uniforms.uNoiseScale.value as number) = opts.noiseScale;
    (this._presentMat.uniforms.uEdgeAmp.value as number) = opts.edgeAmp;
    (this._presentMat.uniforms.uEdgeSoftness.value as number) = opts.edgeSoftness;
    (this._presentMat.uniforms.uGlowIntensity.value as number) = opts.glowIntensity;
    (this._presentMat.uniforms.uPulseSpeed.value as number) = opts.pulseSpeed;
    (this._presentMat.uniforms.uWarpScale.value as number) = opts.warpScale;
    (this._presentMat.uniforms.uWarpSpeed.value as number) = opts.warpSpeed;
    (this._presentMat.uniforms.uWarpAmp.value as number) = opts.warpAmp;
    (this._presentMat.uniforms.uContourThreshold.value as number) = opts.contourThreshold;
    (this._presentMat.uniforms.uContourWidth.value as number) = opts.contourWidth;
    (this._presentMat.uniforms.uContourNoiseAmp.value as number) = opts.contourNoiseAmp;
    renderer.setRenderTarget(null);
    renderer.render(this._presentScene, this._orthoCam);
  }

  private _computeSize(renderer: THREE.WebGLRenderer): { w: number; h: number } {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.floor(size.x));
    const h = Math.max(1, Math.floor(size.y));
    return { w, h };
  }

  private _createRT(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter
    });
    rt.texture.generateMipmaps = false;
    return rt;
  }
}


