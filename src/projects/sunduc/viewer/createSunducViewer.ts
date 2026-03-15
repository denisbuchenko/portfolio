import * as THREE from "three";
import { enableShadowsAndSrgb } from "../../city/three/loadGltf";
import { SUNDUC_CONFIG } from "../config";

export type SunducViewer = {
  readonly rotationRoot: THREE.Group;
  hitTestModelAtClientPoint(clientX: number, clientY: number): boolean;
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

  const rotationRoot = new THREE.Group();
  const modelGroup = new THREE.Group();
  rotationRoot.add(modelGroup);
  scene.add(rotationRoot);

  _setupLights(scene);

  let modelRoot: THREE.Object3D | null = null;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  return {
    rotationRoot,
    hitTestModelAtClientPoint(clientX: number, clientY: number): boolean {
      if (!modelRoot) return false;

      const rect = options.canvas.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return false;
      }

      pointerNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointerNdc, camera);

      return raycaster.intersectObject(modelGroup, true).some((intersection) => {
        return intersection.object.visible;
      });
    },
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
      const glowRoot = _createGlowRoot(model);
      if (glowRoot) {
        model.add(glowRoot);
      }
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
    model.updateMatrixWorld(true);

    const fitBounds = new THREE.Box3().setFromObject(model);
    const pivotBounds = _getBoundsByNodeNames(model, SUNDUC_CONFIG.model.centering.pivotNodeNames) ?? fitBounds;
    const groundBounds = _getBoundsByNodeNames(model, SUNDUC_CONFIG.model.centering.groundNodeNames) ?? pivotBounds;

    const fitSize = fitBounds.getSize(new THREE.Vector3());
    const pivotCenter = pivotBounds.getCenter(new THREE.Vector3());
    const fitScale = SUNDUC_CONFIG.camera.fitHeight / Math.max(fitSize.y, 0.001);

    model.position.set(
      -pivotCenter.x,
      -groundBounds.min.y,
      -pivotCenter.z
    );
    model.scale.setScalar(fitScale * SUNDUC_CONFIG.model.scale);

    const offsetScale = fitScale * SUNDUC_CONFIG.model.scale;
    modelGroup.position.set(
      SUNDUC_CONFIG.model.offset.x,
      SUNDUC_CONFIG.model.offset.y,
      SUNDUC_CONFIG.model.offset.z
    );

    const focusY = (pivotCenter.y - groundBounds.min.y) * offsetScale;
    camera.lookAt(
      SUNDUC_CONFIG.model.offset.x + SUNDUC_CONFIG.camera.lookAtOffset.x,
      SUNDUC_CONFIG.model.offset.y + focusY + SUNDUC_CONFIG.camera.lookAtOffset.y,
      SUNDUC_CONFIG.model.offset.z + SUNDUC_CONFIG.camera.lookAtOffset.z
    );
  }
}

function _createGlowRoot(model: THREE.Object3D): THREE.Group | null {
  const glowConfig = SUNDUC_CONFIG.glow;
  if (!glowConfig.enabled) return null;

  const target = model.getObjectByName(glowConfig.targetNodeName);
  if (!target) return null;

  model.updateWorldMatrix(true, true);
  target.updateWorldMatrix(true, true);

  const targetBounds = new THREE.Box3().setFromObject(target);
  const targetCenterWorld = targetBounds.isEmpty()
    ? target.getWorldPosition(new THREE.Vector3())
    : targetBounds.getCenter(new THREE.Vector3());
  const modelScale = model.getWorldScale(new THREE.Vector3());
  const scaleFactor = Math.max(modelScale.x, modelScale.y, modelScale.z, 0.0001);
  const targetSizeWorld = targetBounds.getSize(new THREE.Vector3());
  const baseSize = Math.max(targetSizeWorld.length() / scaleFactor, 0.18);
  const glowPosition = model.worldToLocal(targetCenterWorld.clone());

  glowPosition.x += glowConfig.offset.x;
  glowPosition.y += glowConfig.offset.y;
  glowPosition.z += glowConfig.offset.z;

  target.visible = false;

  const glowRoot = new THREE.Group();
  glowRoot.name = `${glowConfig.targetNodeName}_glow`;
  glowRoot.position.copy(glowPosition);

  const glowColor = new THREE.Color(glowConfig.color);
  const glowTexture = _createGlowTexture();
  const coreOpacity = Math.min(1, 0.46 + glowConfig.intensity * 0.04);
  const haloOpacity = Math.min(0.8, 0.24 + glowConfig.intensity * 0.022);
  const outerOpacity = Math.min(0.48, 0.11 + glowConfig.intensity * 0.014);

  glowRoot.add(_createGlowSprite(glowTexture, glowColor, baseSize * 1.8, coreOpacity));
  glowRoot.add(_createGlowSprite(glowTexture, glowColor, baseSize * 3.2, haloOpacity));
  glowRoot.add(_createGlowSprite(glowTexture, glowColor, baseSize * 4.8, outerOpacity));

  const coreLight = new THREE.PointLight(glowColor, glowConfig.intensity, glowConfig.lightDistance, 1.2);
  const haloLight = new THREE.PointLight(0xfff0a8, glowConfig.intensity * 0.65, glowConfig.lightDistance * 1.7, 1.6);
  glowRoot.add(coreLight);
  glowRoot.add(haloLight);

  return glowRoot;
}

function _getBoundsByNodeNames(root: THREE.Object3D, nodeNames: readonly string[]): THREE.Box3 | null {
  let bounds: THREE.Box3 | null = null;

  for (const nodeName of nodeNames) {
    const object = root.getObjectByName(nodeName);
    if (!object) continue;

    const objectBounds = new THREE.Box3().setFromObject(object);
    if (objectBounds.isEmpty()) continue;

    if (bounds) bounds.union(objectBounds);
    else bounds = objectBounds.clone();
  }

  return bounds;
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

function _createGlowSprite(
  texture: THREE.Texture,
  color: THREE.Color,
  size: number,
  opacity: number
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  sprite.renderOrder = 8;
  sprite.raycast = () => {};
  return sprite;
}

function _createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 253, 220, 1)");
  gradient.addColorStop(0.22, "rgba(255, 227, 120, 0.98)");
  gradient.addColorStop(0.5, "rgba(255, 198, 54, 0.55)");
  gradient.addColorStop(1, "rgba(255, 198, 54, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
