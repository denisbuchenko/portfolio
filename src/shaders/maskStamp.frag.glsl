precision highp float;

uniform vec3 uChannel;       // (1,0,0) / (0,1,0) / (0,0,1)
uniform float uStrength;     // 0..1
uniform float uEdgeSoftness; // 0..0.85

in vec2 vLocal;
out vec4 outColor;

void main() {
  float dist = length(vLocal); // 0..~1.414
  float soft = clamp(uEdgeSoftness, 1e-4, 0.85);
  float fill = 1.0 - smoothstep(1.0 - soft, 1.0, dist);
  float a = clamp(fill * uStrength, 0.0, 1.0);
  if (a <= 0.0001) discard;

  // Additive blending: final added color = uChannel * a (via SrcAlpha, One).
  outColor = vec4(uChannel, a);
}

