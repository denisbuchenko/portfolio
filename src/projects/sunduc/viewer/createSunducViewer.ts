import * as THREE from "three";
import { enableShadowsAndSrgb } from "../../city/three/loadGltf";
import { SUNDUC_CONFIG } from "../config";

export type SunducViewer = {
  readonly rotationRoot: THREE.Group;
  resize(width: number, height: number): void;
  setModel(model: THREE.Object3D): void;
  render(): void;
  dispose(): void;
};

type CreateSunducViewerOptions = {
  canvas: HTMLCanvasElement;
};

export function createSunducViewer(options: CreateSunducViewerOptions): SunducViewer {
  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    SUNDUC_CONFIG.camera.fovDeg,
    1,
    SUNDUC_CONFIG.camera.near,
    SUNDUC_CONFIG.camera.far
  );
  camera.position.set(
    SUNDUC_CONFIG.camera.position.x,
    SUNDUC_CONFIG.camera.position.y,
    SUNDUC_CONFIG.camera.position.z
  );
  camera.lookAt(
    SUNDUC_CONFIG.camera.lookAt.x,
    SUNDUC_CONFIG.camera.lookAt.y,
    SUNDUC_CONFIG.camera.lookAt.z
  );

  const rotationRoot = new THREE.Group();
  const modelGroup = new THREE.Group();
  modelGroup.position.set(
    SUNDUC_CONFIG.model.offset.x,
    SUNDUC_CONFIG.model.offset.y,
    SUNDUC_CONFIG.model.offset.z
  );
  rotationRoot.add(modelGroup);
  scene.add(rotationRoot);

  _setupLights(scene);

  let modelRoot: THREE.Object3D | null = null;

  return {
    rotationRoot,
    resize(width: number, height: number): void {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
    },
    setModel(model: THREE.Object3D): void {
      if (modelRoot) {
        modelGroup.remove(modelRoot);
      }

      modelRoot = model;
      enableShadowsAndSrgb(model);
      _fitModel(model);
      modelGroup.add(model);
    },
    render(): void {
      renderer.render(scene, camera);
    },
    dispose(): void {
      renderer.dispose();
    }
  };

  function _fitModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fitScale = SUNDUC_CONFIG.camera.fitHeight / Math.max(size.y, 0.001);

    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;
    model.scale.setScalar(fitScale * SUNDUC_CONFIG.model.scale);
  }
}

function _setupLights(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, SUNDUC_CONFIG.lighting.ambientIntensity);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff2d8, SUNDUC_CONFIG.lighting.keyIntensity);
  key.position.set(4.5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0003;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8bc6ff, SUNDUC_CONFIG.lighting.fillIntensity);
  fill.position.set(-6, 4, 5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xa78bfa, SUNDUC_CONFIG.lighting.rimIntensity);
  rim.position.set(-2, 5, -7);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.3, 64),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.16 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  floor.receiveShadow = true;
  scene.add(floor);
}
