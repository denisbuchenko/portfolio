precision highp float;

uniform sampler2D tPrev;
uniform float uDecay;
uniform vec2 uTexel;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec4 c = texture(tPrev, vUv) * 0.50;
  c += texture(tPrev, vUv + vec2(uTexel.x, 0.0)) * 0.12;
  c += texture(tPrev, vUv - vec2(uTexel.x, 0.0)) * 0.12;
  c += texture(tPrev, vUv + vec2(0.0, uTexel.y)) * 0.13;
  c += texture(tPrev, vUv - vec2(0.0, uTexel.y)) * 0.13;
  outColor = c * uDecay;
}


