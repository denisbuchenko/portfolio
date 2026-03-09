export const OSMINOG_DUDU_CONFIG = {
  assetUrl: "/sunduc/dudu.glb",
  layer: {
    topPercent: 0,
    heightPercent: 0.5
  },
  frame: {
    // В какой части верхнего слоя рисуем дудку.
    // Это удобно для быстрой ручной подгонки композиции без изменения камеры.
    topPercent: 0.04,
    heightPercent: 0.92,
    scale: 1,
    offsetXPx: 0,
    offsetYPx: 0
  },
  camera: {
    useEmbeddedCamera: true,
    preserveEmbeddedAspect: true,
    focusDistance: 2,
    fallback: {
      fovDeg: 28,
      near: 0.1,
      far: 100,
      position: { x: -0.12, y: 0.68, z: 2.02 },
      target: { x: 0, y: 0.55, z: 0.8 }
    },
    // Все значения ниже идут В ЛОКАЛЬНЫХ ОСЯХ КАМЕРЫ, а не в мировых.
    // Поэтому поведение предсказуемое:
    // - pan.x: вправо/влево по кадру
    // - pan.y: вверх/вниз по кадру
    // - dolly: ближе/дальше вдоль взгляда камеры
    // - aim.x: сместить точку взгляда вправо/влево
    // - aim.y: сместить точку взгляда вверх/вниз
    pan: { x: -0.05, y: 0 },
    dolly: 0,
    aim: { x: 0, y: 0 },
    fovOffsetDeg: 0
  },
  lighting: {
    ambientIntensity: 1.4,
    keyIntensity: 1.75,
    fillIntensity: 1.05,
    rimIntensity: 0.8,
    fallbackKeyPosition: { x: 0.9, y: 1.1, z: 1.2 },
    fillPosition: { x: -1.2, y: 1.1, z: 1.5 },
    rimPosition: { x: 0.2, y: 1.4, z: -1.6 }
  },
  audio: {
    baseUrl: "/sound/flute_sound_kit/",
    notesByKey: {
      key1: "C5",
      key2: "B4",
      key3: "A4",
      key4: "G4",
      key5: "F4",
      key6: "E4",
      key7: "D4",
      key8: "C4"
    },
    sampleUrls: {
      C4: "FluteClean_C4.wav",
      D4: "FluteClean_D4.wav",
      "F#4": "FluteClean_Fs4.wav",
      "A#4": "FluteClean_As4.wav"
    },
    outputGain: 0.85,
    lowpassHz: 5200,
    reverbDecaySec: 1.9,
    reverbWet: 0.18,
    compressorThresholdDb: -18,
    compressorRatio: 3,
    attackSec: 0.02,
    releaseSec: 0.42
  }
} as const;

export type OsminogDuduConfig = typeof OSMINOG_DUDU_CONFIG;
