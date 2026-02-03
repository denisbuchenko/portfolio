uniform sampler2D map;
uniform vec3 color;

uniform sampler2D tMask;
uniform vec2 uMaskResolution;
uniform float uMaskThreshold; // 0..1
uniform float uLayerBits;     // 1..7

varying vec2 vUv;
varying vec3 vNormal;

float bitsFromMask(vec3 m) {
  float br = step(uMaskThreshold, m.r);
  float bg = step(uMaskThreshold, m.g);
  float bb = step(uMaskThreshold, m.b);
  return br + 2.0 * bg + 4.0 * bb;
}

void main() {
  vec2 uvMask = gl_FragCoord.xy / uMaskResolution;
  vec3 m = texture2D(tMask, uvMask).rgb;
  float bits = bitsFromMask(m);
  if (abs(bits - uLayerBits) > 0.1) discard;

  vec4 texColor = texture2D(map, vUv);
  if (texColor.a < 0.01) {
    texColor = vec4(color, 1.0);
  }
  gl_FragColor = texColor * vec4(color, 1.0);
}

