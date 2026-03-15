import * as THREE from "three";
import { enableShadowsAndSrgb } from "../../city/three/loadGltf";
import { SUNDUC_CONFIG } from "../config";
import { SUNDUC_TITLE_PLANE_CONTENT } from "../content";

export type SunducViewer = {
  readonly rotationRoot: THREE.Group;
  hitTestModelAtClientPoint(clientX: number, clientY: number): boolean;
  resize(width: number, height: number): void;
  setModel(model: THREE.Object3D): void;
  update(deltaSeconds: number): void;
  scheduleTitleReveal(): void;
  resetTitleReveal(): void;
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
  renderer.localClippingEnabled = true;

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
  let titlePlaneController: _SunducTitlePlaneController | null = null;
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
      titlePlaneController?.dispose();
      titlePlaneController = null;

      if (modelRoot) {
        modelGroup.remove(modelRoot);
      }

      modelRoot = model;
      enableShadowsAndSrgb(model);
      _fitModel(model);
      titlePlaneController = _createTitlePlaneController(model);
      const glowRoot = _createGlowRoot(model);
      if (glowRoot) {
        model.add(glowRoot);
      }
      modelGroup.add(model);
    },
    update(deltaSeconds: number): void {
      titlePlaneController?.update(deltaSeconds);
    },
    scheduleTitleReveal(): void {
      titlePlaneController?.scheduleReveal();
    },
    resetTitleReveal(): void {
      titlePlaneController?.reset();
    },
    render(): void {
      renderer.render(scene, camera);
    },
    dispose(): void {
      titlePlaneController?.dispose();
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

type _SunducTitlePlaneController = {
  scheduleReveal(): void;
  reset(): void;
  update(deltaSeconds: number): void;
  dispose(): void;
};

type _ResolvedSunducAnchor = {
  target: THREE.Object3D;
  position: THREE.Vector3;
  baseSize: number;
};

function _createGlowRoot(model: THREE.Object3D): THREE.Group | null {
  const glowConfig = SUNDUC_CONFIG.glow;
  if (!glowConfig.enabled) return null;

  const anchor = _resolveSunducAnchor(model, glowConfig.targetNodeName);
  if (!anchor) return null;

  const glowPosition = anchor.position.clone();

  glowPosition.x += glowConfig.offset.x;
  glowPosition.y += glowConfig.offset.y;
  glowPosition.z += glowConfig.offset.z;

  anchor.target.visible = false;

  const glowRoot = new THREE.Group();
  glowRoot.name = `${glowConfig.targetNodeName}_glow`;
  glowRoot.position.copy(glowPosition);

  const glowColor = new THREE.Color(glowConfig.color);
  const glowTexture = _createGlowTexture();
  const coreOpacity = Math.min(1, 0.46 + glowConfig.intensity * 0.04);
  const haloOpacity = Math.min(0.8, 0.24 + glowConfig.intensity * 0.022);
  const outerOpacity = Math.min(0.48, 0.11 + glowConfig.intensity * 0.014);

  glowRoot.add(_createGlowSprite(glowTexture, glowColor, anchor.baseSize * 1.8, coreOpacity));
  glowRoot.add(_createGlowSprite(glowTexture, glowColor, anchor.baseSize * 3.2, haloOpacity));
  glowRoot.add(_createGlowSprite(glowTexture, glowColor, anchor.baseSize * 4.8, outerOpacity));

  const coreLight = new THREE.PointLight(glowColor, glowConfig.intensity, glowConfig.lightDistance, 1.2);
  const haloLight = new THREE.PointLight(0xfff0a8, glowConfig.intensity * 0.65, glowConfig.lightDistance * 1.7, 1.6);
  glowRoot.add(coreLight);
  glowRoot.add(haloLight);

  return glowRoot;
}

function _createTitlePlaneController(model: THREE.Object3D): _SunducTitlePlaneController | null {
  const titlePlaneConfig = SUNDUC_CONFIG.titlePlane;
  if (!titlePlaneConfig.enabled) return null;

  const anchor = _resolveSunducAnchor(model, titlePlaneConfig.targetNodeName);
  if (!anchor) return null;

  const textureData = _createTitlePlaneTexture();
  const planeHeight = THREE.MathUtils.clamp(
    titlePlaneConfig.dimensions.width * textureData.aspectRatio * titlePlaneConfig.dimensions.heightScale,
    titlePlaneConfig.dimensions.minHeight,
    titlePlaneConfig.dimensions.maxHeight
  );
  const geometry = new THREE.PlaneGeometry(titlePlaneConfig.dimensions.width, planeHeight);
  geometry.translate(0, -planeHeight / 2, 0);

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const material = new THREE.MeshBasicMaterial({
    map: textureData.texture,
    transparent: true,
    opacity: titlePlaneConfig.opacity,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
    clippingPlanes: [clipPlane]
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${titlePlaneConfig.targetNodeName}_titlePlane`;
  mesh.renderOrder = 10;
  mesh.visible = false;

  const anchorPosition = anchor.position.clone().add(
    new THREE.Vector3(
      titlePlaneConfig.offset.x,
      titlePlaneConfig.offset.y,
      titlePlaneConfig.offset.z
    )
  );
  let currentOffsetY = 0;
  let delayRemainingSec = 0;
  let revealScheduled = false;
  let revealStarted = false;

  _syncMeshPosition();
  _syncClipPlane();
  model.add(mesh);

  return {
    scheduleReveal(): void {
      currentOffsetY = 0;
      delayRemainingSec = titlePlaneConfig.animation.startDelayMs / 1000;
      revealScheduled = true;
      revealStarted = false;
      mesh.visible = false;
      _syncMeshPosition();
    },
    reset(): void {
      currentOffsetY = 0;
      delayRemainingSec = 0;
      revealScheduled = false;
      revealStarted = false;
      mesh.visible = false;
      _syncMeshPosition();
    },
    update(deltaSeconds: number): void {
      _syncClipPlane();

      if (revealScheduled && !revealStarted) {
        delayRemainingSec = Math.max(0, delayRemainingSec - deltaSeconds);
        if (delayRemainingSec === 0) {
          revealStarted = true;
          mesh.visible = true;
        }
      }

      if (!revealStarted) return;

      currentOffsetY = Math.min(
        titlePlaneConfig.animation.maxOffsetY,
        currentOffsetY + titlePlaneConfig.animation.riseSpeed * deltaSeconds
      );
      _syncMeshPosition();
    },
    dispose(): void {
      model.remove(mesh);
      geometry.dispose();
      textureData.texture.dispose();
      material.dispose();
    }
  };

  function _syncMeshPosition(): void {
    mesh.position.set(anchorPosition.x, anchorPosition.y + currentOffsetY, anchorPosition.z);
  }

  function _syncClipPlane(): void {
    model.updateWorldMatrix(true, false);

    const clipPointWorld = model.localToWorld(anchorPosition.clone());
    const clipNormalWorld = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    clipPlane.setFromNormalAndCoplanarPoint(clipNormalWorld, clipPointWorld);
  }
}

function _resolveSunducAnchor(model: THREE.Object3D, targetNodeName: string): _ResolvedSunducAnchor | null {
  const target = model.getObjectByName(targetNodeName);
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

  return {
    target,
    position: model.worldToLocal(targetCenterWorld.clone()),
    baseSize: Math.max(targetSizeWorld.length() / scaleFactor, 0.18)
  };
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

function _createTitlePlaneTexture(): { texture: THREE.CanvasTexture; aspectRatio: number } {
  const titlePlaneConfig = SUNDUC_CONFIG.titlePlane;
  const contentParagraphs = _normalizeTitlePlaneParagraphs(SUNDUC_TITLE_PLANE_CONTENT);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    canvas.width = 2;
    canvas.height = 2;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return { texture, aspectRatio: 1 };
  }

  const layout = _buildTitlePlaneLayout(context, contentParagraphs);

  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `${titlePlaneConfig.fontWeight} ${layout.fontSize}px ${titlePlaneConfig.fontFamily}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = titlePlaneConfig.color;
  context.shadowColor = titlePlaneConfig.glowColor;
  context.shadowBlur = titlePlaneConfig.glowBlurPx;

  for (const line of layout.lines) {
    context.fillText(line.text, layout.textStartX, line.y);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    aspectRatio: canvas.height / canvas.width
  };
}

function _normalizeTitlePlaneParagraphs(content: string): string[] {
  return content
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function _buildTitlePlaneLayout(
  context: CanvasRenderingContext2D,
  contentParagraphs: string[]
): {
  canvasWidth: number;
  canvasHeight: number;
  fontSize: number;
  textStartX: number;
  lines: Array<{ text: string; y: number }>;
} {
  const titlePlaneConfig = SUNDUC_CONFIG.titlePlane;
  const canvasWidth = titlePlaneConfig.textureWidthPx;
  const textWidth = canvasWidth - titlePlaneConfig.paddingPx.x * 2;
  let fontSize = titlePlaneConfig.fontSizePx;
  let bestLayout: {
    canvasHeight: number;
    fontSize: number;
    lines: Array<{ text: string; y: number }>;
  } | null = null;

  while (fontSize >= titlePlaneConfig.minFontSizePx) {
    const font = `${titlePlaneConfig.fontWeight} ${fontSize}px ${titlePlaneConfig.fontFamily}`;
    context.font = font;

    const lineAdvance = fontSize * titlePlaneConfig.lineHeight;
    const paragraphGap = fontSize * titlePlaneConfig.paragraphGapFactor;
    const lines: Array<{ text: string; y: number }> = [];
    let y = titlePlaneConfig.paddingPx.y;

    for (let paragraphIndex = 0; paragraphIndex < contentParagraphs.length; paragraphIndex += 1) {
      const paragraphLines = _wrapTitlePlaneParagraph(context, contentParagraphs[paragraphIndex], textWidth);

      for (const line of paragraphLines) {
        lines.push({ text: line, y });
        y += lineAdvance;
      }

      if (paragraphIndex < contentParagraphs.length - 1) {
        y += paragraphGap;
      }
    }

    const canvasHeight = Math.ceil(y + titlePlaneConfig.paddingPx.y);
    bestLayout = {
      canvasHeight,
      fontSize,
      lines
    };

    if (canvasHeight <= titlePlaneConfig.maxTextureHeightPx) {
      break;
    }

    fontSize -= 2;
  }

  return {
    canvasWidth,
    canvasHeight: Math.max(2, bestLayout?.canvasHeight ?? 2),
    fontSize: bestLayout?.fontSize ?? titlePlaneConfig.minFontSizePx,
    textStartX: titlePlaneConfig.paddingPx.x,
    lines: bestLayout?.lines ?? []
  };
}

function _wrapTitlePlaneParagraph(
  context: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number
): string[] {
  const words = paragraph
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .flatMap((word) => _splitTitlePlaneWord(context, word, maxWidth));
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const nextLine = `${currentLine} ${words[index]}`;
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = words[index];
  }

  lines.push(currentLine);
  return lines;
}

function _splitTitlePlaneWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number
): string[] {
  if (context.measureText(word).width <= maxWidth) {
    return [word];
  }

  const parts: string[] = [];
  let currentPart = "";

  for (const character of word) {
    const nextPart = `${currentPart}${character}`;
    if (currentPart.length > 0 && context.measureText(nextPart).width > maxWidth) {
      parts.push(currentPart);
      currentPart = character;
      continue;
    }

    currentPart = nextPart;
  }

  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts;
}
