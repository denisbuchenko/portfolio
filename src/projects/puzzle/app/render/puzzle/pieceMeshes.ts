import * as THREE from "three";
import type { RuntimePiece } from "../../runtimeTypes";

export function setPiecesMeshes(opts: {
  scene: THREE.Scene;
  pieces: RuntimePiece[];
  maskTex: THREE.Texture;
  threshold: number;
  shaders: { vert: string; pieceFrag: string };
}): void {
  for (const p of opts.pieces) {
    if (p.mesh) continue;

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
        tMask: { value: opts.maskTex },
        uResolution: { value: new THREE.Vector2(2, 2) },
        uPieceBits: { value: p.maskBits | 0 },
        uThreshold: { value: opts.threshold }
      },
      vertexShader: opts.shaders.vert,
      fragmentShader: opts.shaders.pieceFrag
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 10;
    p.mesh = mesh;
    opts.scene.add(mesh);
  }
}

export function disposePiecesMeshes(scene: THREE.Scene, pieces: RuntimePiece[]): void {
  for (const p of pieces) {
    if (!p.mesh) continue;
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    const t = p.mesh.material.uniforms.tPiece.value as THREE.Texture;
    t.dispose();
    p.mesh = undefined;
  }
}

export function updatePiecesMeshes(opts: {
  pieces: RuntimePiece[];
  w: number;
  h: number;
  threshold: number;
}): void {
  for (let i = 0; i < opts.pieces.length; i++) {
    const rp = opts.pieces[i];
    if (!rp.mesh) continue;
    rp.mesh.renderOrder = 10 + i;
    const pad = rp.img.geom.padPx;
    const dx = rp.x - pad;
    const dy = rp.y - pad;
    const bw = rp.img.bitmap.width;
    const bh = rp.img.bitmap.height;
    rp.mesh.scale.set(bw, bh, 1);
    rp.mesh.position.set(dx + bw * 0.5, dy + bh * 0.5, 0);
    (rp.mesh.material.uniforms.uResolution.value as THREE.Vector2).set(opts.w, opts.h);
    (rp.mesh.material.uniforms.uThreshold.value as number) = opts.threshold;
  }
}

