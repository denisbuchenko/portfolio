import * as THREE from "three";

export type GasPoints = {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  uniforms: {
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
  };
};

export function createGasPoints(opts: {
  texSize: number;
  viewBounds: THREE.Vector2;
  pointSize: number;
  pixelsPerWorld?: number;
  speedPxMin?: number;
  speedPxMax?: number;
  attractorRadius?: number;
  attractorInfluenceRadius?: number;
  attractorOmega?: number;
}): GasPoints {
  const geom = new THREE.BufferGeometry();
  const count = opts.texSize * opts.texSize;

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  let p = 0;
  let u = 0;
  for (let y = 0; y < opts.texSize; y++) {
    for (let x = 0; x < opts.texSize; x++) {
      positions[p++] = 0;
      positions[p++] = 0;
      positions[p++] = 0;

      uvs[u++] = (x + 0.5) / opts.texSize;
      uvs[u++] = (y + 0.5) / opts.texSize;
    }
  }

  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  const uniforms = {
    uTime: { value: 0 },
    uBounds: { value: opts.viewBounds },
    uPixelsPerWorld: { value: opts.pixelsPerWorld ?? 100 },
    uSpeedPxMin: { value: opts.speedPxMin ?? 40 },
    uSpeedPxMax: { value: opts.speedPxMax ?? 160 },
    uPointSize: { value: opts.pointSize },
    uAlphaMul: { value: 1.0 },

    // Attractor (mouse / touch orbit)
    uAttractorActive: { value: 0 },
    uAttractorPos: { value: new THREE.Vector2(0, 0) },
    uAttractorStartTime: { value: 0 },
    uAttractorRadius: { value: opts.attractorRadius ?? 1.0 },
    uAttractorInfluenceRadius: { value: opts.attractorInfluenceRadius ?? 2.2 },
    uAttractorOmega: { value: opts.attractorOmega ?? 5.2 },
    uAttractorStrength: { value: 0 }
  };

  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uBounds;
      uniform float uPixelsPerWorld;
      uniform float uSpeedPxMin;
      uniform float uSpeedPxMax;
      uniform float uPointSize;
      uniform float uAttractorActive;
      uniform vec2 uAttractorPos;
      uniform float uAttractorStartTime;
      uniform float uAttractorRadius;
      uniform float uAttractorInfluenceRadius;
      uniform float uAttractorOmega;
      uniform float uAttractorStrength;
      out float vSpeed;

      const float TAU = 6.28318530718;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec2 bounceRepeat2(vec2 p, vec2 b) {
        // True "bounce" inside [-b, b] without teleporting.
        // Period is 4b: -b -> +b -> -b (continuous at the edges).
        vec2 bb = max(b, vec2(1e-6));
        vec2 period = 4.0 * bb;
        vec2 t = fract((p + bb) / period) * period; // [0 .. 4b)
        vec2 first = t - bb;          // [-b .. +b] when t in [0..2b)
        vec2 second = 3.0 * bb - t;   // [+b .. -b] when t in [2b..4b)
        vec2 useFirst = 1.0 - step(2.0 * bb, t);
        return mix(second, first, useFirst);
      }

      vec2 driftField(vec2 base, float t, float r0, float r1) {
        return 0.65 * vec2(
          sin((base.y + t * 0.7) * 0.9 + 6.0 * r1),
          cos((base.x + t * 0.6) * 0.8 + 6.0 * r0)
        );
      }

      void main() {
        // keep time bounded to avoid floating point precision issues over long sessions
        float tTime = mod(uTime, 1000.0);

        // Procedural "free gas": deterministic per-particle seed from uv
        float r0 = hash12(uv * 97.1);
        float r1 = hash12(uv * 151.7 + 0.31);
        float r2 = hash12(uv * 211.3 + 0.73);

        vec2 init = (vec2(r0, r1) * 2.0 - 1.0) * (uBounds * 0.98);
        float speedPx = mix(uSpeedPxMin, uSpeedPxMax, r2);
        float speed = speedPx / max(uPixelsPerWorld, 1e-3);
        float ang = TAU * hash12(uv * 331.9 + 0.17);
        vec2 vel = speed * vec2(cos(ang), sin(ang));

        // Add small time-varying drift field to feel "gas-like"
        vec2 drift = driftField(init, tTime, r0, r1);

        vec2 basePos = init + vel * tTime + drift;
        basePos = bounceRepeat2(basePos, uBounds);

        // Mouse/touch attractor: smoothly re-route nearby particles onto an orbit ring
        // around uAttractorPos. Since we don't keep per-particle state, we compute
        // "start angle" from the particle position at the moment the attractor was engaged.
        vec2 pos = basePos;
        float attractorOn = uAttractorActive * uAttractorStrength;
        if (attractorOn > 0.0001) {
          vec2 center = uAttractorPos;
          float dist = length(basePos - center);

          float outer = max(uAttractorInfluenceRadius, 1e-4);
          float inner = outer * 0.35;
          float wInfluence = 1.0 - smoothstep(inner, outer, dist);

          // reconstruct particle position at attractor start moment (bounded for stability)
          float tStart = mod(uAttractorStartTime, 1000.0);
          vec2 startPos = init + vel * tStart + driftField(init, tStart, r0, r1);
          startPos = bounceRepeat2(startPos, uBounds);

          vec2 v0 = startPos - center;
          float a0 = atan(v0.y, v0.x);
          float dt = max(0.0, uTime - uAttractorStartTime);
          float a = a0 + uAttractorOmega * dt;
          vec2 orbitPos = center + uAttractorRadius * vec2(cos(a), sin(a));

          float w = attractorOn * wInfluence;
          pos = mix(basePos, orbitPos, w);
        }

        vSpeed = speed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(pos, 0.0), 1.0);
        gl_PointSize = uPointSize;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAlphaMul;
      in float vSpeed;
      out vec4 outColor;

      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        float alpha = smoothstep(1.0, 0.55, d);
        float sp = clamp(vSpeed / 3.0, 0.0, 1.0);
        vec3 colA = vec3(0.43, 0.91, 1.0);
        vec3 colB = vec3(0.66, 0.55, 1.0);
        vec3 col = mix(colA, colB, sp);
        outColor = vec4(col, alpha * uAlphaMul);
      }
    `
  });

  const points = new THREE.Points(geom, mat);
  return { points, uniforms };
}


