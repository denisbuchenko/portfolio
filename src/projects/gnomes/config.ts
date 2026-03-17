import type { GnomeAnimationProfile } from "./GnomeController";

const DEFAULT_GNOME_ANIMATION_PROFILE: GnomeAnimationProfile = {
  pose: {
    fadeInSec: 0.08,
    fadeOutSec: 0.08,
    weight: 1,
    timeScale: 1,
    repetitions: 1,
    clampWhenFinished: true,
  },
  hello: {
    fadeInSec: 0.12,
    fadeOutSec: 0.16,
    weight: 1,
    timeScale: 1,
    repetitions: 1,
    clampWhenFinished: true,
  },
  def: {
    enabled: true,
    intervalSec: 4.2,
    intervalJitterSec: 0.8,
    /** Сколько раз подряд в среднем проигрывать def за один запуск. */
    cycleRepetitions: 1,
    /** Дополнительное случайное число повторов: итог будет от cycleRepetitions до cycleRepetitions + variation. */
    variation: 0,
    fadeInSec: 0.18,
    fadeOutSec: 0.22,
    weight: 1,
    timeScale: 1,
    repetitions: 1,
    clampWhenFinished: true,
  },
};

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
    animations: {
      defaultProfile: DEFAULT_GNOME_ANIMATION_PROFILE,
      byId: {
        horogran: {
          ...DEFAULT_GNOME_ANIMATION_PROFILE,
          def: {
            ...DEFAULT_GNOME_ANIMATION_PROFILE.def,
            fadeInSec: 0.24,
            fadeOutSec: 0.28,
            intervalSec: 1.9,
            intervalJitterSec: 1.1,
            cycleRepetitions: 6,
            variation: 3,
          },
        },
        fyfchik: {
          ...DEFAULT_GNOME_ANIMATION_PROFILE,
          def: {
            ...DEFAULT_GNOME_ANIMATION_PROFILE.def,
            fadeInSec: 0.05,
            fadeOutSec: 0.06,
            intervalSec: 3.8,
            intervalJitterSec: 0.35,
            cycleRepetitions: 1,
            variation: 0,
          },
        },
        pipiser: {
          ...DEFAULT_GNOME_ANIMATION_PROFILE,
          hello: {
            ...DEFAULT_GNOME_ANIMATION_PROFILE.hello,
            fadeInSec: 0.14,
            fadeOutSec: 0.18,
          },
          def: {
            ...DEFAULT_GNOME_ANIMATION_PROFILE.def,
            fadeInSec: 0.2,
            fadeOutSec: 0.24,
            intervalSec: 5.4,
            intervalJitterSec: 1.2,
            cycleRepetitions: 5,
            variation: 3,
            timeScale: 0.96,
          },
        },
      } as Record<string, GnomeAnimationProfile>,
    },
  },

  camera: {
    fov: 35,
    near: 0.05,
    far: 80,
    /** Камера будет двигаться по Y, оставаясь на этом расстоянии от гномов (z≈0). */
    z: 3.75,
    /**
     * Линейная скорость камеры от скролла.
     * 1 = нативная скорость, меньше = камера идёт медленнее, больше = быстрее.
     */
    scrollSpeed: 1.2,
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

