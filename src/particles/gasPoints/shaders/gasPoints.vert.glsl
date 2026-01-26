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

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 bounceRepeat2(vec2 p, vec2 b) {
  vec2 bb = max(b, vec2(1e-6));
  vec2 period = 4.0 * bb;
  vec2 t = fract((p + bb) / period) * period;
  vec2 first = t - bb;
  vec2 second = 3.0 * bb - t;
  vec2 useFirst = 1.0 - step(2.0 * bb, t);
  return mix(second, first, useFirst);
}

vec2 driftField(vec2 base, float t, float r0, float r1) {
  return 0.65 * vec2(
    sin((base.y + t * 0.7) * 0.9 + 6.0 * r1),
    cos((base.x + t * 0.6) * 0.8 + 6.0 * r0)
  );
}

vec2 bezier3(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
  float u = 1.0 - t;
  float tt = t * t;
  float uu = u * u;
  float uuu = uu * u;
  float ttt = tt * t;
  return uuu * p0 + (3.0 * uu * t) * p1 + (3.0 * u * tt) * p2 + ttt * p3;
}

vec2 samplePathTex(float t) {
  float n = max(uPathCount, 2.0);
  float x = clamp(t, 0.0, 1.0) * (n - 1.0);
  float i0 = floor(x);
  float i1 = min(i0 + 1.0, n - 1.0);
  float f = fract(x);

  vec2 uv0 = vec2((i0 + 0.5) / n, 0.5);
  vec2 uv1 = vec2((i1 + 0.5) / n, 0.5);
  vec2 p0 = texture(uPathTex, uv0).xy;
  vec2 p1 = texture(uPathTex, uv1).xy;
  return mix(p0, p1, f);
}

void main() {
  float tTime = mod(uTime, 1000.0);

  float r0 = hash12(uv * 97.1);
  float r1 = hash12(uv * 151.7 + 0.31);
  float r2 = hash12(uv * 211.3 + 0.73);

  vec2 init = (vec2(r0, r1) * 2.0 - 1.0) * (uBounds * 0.98);
  float speedPx = mix(uSpeedPxMin, uSpeedPxMax, r2);
  float speed = speedPx / max(uPixelsPerWorld, 1e-3);
  float ang = TAU * hash12(uv * 331.9 + 0.17);
  vec2 vel = speed * vec2(cos(ang), sin(ang));

  vec2 basePos = init + vel * tTime + driftField(init, tTime, r0, r1);
  basePos = bounceRepeat2(basePos, uBounds);

  vec2 pos = basePos;
  float bezierW = clamp(uBezierActive, 0.0, 1.0);
  float attractorOn = uAttractorActive * uAttractorStrength * (1.0 - bezierW);
  if (attractorOn > 0.0001) {
    vec2 center = uAttractorPos;
    float dist = length(basePos - center);

    float outer = max(uAttractorInfluenceRadius, 1e-4);
    float inner = outer * 0.35;
    float wInfluence = 1.0 - smoothstep(inner, outer, dist);

    float tStart = mod(uAttractorStartTime, 1000.0);
    vec2 startPos = init + vel * tStart + driftField(init, tStart, r0, r1);
    startPos = bounceRepeat2(startPos, uBounds);

    vec2 v0 = startPos - center;
    float a0 = atan(v0.y, v0.x);
    float dt = max(0.0, uTime - uAttractorStartTime);
    float a = a0 + uAttractorOmega * dt;
    vec2 orbitPos = center + uAttractorRadius * vec2(cos(a), sin(a));

    pos = mix(basePos, orbitPos, attractorOn * wInfluence);
  }

  float phase = hash12(uv * 541.7 + 0.11);
  float tCurve = fract(uBezierPhaseOffset + phase + tTime * max(uBezierTimeScale, 0.0));
  vec2 bezPos = bezier3(uBezierP0, uBezierP1, uBezierP2, uBezierP3, tCurve);
  vec2 pathPos = (uPathUseTexture > 0.5) ? samplePathTex(tCurve) : bezPos;

  float j0 = hash12(uv * 913.3 + 0.27);
  float j1 = hash12(uv * 1229.7 + 0.93);
  float jAng = TAU * j0;
  float jRad = sqrt(j1) * max(uBezierJitterRadius, 0.0);
  vec2 jitter = jRad * vec2(cos(jAng), sin(jAng));

  pos = mix(pos, pathPos + jitter, bezierW);

  vSpeed = speed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(pos, 0.0), 1.0);
  gl_PointSize = uPointSize;
}


