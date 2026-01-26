precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uCenter;
uniform float uRadius;
uniform float uStrength;
uniform float uEdgeSoftness;

void main() {
  vec2 d = (vUv - uCenter);
  float dist = length(d);
  float dn = dist / max(uRadius, 1e-6);

  float soft = clamp(uEdgeSoftness, 1e-4, 0.85);
  float fill = 1.0 - smoothstep(1.0 - soft, 1.0, dn);
  float a = clamp(fill * uStrength, 0.0, 1.0);
  outColor = vec4(0.0, 0.0, 0.0, a);
}


