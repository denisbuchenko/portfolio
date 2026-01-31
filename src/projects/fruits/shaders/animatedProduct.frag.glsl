uniform sampler2D map;
uniform vec3 color;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vec4 texColor = texture2D(map, vUv);
  // Если текстура отсутствует, используем цвет по умолчанию
  if (texColor.a < 0.01) {
    texColor = vec4(color, 1.0);
  }
  gl_FragColor = texColor * vec4(color, 1.0);
}
