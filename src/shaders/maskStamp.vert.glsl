precision highp float;

// RawShaderMaterial + InstancedMesh:
in vec3 position;
in vec2 uv;
in mat4 instanceMatrix;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec2 vLocal;

void main() {
  // PlaneGeometry(2,2) gives local xy in [-1..1], good for radial falloff.
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}

