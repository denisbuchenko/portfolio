import * as THREE from "three";

export function createWebGLRenderer2D(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  renderer.autoClear = true;
  renderer.setPixelRatio(1); // canvas уже в px, мы сами ресайзим.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

export function createYDownOrthoCamera(w: number, h: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(0, w, 0, h, -10, 10);
  resizeYDownOrthoCamera(cam, w, h);
  return cam;
}

export function resizeYDownOrthoCamera(camera: THREE.OrthographicCamera, w: number, h: number): void {
  // y вниз: top=0, bottom=h (да, это переворачивает winding; мы рисуем DoubleSide)
  camera.left = 0;
  camera.right = w;
  camera.top = 0;
  camera.bottom = h;
  camera.near = -10;
  camera.far = 10;
  camera.updateProjectionMatrix();
}

export function createCanvasMaskTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

