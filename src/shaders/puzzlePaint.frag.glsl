precision highp float;

uniform sampler2D tMask;
uniform vec2 uResolution;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 uvMask = gl_FragCoord.xy / uResolution;
  vec3 m = texture(tMask, uvMask).rgb;
  float a = clamp(max(m.r, max(m.g, m.b)), 0.0, 1.0);
  outColor = vec4(m, a);
}


