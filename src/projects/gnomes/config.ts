export const GNOMES_CONFIG = {
  glbUrl: "/gnomes/export.glb",
  pages: 3,

  gnomes: {
    /** Целевая высота гнома в world units (масштабируем модель по bounds). */
    targetHeight: 0.62,
    /** Дополнительный множитель к масштабу (для быстрого тюнинга без пересчёта targetHeight). */
    scaleMultiplier: 0.5,
    /** Базовое положение каждого гнома (до разнесения по страницам). */
    basePosition: { x: 0, y: 0.50, z: 0 },
    /** Множитель разнесения по страницам (1 = ровно высота видимой области камеры). */
    pageSpacingMultiplier: 1.0,

    /** Палитры расцветки: шапка + белая ткань (руки/тело). */
    palette: {
      /** Цвет шапки по умолчанию для всех гномов. */
      defaultHatColor: 0xff1a1a,
      /** Индивидуальные цвета ткани и (опционально) шапки. */
      byId: {
        horogran: { clothColor: 0xff1a1a, hatColor: 0xff1a1a },
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
    z: 3.75,
    /** Чем больше — тем быстрее камера догоняет скролл. */
    damping: 24,
  },

  visuals: {
    renderer: {
      /** Ограничение DPR: выше = чётче, но дороже по производительности. */
      maxPixelRatio: 2,
      /** Главная ручка "светлее/темнее" для всей сцены. */
      toneMappingExposure: 1.05,
    },

    environment: {
      /** Общий фон сцены. */
      backgroundColor: 0x05070c,
      /** Цвет тумана лучше держать близким к фону, чтобы сцена собиралась в цельную картинку. */
      fogColor: 0x05070c,
      /** Чем меньше near, тем раньше туман начинает "съедать" контраст вдаль. */
      fogNear: 8.5,
      /** Чем меньше far, тем плотнее/киношнее глубина. */
      fogFar: 21,
    },

    ground: {
      width: 22,
      length: 300,
      y: -0.001,
      color: 0x070a12,
      /** Увеличивай roughness для более матового пола. */
      roughness: 1.0,
      /** Чуть больше metalness может дать более "глянцевый" низ кадра. */
      metalness: 0.0,
    },

    lights: {
      hemisphere: {
        skyColor: 0xbfd2ff,
        groundColor: 0x101018,
        /** Мягкий общий свет. Поднимай, если тени кажутся слишком жёсткими. */
        intensity: 2.22,
      },
      key: {
        color: 0xffffff,
        /** Главный формирующий свет. Больше = объёмнее, но и контрастнее. */
        intensity: 1.95,
        position: { x: 3.5, y: 6.0, z: 4.0 },
        castShadow: true,
        shadowMapSize: 2048,
        shadowCamera: {
          near: 0.5,
          far: 24,
          left: -6,
          right: 6,
          top: 8,
          bottom: -8,
        },
        /** Если тени артефачат, сначала двигай normalBias, потом bias. */
        shadowBias: -0.00005,
        shadowNormalBias: 0.02,
      },
      fill: {
        color: 0x9ad5ff,
        /** Заполняющий холодный свет. Полезен, если фронт гнома слишком проваливается в тень. */
        intensity: 1.05,
        distance: 30,
        position: { x: -2.2, y: 2.2, z: 2.4 },
      },
      rim: {
        color: 0xaac7ff,
        /** Контровой свет. Поднимай аккуратно: он быстро начинает выглядеть искусственно. */
        intensity: 0.3,
        position: { x: -3.0, y: 2.8, z: -2.5 },
      },
    },

    materials: {
      tint: {
        /**
         * Насколько сильно кастомный цвет шапки/ткани заменяет исходный.
         * 1 = полностью наш tint, 0 = исходная текстура.
         */
        strength: 1.0,
        /**
         * Гамма яркости для tint. >1 затемняет полутона, <1 делает цвет более "сочным".
         */
        gamma: 0.95,
        /**
         * Минимальная яркость tint, чтобы цвет не проваливался в грязь в тенях.
         */
        minLightness: 0.16,
        /**
         * Верхняя граница яркости tint. Уменьшай, если цвет слишком "кислотный".
         */
        maxLightness: 0.5,
      },
      sit: {
        color: 0x6b4b2a,
      },
    },
  },
} as const;

