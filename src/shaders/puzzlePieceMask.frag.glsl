precision highp float;

uniform sampler2D tPiece;
uniform sampler2D tMask;
uniform vec2 uResolution;
uniform int uPieceBits; // 0..7
uniform float uThreshold; // e.g. 0.06

in vec2 vUv;
out vec4 outColor;

int bitsFromMask(vec3 m) {
  int b = 0;
  if (m.r > uThreshold) b |= 1;
  if (m.g > uThreshold) b |= 2;
  if (m.b > uThreshold) b |= 4;
  return b;
}

void main() {
  vec4 col = texture(tPiece, vUv);
  if (col.a < 0.002) discard;

  vec2 uvMask = gl_FragCoord.xy / uResolution;
  vec3 m = texture(tMask, uvMask).rgb;
  int bits = bitsFromMask(m);
  if (bits != uPieceBits) discard;

  outColor = col;
}


