import * as THREE from "three";

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
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tPrev;
        uniform float uDecay;
        uniform vec2 uTexel;
        in vec2 vUv;
        out vec4 outColor;

        void main() {
          vec4 c = texture(tPrev, vUv) * 0.56;
          c += texture(tPrev, vUv + vec2(uTexel.x, 0.0)) * 0.11;
          c += texture(tPrev, vUv - vec2(uTexel.x, 0.0)) * 0.11;
          c += texture(tPrev, vUv + vec2(0.0, uTexel.y)) * 0.11;
          c += texture(tPrev, vUv - vec2(0.0, uTexel.y)) * 0.11;
          outColor = c * uDecay;
        }
      `
    });

    this._presentMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      uniforms: { tTex: { value: this._read.texture } },
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tTex;
        in vec2 vUv;
        out vec4 outColor;
        void main() {
          outColor = texture(tTex, vUv);
        }
      `
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
    opts.renderer.setRenderTarget(null);
    opts.renderer.autoClear = true;
    opts.renderer.render(this._presentScene, this._orthoCam);

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


