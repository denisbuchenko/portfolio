precision highp float;

uniform sampler2D tPiece;
uniform sampler2D tMask;
uniform vec2 uResolution;
uniform int uPieceMaskSet; // bitset by mask bits (0..7) => (1<<bits)
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
  int maskBit = 1 << bits;
  if ((uPieceMaskSet & maskBit) == 0) discard;

  outColor = col;
}


