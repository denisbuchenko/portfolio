import * as THREE from "three";

export function computeViewBounds(camera: THREE.PerspectiveCamera): THREE.Vector2 {
  const dist = Math.abs(camera.position.z);
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist;
  const halfW = halfH * camera.aspect;
  return new THREE.Vector2(halfW, halfH);
}

export function computePixelsPerWorld(renderer: THREE.WebGLRenderer, viewBounds: THREE.Vector2): number {
  const buf = new THREE.Vector2();
  renderer.getDrawingBufferSize(buf);
  return buf.y / Math.max(1e-6, viewBounds.y * 2);
}


