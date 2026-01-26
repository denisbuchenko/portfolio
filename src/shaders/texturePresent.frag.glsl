precision highp float;

uniform sampler2D tTex;

in vec2 vUv;
out vec4 outColor;

void main() {
  outColor = texture(tTex, vUv);
}


