// Copy of animatedProduct.vert.glsl, kept separate to avoid regressions in legacy renderer.
// Three.js автоматически добавляет стандартные атрибуты и uniforms:
// - attribute vec3 position
// - attribute vec3 normal
// - attribute vec2 uv
// - attribute mat4 instanceMatrix (для instancing)
// - uniform mat4 modelViewMatrix
// - uniform mat4 projectionMatrix
// - uniform mat3 normalMatrix

uniform float uTime;
uniform vec2 uBounds;
uniform vec2 uMotionDir;
uniform float uMotionSpeed;

attribute float aRotationSpeed;
attribute vec3 aRotationAxis;
attribute float aPhase;
attribute float aSpeedMul;
attribute vec3 aInitialPosition;

varying vec2 vUv;
varying vec3 vNormal;

mat3 rotateAroundAxis(vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  float t = 1.0 - c;
  float x = axis.x;
  float y = axis.y;
  float z = axis.z;
  return mat3(
    t * x * x + c,      t * x * y - s * z,  t * x * z + s * y,
    t * x * y + s * z,  t * y * y + c,      t * y * z - s * x,
    t * x * z - s * y,  t * y * z + s * x,  t * z * z + c
  );
}

vec2 wrapPosition(vec2 pos, vec2 bounds) {
  vec2 halfBounds = bounds * 0.5;
  vec2 wrapped = mod(pos + halfBounds, bounds) - halfBounds;
  return wrapped;
}

void main() {
  vUv = uv;

  vec3 pos = position;
  float rotationAngle = uTime * aRotationSpeed + aPhase;
  mat3 rotationMatrix = rotateAroundAxis(normalize(aRotationAxis), rotationAngle);
  pos = rotationMatrix * pos;

  vec3 instancePos = aInitialPosition;
  vec2 dir = normalize(uMotionDir);
  float speed = uMotionSpeed * aSpeedMul;
  vec2 movement = dir * speed * (uTime + aPhase);
  vec2 newPos = instancePos.xy + movement;
  vec2 wrappedPos = wrapPosition(newPos, uBounds);

  mat3 instanceRotScale = mat3(
    instanceMatrix[0].xyz,
    instanceMatrix[1].xyz,
    instanceMatrix[2].xyz
  );

  vec3 transformedPos = instanceRotScale * pos;
  vec4 worldPos = vec4(
    transformedPos.x + wrappedPos.x,
    transformedPos.y + wrappedPos.y,
    transformedPos.z + instancePos.z,
    1.0
  );

  vNormal = normalize(normalMatrix * (rotationMatrix * normal));
  gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}

