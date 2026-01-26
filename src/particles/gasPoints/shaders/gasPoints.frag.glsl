uniform float uAlphaMul;

in float vSpeed;
out vec4 outColor;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  float alpha = smoothstep(1.0, 0.55, d);
  float sp = clamp(vSpeed / 3.0, 0.0, 1.0);
  vec3 colA = vec3(0.43, 0.91, 1.0);
  vec3 colB = vec3(0.66, 0.55, 1.0);
  vec3 col = mix(colA, colB, sp);
  outColor = vec4(col, alpha * uAlphaMul);
}


