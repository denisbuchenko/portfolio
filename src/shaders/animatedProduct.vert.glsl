// Three.js автоматически добавляет стандартные атрибуты и uniforms:
// - attribute vec3 position
// - attribute vec3 normal
// - attribute vec2 uv
// - attribute mat4 instanceMatrix (для instancing)
// - uniform mat4 modelViewMatrix
// - uniform mat4 projectionMatrix
// - uniform mat3 normalMatrix

// Кастомные uniforms для анимации
uniform float uTime;
uniform vec2 uBounds; // Границы экрана для wrap-around

// Instanced атрибуты для уникальных параметров каждого инстанса
attribute float aRotationSpeed; // Скорость вращения для этого инстанса
attribute vec3 aRotationAxis; // Ось вращения для этого инстанса
attribute float aPhase; // Фаза анимации для этого инстанса
attribute vec2 aMovementDirection; // Уникальное направление движения для этого инстанса
attribute float aMovementSpeed; // Уникальная скорость движения для этого инстанса

varying vec2 vUv;
varying vec3 vNormal;

// Функция для вращения вокруг произвольной оси
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

// Функция для wrap-around (когда объект выходит за пределы, появляется с другой стороны)
vec2 wrapPosition(vec2 pos, vec2 bounds) {
  vec2 halfBounds = bounds * 0.5;
  vec2 wrapped = mod(pos + halfBounds, bounds) - halfBounds;
  return wrapped;
}

void main() {
  vUv = uv;
  
  // Вычисляем позицию с учетом анимации
  vec3 pos = position;
  
  // Вращение вокруг произвольной оси с уникальной скоростью для каждого инстанса
  float rotationAngle = uTime * aRotationSpeed + aPhase;
  mat3 rotationMatrix = rotateAroundAxis(normalize(aRotationAxis), rotationAngle);
  pos = rotationMatrix * pos;
  
  // Извлекаем позицию из instanceMatrix (translation часть - последний столбец)
  vec3 instancePos = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
  
  // Движение с уникальным направлением и скоростью для каждого инстанса
  vec2 dir = normalize(aMovementDirection);
  vec2 movement = dir * aMovementSpeed * (uTime + aPhase);
  vec2 newPos = instancePos.xy + movement;
  
  // Wrap-around: применяем к позиции всего меша, а не к отдельным вершинам
  vec2 wrappedPos = wrapPosition(newPos, uBounds);
  
  // Извлекаем rotation и scale из instanceMatrix (первые 3x3)
  mat3 instanceRotScale = mat3(
    instanceMatrix[0].xyz,
    instanceMatrix[1].xyz,
    instanceMatrix[2].xyz
  );
  
  // Применяем rotation и scale к локальной позиции
  vec3 transformedPos = instanceRotScale * pos;
  
  // Добавляем обернутую позицию
  vec4 worldPos = vec4(transformedPos.x + wrappedPos.x, 
                       transformedPos.y + wrappedPos.y, 
                       transformedPos.z + instancePos.z, 
                       1.0);
  
  // Обновляем нормаль с учетом вращения
  vNormal = normalize(normalMatrix * (rotationMatrix * normal));
  
  gl_Position = projectionMatrix * modelViewMatrix * worldPos;
}
