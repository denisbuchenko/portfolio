import * as THREE from "three";
import type { RuntimePiece } from "../runtimeTypes";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../../../fruits/types";
import type { FruitBackgroundRenderer } from "../../../fruits/core/index";
import { createFruitBackgroundRenderer } from "../../../fruits/core/index";

export type PuzzleRenderer = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  maskTex: THREE.CanvasTexture;
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
  const renderer = new THREE.WebGLRenderer({
    canvas: opts.canvas,
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  renderer.autoClear = true;
  renderer.setPixelRatio(1); // canvas уже в px, мы сами ресайзим.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  let camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

  const maskTex = new THREE.CanvasTexture(opts.paintCanvas);
  maskTex.generateMipmaps = false;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.wrapS = THREE.ClampToEdgeWrapping;
  maskTex.wrapT = THREE.ClampToEdgeWrapping;

  const resolution = new THREE.Vector2(2, 2);
  let fruitBg: FruitBackgroundRenderer | null = null;

  const fallbackBgTexByBits: Record<FruitLayerBits, THREE.DataTexture> = {
    1: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    2: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    3: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    4: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    5: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    6: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat),
    7: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat)
  };

  function _syncFallbackTex(): void {
    for (let bits = 1; bits <= 7; bits++) {
      const b = bits as FruitLayerBits;
      const c = new THREE.Color(opts.background3d.layers[b].bg);
      const r = Math.round(Math.max(0, Math.min(1, c.r)) * 255);
      const g = Math.round(Math.max(0, Math.min(1, c.g)) * 255);
      const bb = Math.round(Math.max(0, Math.min(1, c.b)) * 255);
      const t = fallbackBgTexByBits[b];
      const d = t.image.data as Uint8Array;
      d[0] = r;
      d[1] = g;
      d[2] = bb;
      d[3] = 255;
      t.needsUpdate = true;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    }
  }

  _syncFallbackTex();

  const bgQuads: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>> = [];
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        tMask: { value: maskTex },
        tBg: { value: fallbackBgTexByBits[b] },
        uResolution: { value: resolution.clone() },
        uThreshold: { value: opts.background3d.maskThreshold },
        uBits: { value: bits },
        uBgColor: { value: new THREE.Color(opts.background3d.layers[b].bg) }
      },
      vertexShader: opts.shaders.vert,
      fragmentShader: opts.shaders.bgFrag
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = -20 + bits;
    mesh.position.z = -9;
    scene.add(mesh);
    bgQuads.push(mesh);
  }

  function resize(w: number, h: number, dpr: number): void {
    renderer.setSize(w, h, false);
    camera = new THREE.OrthographicCamera(0, w, 0, h, -10, 10);
    // y вниз: top=0, bottom=h (да, это переворачивает winding; мы рисуем DoubleSide)
    camera.top = 0;
    camera.bottom = h;
    camera.left = 0;
    camera.right = w;
    camera.updateProjectionMatrix();

    resolution.set(w, h);
    for (const q of bgQuads) {
      q.scale.set(w, h, 1);
      q.position.set(w * 0.5, h * 0.5, -9);
      (q.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }

    fruitBg?.resize(w, h, dpr);
  }

  function markMaskDirty(): void {
    maskTex.needsUpdate = true;
  }

  function disposePiecesMeshes(pieces: RuntimePiece[]): void {
    for (const p of pieces) {
      if (!p.mesh) continue;
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      // texture dispose:
      const t = p.mesh.material.uniforms.tPiece.value as THREE.Texture;
      t.dispose();
      p.mesh = undefined;
    }
  }

  function setPiecesMeshes(pieces: RuntimePiece[]): void {
    // создаём меши/материалы для кусочков
    for (const p of pieces) {
      const tex = new THREE.Texture(p.img.bitmap);
      tex.needsUpdate = true;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          tPiece: { value: tex },
          tMask: { value: maskTex },
          uResolution: { value: new THREE.Vector2(2, 2) },
          uPieceBits: { value: p.maskBits | 0 },
          uThreshold: { value: opts.background3d.maskThreshold }
        },
        vertexShader: opts.shaders.vert,
        fragmentShader: opts.shaders.pieceFrag
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = 10;
      p.mesh = mesh;
      scene.add(mesh);
    }
  }

  fruitBg = opts.background3d.enabled ? createFruitBackgroundRenderer({ config: opts.background3d, ui: undefined }) : null;
  if (fruitBg !== null) {
    void fruitBg.load().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("FruitBackground load failed:", e);
    });
  }

  function render(pieces: RuntimePiece[], timeSec: number, dpr: number): void {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    resolution.set(w, h);
    // update background quads
    for (let i = 0; i < bgQuads.length; i++) {
      const bits = (i + 1) as FruitLayerBits;
      const q = bgQuads[i];
      (q.material.uniforms.uThreshold.value as number) = opts.background3d.maskThreshold;
      (q.material.uniforms.uBgColor.value as THREE.Color).set(opts.background3d.layers[bits].bg);
    }

    if (fruitBg) {
      fruitBg.update(timeSec, dpr);
      fruitBg.renderTargets(renderer);
      for (let i = 0; i < bgQuads.length; i++) {
        const bits = (i + 1) as FruitLayerBits;
        const q = bgQuads[i];
        (q.material.uniforms.tBg.value as THREE.Texture) = fruitBg.getLayerTexture(bits);
      }
    } else {
      for (let i = 0; i < bgQuads.length; i++) {
        const bits = (i + 1) as FruitLayerBits;
        const q = bgQuads[i];
        (q.material.uniforms.tBg.value as THREE.Texture) = fallbackBgTexByBits[bits];
      }
    }

    for (let i = 0; i < pieces.length; i++) {
      const rp = pieces[i];
      if (!rp.mesh) continue;
      rp.mesh.renderOrder = 10 + i;
      const pad = rp.img.geom.padPx;
      const dx = rp.x - pad;
      const dy = rp.y - pad;
      const bw = rp.img.bitmap.width;
      const bh = rp.img.bitmap.height;
      rp.mesh.scale.set(bw, bh, 1);
      rp.mesh.position.set(dx + bw * 0.5, dy + bh * 0.5, 0);
      (rp.mesh.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
      (rp.mesh.material.uniforms.uThreshold.value as number) = opts.background3d.maskThreshold;
    }

    renderer.setClearColor(0x070a10, 1);
    renderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    maskTex,
    resize,
    markMaskDirty,
    render,
    setPiecesMeshes,
    disposePiecesMeshes
  };
}


