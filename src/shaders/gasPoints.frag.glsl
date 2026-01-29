uniform float uAlphaMul;
uniform float uTraceDanger;

in float vSpeed;
in float vAttrProx;
out vec4 outColor;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  float alpha = smoothstep(1.0, 0.55, d);
  float sp = clamp(vSpeed / 3.0, 0.0, 1.0);
  vec3 colA = vec3(0.43, 0.91, 1.0);
  vec3 colB = vec3(0.66, 0.55, 1.0);
  vec3 col = mix(colA, colB, sp);
  float danger = clamp(uTraceDanger, 0.0, 1.0) * clamp(vAttrProx, 0.0, 1.0);
  // Чем ближе к порогу (и чем ближе частица к аттрактору) — тем краснее.
  vec3 red = vec3(1.0, 0.18, 0.18);
  col = mix(col, red, danger);
  outColor = vec4(col, alpha * uAlphaMul);
}


