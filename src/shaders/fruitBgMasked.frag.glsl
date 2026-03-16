precision highp float;

uniform sampler2D tMask;
uniform vec2 uResolution;
uniform float uThreshold; // 0..1

uniform vec3 uClearColor;
uniform vec3 uBgColors[7]; // bits 1..7 -> index 0..6

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
  if (bits < 0.5) {
    outColor = vec4(0.0);
    return;
  }
  int idx = int(clamp(bits, 1.0, 7.0)) - 1;
  outColor = vec4(uBgColors[idx], 1.0);
}

