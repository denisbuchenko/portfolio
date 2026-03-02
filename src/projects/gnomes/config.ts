export const GNOMES_CONFIG = {
  glbUrl: "/gnomes/export.glb",
  pages: 3,

  gnomes: {
    /** Целевая высота гнома в world units (масштабируем модель по bounds). */
    targetHeight: 0.62,
    /** Дополнительный множитель к масштабу (для быстрого тюнинга без пересчёта targetHeight). */
    scaleMultiplier: 0.5,
    /** Базовое положение каждого гнома (до разнесения по страницам). */
    basePosition: { x: 0, y: -0.10, z: 0 },
    /** Множитель разнесения по страницам (1 = ровно высота видимой области камеры). */
    pageSpacingMultiplier: 1.0,

    /** Палитры расцветки: шапка + белая ткань (руки/тело). */
    palette: {
      /** Цвет шапки по умолчанию для всех гномов. */
      defaultHatColor: 0xff1a1a,
      /** Индивидуальные цвета ткани и (опционально) шапки. */
      byId: {
        shoragran: { clothColor: 0xff1a1a, hatColor: 0xff1a1a },
        fyfchik: { clothColor: 0x27d863, hatColor: 0xff1a1a },
        pipiser: { clothColor: 0xffd21a, hatColor: 0xff1a1a },
      },
    },
  },

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

