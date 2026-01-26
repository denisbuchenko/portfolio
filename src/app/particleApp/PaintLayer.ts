import * as THREE from "three";
import { assert } from "../../utils/assert";

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
          vec4 c = texture(tPrev, vUv) * 0.50;
          c += texture(tPrev, vUv + vec2(uTexel.x, 0.0)) * 0.12;
          c += texture(tPrev, vUv - vec2(uTexel.x, 0.0)) * 0.12;
          c += texture(tPrev, vUv + vec2(0.0, uTexel.y)) * 0.13;
          c += texture(tPrev, vUv - vec2(0.0, uTexel.y)) * 0.13;
          outColor = c * uDecay;
        }
      `
    });

    this._stampMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uRadius: { value: 0.05 },
        uStrength: { value: 1.0 },
        uNoiseScale: { value: 14.0 },
        uEdgeAmp: { value: 0.28 },
        uEdgeSoftness: { value: 0.14 },
        uGlowIntensity: { value: 1.1 },
        uPulseSpeed: { value: 2.2 }
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
        in vec2 vUv;
        out vec4 outColor;

        uniform float uTime;
        uniform vec2 uCenter;
        uniform float uRadius;
        uniform float uStrength;
        uniform float uNoiseScale;
        uniform float uEdgeAmp;
        uniform float uEdgeSoftness;
        uniform float uGlowIntensity;
        uniform float uPulseSpeed;

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash12(i);
          float b = hash12(i + vec2(1.0, 0.0));
          float c = hash12(i + vec2(0.0, 1.0));
          float d = hash12(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.55;
          for (int i = 0; i < 4; i++) {
            v += a * valueNoise(p);
            p *= 2.03;
            a *= 0.55;
          }
          return v;
        }

        void main() {
          vec2 d = (vUv - uCenter);
          float dist = length(d);
          float dn = dist / max(uRadius, 1e-6);

          vec2 p = d * uNoiseScale + vec2(uTime * 0.35, -uTime * 0.28);
          float n = fbm(p) - 0.5;

          float boundary = 1.0 + uEdgeAmp * n;
          float fill = 1.0 - smoothstep(boundary - uEdgeSoftness, boundary, dn);
          float a = clamp(fill * uStrength, 0.0, 1.0);
          outColor = vec4(0.0, 0.0, 0.0, a);
        }
      `
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
        uPulseSpeed: { value: 2.2 }
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
        uniform sampler2D tTex;
        uniform float uTime;
        uniform float uNoiseScale;
        uniform float uEdgeAmp;
        uniform float uEdgeSoftness;
        uniform float uGlowIntensity;
        uniform float uPulseSpeed;
        in vec2 vUv;
        out vec4 outColor;

        float hash13(vec3 p) {
          vec3 p3 = fract(p * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float valueNoise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);

          float n000 = hash13(i);
          float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

          vec3 u = f * f * (3.0 - 2.0 * f);

          float nx00 = mix(n000, n100, u.x);
          float nx10 = mix(n010, n110, u.x);
          float nx01 = mix(n001, n101, u.x);
          float nx11 = mix(n011, n111, u.x);
          float nxy0 = mix(nx00, nx10, u.y);
          float nxy1 = mix(nx01, nx11, u.y);
          return mix(nxy0, nxy1, u.z);
        }

        float fbm3(vec3 p) {
          float v = 0.0;
          float a = 0.55;
          for (int i = 0; i < 4; i++) {
            v += a * valueNoise3(p);
            p *= 2.03;
            a *= 0.55;
          }
          return v;
        }

        vec3 paintPalette(float t) {
          vec3 blue = vec3(0.12, 0.40, 1.00);
          vec3 lightBlue = vec3(0.34, 0.78, 1.00);
          vec3 white = vec3(0.95, 0.98, 1.00);

          float a = smoothstep(0.0, 1.0, t);
          vec3 c = mix(blue, lightBlue, a);
          float w = smoothstep(0.65, 1.0, t);
          return mix(c, white, w);
        }

        void main() {
          float density = texture(tTex, vUv).a;
          if (density <= 0.0005) {
            outColor = vec4(0.0);
            return;
          }

          float t = uTime * 0.18;
          vec3 q = vec3(vUv * uNoiseScale, t);
          vec2 flow = vec2(fbm3(q + vec3(2.1, 1.3, 0.0)), fbm3(q + vec3(5.2, 3.7, 0.0))) - 0.5;
          q.xy += 0.70 * flow;
          float n = fbm3(q * 1.15) - 0.5;

          float edgeBand = smoothstep(0.02, 0.25, density) * (1.0 - smoothstep(0.25, 0.65, density));
          float warped = clamp(density + edgeBand * n * uEdgeAmp, 0.0, 1.0);

          float a = smoothstep(0.15 - uEdgeSoftness, 0.15 + uEdgeSoftness, warped);
          float pulseNoise = fbm3(vec3(vUv * (uNoiseScale * 0.32), uTime * 0.11));
          float pulse = 0.72 + 0.28 * sin(uTime * uPulseSpeed + 6.28318 * pulseNoise);
          float glow = (1.0 - smoothstep(0.18, 0.85, warped));
          glow = pow(max(glow, 0.0), 2.2) * uGlowIntensity * pulse;

          float hueT = clamp(0.35 + 0.65 * (0.5 + n) + 0.10 * sin(uTime * 0.6 + 6.28318 * pulseNoise), 0.0, 1.0);
          vec3 base = paintPalette(hueT);
          float light = clamp(0.55 * a + glow, 0.0, 2.0);
          vec3 col = base * light;
          outColor = vec4(col, a);
        }
      `
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
    (this._fadeMat.uniforms.uTexel.value as THREE.Vector2).set(0, 0);

    opts.renderer.setRenderTarget(this._write);
    opts.renderer.autoClear = true;
    opts.renderer.render(this._fadeScene, this._orthoCam);

    if (opts.stamps.length > 0) {
      (this._stampMat.uniforms.uTime.value as number) = opts.time;
      (this._stampMat.uniforms.uNoiseScale.value as number) = opts.noiseScale;
      (this._stampMat.uniforms.uEdgeAmp.value as number) = opts.edgeAmp;
      (this._stampMat.uniforms.uEdgeSoftness.value as number) = opts.edgeSoftness;
      (this._stampMat.uniforms.uGlowIntensity.value as number) = opts.glowIntensity;
      (this._stampMat.uniforms.uPulseSpeed.value as number) = opts.pulseSpeed;

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
    }
  ): void {
    (this._presentMat.uniforms.uTime.value as number) = opts.time;
    (this._presentMat.uniforms.uNoiseScale.value as number) = opts.noiseScale;
    (this._presentMat.uniforms.uEdgeAmp.value as number) = opts.edgeAmp;
    (this._presentMat.uniforms.uEdgeSoftness.value as number) = opts.edgeSoftness;
    (this._presentMat.uniforms.uGlowIntensity.value as number) = opts.glowIntensity;
    (this._presentMat.uniforms.uPulseSpeed.value as number) = opts.pulseSpeed;
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


