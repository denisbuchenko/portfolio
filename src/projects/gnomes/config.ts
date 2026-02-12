export const GNOMES_CONFIG = {
  glbUrl: "/gnomes/export.glb",
  pages: 3,

  /** Целевая высота гнома в world units (масштабируем модель по bounds). */
  targetHeight: 0.62,

  camera: {
    fov: 35,
    near: 0.05,
    far: 80,
    /** Камера будет двигаться по Y, оставаясь на этом расстоянии от гномов (z≈0). */
    z: 3.25,
    /** Чем больше — тем быстрее камера догоняет скролл. */
    damping: 12,
  },

  lighting: {
    hemisphereIntensity: 0.65,
    keyIntensity: 2.4,
    fillIntensity: 0.8,
  },
} as const;

