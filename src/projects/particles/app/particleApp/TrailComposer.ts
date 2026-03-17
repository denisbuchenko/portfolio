import * as THREE from "three";

import fullscreenVert from "../../../../shaders/fullscreenQuad.vert.glsl?raw";
import trailsFadeFrag from "../../../../shaders/trailsFade.frag.glsl?raw";
import texturePresentFrag from "../../../../shaders/texturePresent.frag.glsl?raw";

export class TrailComposer {
  private _read!: THREE.WebGLRenderTarget;
  private _write!: THREE.WebGLRenderTarget;
  private _fadeScene!: THREE.Scene;
  private _presentScene!: THREE.Scene;
  private _orthoCam!: THREE.OrthographicCamera;
  private _fadeMat!: THREE.ShaderMaterial;
  private _presentMat!: THREE.ShaderMaterial;

  init(renderer: THREE.WebGLRenderer): void {
    this._orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeom = new THREE.PlaneGeometry(2, 2);

    const { w, h } = this._computeSize(renderer);
    this._read = this._createRT(w, h);
    this._write = this._createRT(w, h);

    this._fadeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: {
        tPrev: { value: this._read.texture },
        uDecay: { value: 0.95 },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) }
      },
      vertexShader: fullscreenVert,
      fragmentShader: trailsFadeFrag
    });

    this._presentMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // We want trails to add over the already drawn paint layer.
      // Important: trail RT alpha may be ~0, so classic AdditiveBlending (SRC_ALPHA, ONE)
      // can make trails invisible. Use ONE, ONE instead.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      uniforms: { tTex: { value: this._read.texture } },
      vertexShader: fullscreenVert,
      fragmentShader: texturePresentFrag
    });

    this._fadeScene = new THREE.Scene();
    this._fadeScene.add(new THREE.Mesh(quadGeom, this._fadeMat));
    this._presentScene = new THREE.Scene();
    this._presentScene.add(new THREE.Mesh(quadGeom, this._presentMat));
  }

  resize(renderer: THREE.WebGLRenderer): void {
    const { w, h } = this._computeSize(renderer);
    this._read.setSize(w, h);
    this._write.setSize(w, h);
    (this._fadeMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  clear(renderer: THREE.WebGLRenderer): void {
    if (!this._read || !this._write) return;

    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClr = new THREE.Color();
    renderer.getClearColor(prevClr);
    const prevAlpha = renderer.getClearAlpha();

    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;

    renderer.setRenderTarget(this._read);
    renderer.clear(true, true, true);
    renderer.setRenderTarget(this._write);
    renderer.clear(true, true, true);

    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevClr, prevAlpha);
    renderer.autoClear = prevAutoClear;
  }

  renderFrame(opts: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    pathLine: THREE.Object3D;
    setGasVisual: (o: { pointSize: number; alphaMul: number }) => void;
    basePointSize: number;
    trailPointSizeMul: number;
    trailStampAlpha: number;
    decay: number;
    presentToScreen?: boolean;
  }): void {
    (this._fadeMat.uniforms.tPrev.value as THREE.Texture) = this._read.texture;
    (this._fadeMat.uniforms.uDecay.value as number) = opts.decay;

    opts.renderer.setRenderTarget(this._write);
    opts.renderer.autoClear = true;
    opts.renderer.render(this._fadeScene, this._orthoCam);

    opts.renderer.autoClear = false;
    opts.setGasVisual({ pointSize: opts.basePointSize * opts.trailPointSizeMul, alphaMul: opts.trailStampAlpha });
    const wasLineVisible = opts.pathLine.visible;
    opts.pathLine.visible = false;
    opts.renderer.render(opts.scene, opts.camera);
    opts.pathLine.visible = wasLineVisible;

    const tmp = this._read;
    this._read = this._write;
    this._write = tmp;

    (this._presentMat.uniforms.tTex.value as THREE.Texture) = this._read.texture;
    if (opts.presentToScreen !== false) {
      opts.renderer.setRenderTarget(null);
      opts.renderer.autoClear = false;
      opts.renderer.render(this._presentScene, this._orthoCam);
    }

    opts.renderer.autoClear = false;
    opts.setGasVisual({ pointSize: opts.basePointSize, alphaMul: 1.0 });
    opts.renderer.render(opts.scene, opts.camera);
  }

  private _computeSize(renderer: THREE.WebGLRenderer): { w: number; h: number } {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const scale = this._resolutionScale(renderer);
    const w = Math.max(1, Math.floor(size.x * scale));
    const h = Math.max(1, Math.floor(size.y * scale));
    return { w, h };
  }

  private _resolutionScale(renderer: THREE.WebGLRenderer): number {
    const pr = renderer.getPixelRatio();
    return pr > 1 ? 2 : 1;
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


