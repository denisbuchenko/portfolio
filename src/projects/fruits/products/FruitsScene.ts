/**
 * Класс для управления сценой, камерой и рендерингом.
 */

import * as THREE from "three";
import { createScene, setupCamera, updateCameraSize } from "../scene";

/**
 * Класс для управления сценой Three.js.
 */
export class FruitsScene {
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _bounds: { width: number; height: number } = { width: 20, height: 20 };

  /**
   * Инициализирует сцену и камеру.
   */
  initialize(backgroundColor: string, width: number, height: number, fov: number): void {
    // Вычисляем границы экрана в единицах 3D пространства
    const fovRad = (fov * Math.PI) / 180;
    const distance = 25; // Расстояние камеры
    const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (width / height);
    
    // Увеличиваем границы в 1.5 раза для wrap-around
    this._bounds = { 
      width: visibleWidth * 1.5, 
      height: visibleHeight * 1.5 
    };

    // Создаем сцену
    this._scene = createScene(backgroundColor);

    // Настраиваем камеру
    const cameraSetup = setupCamera(width, height, fov);
    this._camera = cameraSetup.camera;
  }

  /**
   * Возвращает сцену.
   */
  get scene(): THREE.Scene {
    if (!this._scene) {
      throw new Error("Scene not initialized. Call initialize() first.");
    }
    return this._scene;
  }

  /**
   * Возвращает камеру.
   */
  get camera(): THREE.PerspectiveCamera {
    if (!this._camera) {
      throw new Error("Camera not initialized. Call initialize() first.");
    }
    return this._camera;
  }

  /**
   * Возвращает границы видимой области.
   */
  get bounds(): { width: number; height: number } {
    return this._bounds;
  }

  /**
   * Обновляет размеры камеры при изменении размеров экрана.
   */
  resize(width: number, height: number): void {
    if (!this._camera) return;
    updateCameraSize(this._camera, width, height);
  }

  /**
   * Рендерит сцену.
   */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this._scene || !this._camera) return;
    renderer.render(this._scene, this._camera);
  }
}
