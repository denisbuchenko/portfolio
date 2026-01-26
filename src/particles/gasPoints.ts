import * as THREE from "three";

import fragmentShader from "../shaders/gasPoints.frag.glsl?raw";
import vertexShader from "../shaders/gasPoints.vert.glsl?raw";

export type GasUniforms = {
  uTime: { value: number };
  uBounds: { value: THREE.Vector2 };
  uPixelsPerWorld: { value: number };
  uSpeedPxMin: { value: number };
  uSpeedPxMax: { value: number };
  uPointSize: { value: number };
  uAlphaMul: { value: number };
  uAttractorActive: { value: number };
  uAttractorPos: { value: THREE.Vector2 };
  uAttractorStartTime: { value: number };
  uAttractorRadius: { value: number };
  uAttractorInfluenceRadius: { value: number };
  uAttractorOmega: { value: number };
  uAttractorStrength: { value: number };
  uBezierActive: { value: number };
  uBezierP0: { value: THREE.Vector2 };
  uBezierP1: { value: THREE.Vector2 };
  uBezierP2: { value: THREE.Vector2 };
  uBezierP3: { value: THREE.Vector2 };
  uBezierJitterRadius: { value: number };
  uBezierTimeScale: { value: number };
  uBezierPhaseOffset: { value: number };
  uPathTex: { value: THREE.Texture | null };
  uPathCount: { value: number };
  uPathUseTexture: { value: number };
};

export type GasPoints = {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  uniforms: GasUniforms;
};

export type CreateGasPointsOpts = {
  texSize: number;
  viewBounds: THREE.Vector2;
  pointSize: number;
  pixelsPerWorld?: number;
  speedPxMin?: number;
  speedPxMax?: number;
  attractorRadius?: number;
  attractorInfluenceRadius?: number;
  attractorOmega?: number;
};

function _createGasGeometry(texSize: number): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const count = texSize * texSize;

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  let p = 0;
  let u = 0;
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      positions[p++] = 0;
      positions[p++] = 0;
      positions[p++] = 0;

      uvs[u++] = (x + 0.5) / texSize;
      uvs[u++] = (y + 0.5) / texSize;
    }
  }

  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geom;
}

function _createGasUniforms(opts: CreateGasPointsOpts): GasUniforms {
  return {
    uTime: { value: 0 },
    uBounds: { value: opts.viewBounds },
    uPixelsPerWorld: { value: opts.pixelsPerWorld ?? 100 },
    uSpeedPxMin: { value: opts.speedPxMin ?? 40 },
    uSpeedPxMax: { value: opts.speedPxMax ?? 160 },
    uPointSize: { value: opts.pointSize },
    uAlphaMul: { value: 1.0 },

    uAttractorActive: { value: 0 },
    uAttractorPos: { value: new THREE.Vector2(0, 0) },
    uAttractorStartTime: { value: 0 },
    uAttractorRadius: { value: opts.attractorRadius ?? 1.0 },
    uAttractorInfluenceRadius: { value: opts.attractorInfluenceRadius ?? 2.2 },
    uAttractorOmega: { value: opts.attractorOmega ?? 5.2 },
    uAttractorStrength: { value: 0 },

    uBezierActive: { value: 0 },
    uBezierP0: { value: new THREE.Vector2(-3, -2) },
    uBezierP1: { value: new THREE.Vector2(-1, 2) },
    uBezierP2: { value: new THREE.Vector2(1, -2) },
    uBezierP3: { value: new THREE.Vector2(3, 2) },
    uBezierJitterRadius: { value: 0.15 },
    uBezierTimeScale: { value: 0.12 },
    uBezierPhaseOffset: { value: 0.0 },

    uPathTex: { value: null },
    uPathCount: { value: 0 },
    uPathUseTexture: { value: 0 }
  };
}

function _createGasMaterial(uniforms: GasUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader,
    fragmentShader
  });
}

export function createGasPoints(opts: CreateGasPointsOpts): GasPoints {
  const geom = _createGasGeometry(opts.texSize);
  const uniforms = _createGasUniforms(opts);
  const mat = _createGasMaterial(uniforms);
  const points = new THREE.Points(geom, mat);
  return { points, uniforms };
}


