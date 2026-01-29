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

uniform float uTraceDanger;
uniform float uTraceTargetActive;
uniform vec2 uTraceTargetPos;
uniform float uTraceFailRadiusWorld;
uniform float uTraceWarnStartFrac;

uniform float uBezierActive;
uniform vec2 uBezierP0;
uniform vec2 uBezierP1;
uniform vec2 uBezierP2;
uniform vec2 uBezierP3;
uniform float uBezierJitterRadius;
uniform float uBezierTimeScale;
uniform float uBezierPhaseOffset;

uniform sampler2D uPathTex;
uniform float uPathCount;
uniform float uPathUseTexture;

out float vSpeed;
out float vAttrProx;
out float vTargetRisk;

// ------------------------------- constants -------------------------------
const float EPS = 1e-6;
const float TAU = 6.28318530718;
const float TIME_WRAP = 1000.0;

// ------------------------------- randomness ------------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 seed3(vec2 u) {
  float a = hash12(u * 97.1);
  float b = hash12(u * 151.7 + 0.31);
  float c = hash12(u * 211.3 + 0.73);
  return vec3(a, b, c);
}

// ------------------------------- helpers ---------------------------------
vec2 bounceRepeat2(vec2 p, vec2 b) {
  vec2 bb = max(b, vec2(EPS));
  vec2 period = 4.0 * bb;
  vec2 t = fract((p + bb) / period) * period; // [0..4b)
  vec2 a = t - bb;        // [-b..+b] for [0..2b)
  vec2 b2 = 3.0 * bb - t; // [+b..-b] for [2b..4b)
  vec2 useA = 1.0 - step(2.0 * bb, t);
  return mix(b2, a, useA);
}

vec2 driftField(vec2 base, float t, vec2 r01) {
  return 0.65 * vec2(
    sin((base.y + t * 0.7) * 0.9 + 6.0 * r01.y),
    cos((base.x + t * 0.6) * 0.8 + 6.0 * r01.x)
  );
}

// ------------------------------- curve/path ------------------------------
vec2 bezier3(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
  float u = 1.0 - t;
  float tt = t * t;
  float uu = u * u;
  float uuu = uu * u;
  float ttt = tt * t;
  return uuu * p0 + (3.0 * uu * t) * p1 + (3.0 * u * tt) * p2 + ttt * p3;
}

vec2 samplePathTexture(float t) {
  float n = max(uPathCount, 2.0);
  float x = clamp(t, 0.0, 1.0) * (n - 1.0);
  float i0 = floor(x);
  float i1 = min(i0 + 1.0, n - 1.0);
  float f = fract(x);
  vec2 uv0 = vec2((i0 + 0.5) / n, 0.5);
  vec2 uv1 = vec2((i1 + 0.5) / n, 0.5);
  return mix(texture(uPathTex, uv0).xy, texture(uPathTex, uv1).xy, f);
}

vec2 splinePosition(float tCurve) {
  vec2 pBez = bezier3(uBezierP0, uBezierP1, uBezierP2, uBezierP3, tCurve);
  return (uPathUseTexture > 0.5) ? samplePathTexture(tCurve) : pBez;
}

// ------------------------------- attractor -------------------------------
vec2 applyAttractor(vec2 basePos, vec2 init, vec2 vel, vec2 r01, float bezierW) {
  float strength = uAttractorActive * uAttractorStrength * (1.0 - bezierW);
  if (strength <= 1e-4) return basePos;

  vec2 center = uAttractorPos;
  float dist = length(basePos - center);

  float outer = max(uAttractorInfluenceRadius, 1e-4);
  float inner = outer * 0.35;
  float influence = 1.0 - smoothstep(inner, outer, dist);
  if (influence <= 1e-4) return basePos;

  float tStart = mod(uAttractorStartTime, TIME_WRAP);
  vec2 startPos = init + vel * tStart + driftField(init, tStart, r01);
  startPos = bounceRepeat2(startPos, uBounds);

  vec2 v0 = startPos - center;
  float a0 = atan(v0.y, v0.x);
  float dt = max(0.0, uTime - uAttractorStartTime);
  float danger = clamp(uTraceDanger, 0.0, 1.0);
  // Чем ближе к порогу — тем сильнее ускорение вращения (ускорение нелинейное).
  float omega = uAttractorOmega * (1.0 + 2.6 * danger * danger);
  float a = a0 + omega * dt;
  vec2 orbitPos = center + uAttractorRadius * vec2(cos(a), sin(a));

  return mix(basePos, orbitPos, strength * influence);
}

// ------------------------------- main ------------------------------------
void main() {
  float tTime = mod(uTime, TIME_WRAP);

  vec3 s = seed3(uv);
  vec2 r01 = s.xy;
  float r2 = s.z;

  vec2 init = (r01 * 2.0 - 1.0) * (uBounds * 0.98);
  float speedPx = mix(uSpeedPxMin, uSpeedPxMax, r2);
  float speed = speedPx / max(uPixelsPerWorld, 1e-3);
  float ang = TAU * hash12(uv * 331.9 + 0.17);
  vec2 vel = speed * vec2(cos(ang), sin(ang));

  vec2 basePos = init + vel * tTime + driftField(init, tTime, r01);
  basePos = bounceRepeat2(basePos, uBounds);

  float bezierW = clamp(uBezierActive, 0.0, 1.0);
  vec2 pos = applyAttractor(basePos, init, vel, r01, bezierW);

  // Для фрагментного шейдера: насколько частица близко к центру аттрактора (0..1).
  // Краснеем только рядом с аттрактором, а не по всему экрану.
  float distA = length(pos - uAttractorPos);
  float outerA = max(uAttractorInfluenceRadius, 1e-4);
  float innerA = outerA * 0.35;
  float influenceA = 1.0 - smoothstep(innerA, outerA, distA);
  vAttrProx = influenceA * uAttractorActive;

  // Насколько частица далека от текущей "следующей цели" (0..1).
  // Это даёт направленную подсказку: где "краснее" — там дальше от цели.
  float failR = max(uTraceFailRadiusWorld, 1e-6);
  float warnStart = clamp(uTraceWarnStartFrac, 0.0, 0.99) * failR;
  float dT = length(pos - uTraceTargetPos);
  vTargetRisk = smoothstep(warnStart, failR, dT) * uTraceTargetActive;

  float phase = hash12(uv * 541.7 + 0.11);
  float tCurve = fract(uBezierPhaseOffset + phase + tTime * max(uBezierTimeScale, 0.0));
  vec2 target = splinePosition(tCurve);

  float j0 = hash12(uv * 913.3 + 0.27);
  float j1 = hash12(uv * 1229.7 + 0.93);
  float jAng = TAU * j0;
  float jRad = sqrt(j1) * max(uBezierJitterRadius, 0.0);
  vec2 jitter = jRad * vec2(cos(jAng), sin(jAng));

  pos = mix(pos, target + jitter, bezierW);

  vSpeed = speed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(pos, 0.0), 1.0);
  gl_PointSize = uPointSize;
}


