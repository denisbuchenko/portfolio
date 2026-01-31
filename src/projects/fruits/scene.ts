/**
 * Настройка сцены и камеры для системы фруктов.
 */

import * as THREE from "three";

/**
 * Создает сцену с заданным цветом фона.
 *
 * @param backgroundColor - Цвет фона (hex строка)
 * @returns Созданная сцена
 */
export function createScene(backgroundColor: string): THREE.Scene {
  const scene = new THREE.Scene();
  const color = new THREE.Color(backgroundColor);
  scene.background = color;
  return scene;
}

/**
 * Настройки камеры.
 */
export type CameraSetup = {
  /** Камера */
  camera: THREE.PerspectiveCamera;
  /** Ширина экрана */
  width: number;
  /** Высота экрана */
  height: number;
};

/**
 * Создает и настраивает камеру для корректного отображения на весь экран.
 *
 * @param width - Ширина экрана
 * @param height - Высота экрана
 * @param fov - Поле зрения (градусы)
 * @returns Настроенная камера и размеры
 */
export function setupCamera(width: number, height: number, fov: number): CameraSetup {
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);

  // Позиционируем камеру на фиксированном расстоянии от центра сцены
  // Объекты размещены в диапазоне примерно от -10 до +10, поэтому камера на расстоянии 20-30
  camera.position.set(0, 0, 25);
  camera.lookAt(0, 0, 0);

  return { camera, width, height };
}

/**
 * Обновляет размеры камеры при изменении размеров экрана.
 *
 * @param camera - Камера для обновления
 * @param width - Новая ширина
 * @param height - Новая высота
 */
export function updateCameraSize(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
