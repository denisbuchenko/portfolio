precision highp float;

uniform sampler2D tMask;
uniform vec2 uResolution;
uniform float uThreshold; // 0..1
uniform float uBits;      // 1..7
uniform vec3 uBgColor;    // 0..1

in vec2 vUv;
out vec4 outColor;

float bitsFromMask(vec3 m) {
  float br = step(uThreshold, m.r);
  float bg = step(uThreshold, m.g);
  float bb = step(uThreshold, m.b);
  return br + 2.0 * bg + 4.0 * bb;
}

void main() {
  vec2 uvMask = gl_FragCoord.xy / uResolution;
  vec3 m = texture(tMask, uvMask).rgb;
  float bits = bitsFromMask(m);
  if (abs(bits - uBits) > 0.1) discard;

  float density = clamp(max(m.r, max(m.g, m.b)), 0.0, 1.0);
  // Чуть-чуть мягкий край (без тяжёлого blur) — чтобы приятнее выглядело.
  float a = smoothstep(uThreshold * 0.65, uThreshold * 1.15, density);

  // Лёгкая виньетка/градиент, чтобы фон не был плоским.
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 c = uv - 0.5;
  float v = smoothstep(0.9, 0.15, dot(c, c));
  vec3 col = uBgColor * (0.82 + 0.18 * v);

  outColor = vec4(col, a);
}

