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

  vec2 p = vUv * uNoiseScale + vec2(uTime * 0.08, -uTime * 0.06);
  float n = fbm(p) - 0.5;

  float boundary = 1.0 + uEdgeAmp * n;
  float fill = 1.0 - smoothstep(boundary - uEdgeSoftness, boundary, dn);
  float a = clamp(fill * uStrength, 0.0, 1.0);
  outColor = vec4(0.0, 0.0, 0.0, a);
}


