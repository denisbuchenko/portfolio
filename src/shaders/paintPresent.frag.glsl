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


