precision highp float;

uniform sampler2D tTex;
uniform float uTime;
uniform float uNoiseScale;
uniform float uEdgeAmp;
uniform float uEdgeSoftness;
uniform float uGlowIntensity;
uniform float uPulseSpeed;
uniform float uWarpScale;
uniform float uWarpSpeed;
uniform float uWarpAmp;
uniform float uContourThreshold;
uniform float uContourWidth;
uniform float uContourNoiseAmp;

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
  float density0 = texture(tTex, vUv).a;
  if (density0 <= 0.0005) {
    outColor = vec4(0.0);
    return;
  }

  float t = uTime;

  // Displacement mask (animated): makes the contour "flow" smoothly.
  vec3 qWarp = vec3(vUv * uWarpScale, t * uWarpSpeed);
  vec2 flow = vec2(fbm3(qWarp + vec3(2.1, 1.3, 0.0)), fbm3(qWarp + vec3(5.2, 3.7, 0.0))) - 0.5;
  float edgeBand0 = smoothstep(0.02, 0.25, density0) * (1.0 - smoothstep(0.25, 0.65, density0));

  // Warp sampling near the contour to make the blob feel "alive" without drifting as a whole.
  vec2 uvWarp = clamp(vUv + edgeBand0 * uWarpAmp * flow, vec2(0.0), vec2(1.0));
  float density = texture(tTex, uvWarp).a;

  // Shape noise for jagged/animated contour. Keep it tied to warped UV.
  vec3 q = vec3(uvWarp * uNoiseScale, t * 0.18);
  q.xy += 0.70 * flow;
  float n = fbm3(q * 1.15) - 0.5;

  float edgeBand = smoothstep(0.02, 0.25, density) * (1.0 - smoothstep(0.25, 0.65, density));
  float warped = clamp(density + edgeBand * n * uEdgeAmp, 0.0, 1.0);

  // Apply an extra noisy threshold on the resulting mask to get a sharper, more "ink-like" edge.
  float thr = uContourThreshold + edgeBand * (n * uContourNoiseAmp);
  float a = smoothstep(thr - uContourWidth, thr + uContourWidth, warped);

  float pulseNoise = fbm3(vec3(uvWarp * (uNoiseScale * 0.32), uTime * 0.11));
  float pulse = 0.72 + 0.28 * sin(uTime * uPulseSpeed + 6.28318 * pulseNoise);
  float glow = (1.0 - smoothstep(0.18, 0.85, warped));
  glow = pow(max(glow, 0.0), 2.2) * uGlowIntensity * pulse;

  float hueT = clamp(0.35 + 0.65 * (0.5 + n) + 0.10 * sin(uTime * 0.6 + 6.28318 * pulseNoise), 0.0, 1.0);
  vec3 base = paintPalette(hueT);
  float light = clamp(0.55 * a + glow, 0.0, 2.0);
  vec3 col = base * light;
  outColor = vec4(col, a);
}


