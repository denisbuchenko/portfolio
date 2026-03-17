export const SUNDUC_CONFIG = {
  assetUrl: "/sunduc/sunduc.glb",
  title: "Портфолио интерактивных проектов",
  eyebrow: "Web graphics / creative development",
  lead:
    "Ваша главная задача - открыть сундук. Для этого придется пройти несколько головоломок, проявить характер и иметь IQ 120 и выше.",
  paragraphs: [
    "Это точка входа в мое портфолио. Вместо обычной витрины здесь единое пространство, через которое я показываю навыки в веб-графике, анимации и креативной разработке.",
    "У каждого проекта своя идея, визуальный характер и настроение. Большая часть контента была создана мной, а все заимствованные материалы я отдельно отмечаю в дополнительных ссылках."
  ],
  badges: ["Three.js / WebGL", "Lottie Animation", "3D Animation"],
  additionalInfo: {
    buttonLabel: "Дополнительная информация",
    title: "Дополнительная информация",
    lead: "Здесь будет отдельное окно с контактами, e-mail и ссылками на заимствованные материалы.",
    paragraphs: [
      "Пока это заглушка, но сам блок уже выделен под расширенную информацию о проекте.",
      "Позже сюда можно добавить удобный список источников, ссылки на связанные работы и способы связи."
    ],
    closeLabel: "Закрыть"
  },
  layout: {
    infoMinHeightVh: 16,
    viewerMinHeightVh: 62,
    infoMaxWidthPx: 1280,
    debugPanelWidthPx: 280,
    canvasMinHeightPx: 420
  },
  camera: {
    fovDeg: 34,
    near: 0.1,
    far: 100,
    position: { x: 0, y: 1.45, z: 7.2 },
    lookAtOffset: { x: 0, y: 0, z: 0 },
    fitHeight: 2.3
  },
  lighting: {
    ambientIntensity: 1.6,
    keyIntensity: 2.6,
    fillIntensity: 1.15,
    rimIntensity: 1.35
  },
  glow: {
    enabled: true,
    targetNodeName: "L",
    color: "#ffd43b",
    intensity: 50,
    lightDistance: 3.6,
    offset: { x: 0.15, y: -0.1, z: 0 }
  },
  titlePlane: {
    enabled: true,
    targetNodeName: "L",
    color: "#ffffff",
    opacity: 0.96,
    fontFamily: "Inter, Arial, sans-serif",
    fontWeight: 800,
    fontSizePx: 115,
    minFontSizePx: 24,
    lineHeight: 1.16,
    paragraphGapFactor: 0.48,
    textureWidthPx: 1024,
    maxTextureHeightPx: 4096,
    paddingPx: { x: 52, y: 42 },
    glowBlurPx: 7,
    glowColor: "#000000",
    dimensions: {
      width: 0.9,
      heightScale: 1,
      minHeight: 0.7,
      maxHeight: 4.2
    },
    offset: { x: 0.15, y: -0.1, z: 0.08 },
    animation: {
      startDelayMs: 1000,
      riseSpeed: 0.07,
      maxOffsetY: 5.25
    }
  },
  model: {
    scale: 1,
    initialRotationDeg: { x: -8, y: 28, z: 0 },
    offset: { x: 0, y: 0, z: 0 },
    centering: {
      pivotNodeNames: ["base", "base2", "L", "top", "Cube.004", "Cube.005"],
      groundNodeNames: ["base", "base2", "L"]
    },
    dragSensitivity: { x: 0.012, y: 0.009 },
    damping: 0.14,
    minPitchDeg: -30,
    maxPitchDeg: 26
  },
  debug: {
    showPanel: true,
    showScenarioButton: true
  },
  animationAliases: {
    stones: ["stone1", "stone2", "stone3", "stone4"],
    stoneSearch: ["stone", "stine"],
    close: ["close1", "open1"],
    dudu: ["dudu"],
    key: ["key"],
    open: ["open2"]
  }
} as const;

export type SunducConfig = typeof SUNDUC_CONFIG;
