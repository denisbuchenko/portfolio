import type { BikerAnimationConfig } from "./contracts";
import type { BikerMotionConfig } from "./contracts";
import type { OverviewCameraConfig } from "./contracts";
import type { FocusStartConfig } from "./contracts";
import type { ProximityActivationRule } from "./contracts";
import type { CrashRecoveryConfig } from "./contracts";
import type { AnimationChannelId } from "./contracts";

export const CITY_ASSETS = {
  cityGltfUrl: "/city/city.glb",
  bikerGltfUrl: "/city/Chel.glb"
} as const;
export const CITY_WORLD = {
  /** Поворот карты вокруг Y в градусах. 0 = как в 3D файле. */
  mapRotationYDeg: -90,
  boundaryWalls: {
    enabled: true,
    height: 2.8,
    thickness: 1.4,
    inset: 0.6,
    color: 0x7d7d7d
  }
} as const;

/**
 * Тюнинг игры (одно место для правок).
 * Эти значения используются и в логике движения, и в камере.
 */
export const CITY_TUNING = {
  camera: {
    /** Насколько камера отдалена от персонажа в игровом режиме. */
    distance: 50
  },
  biker: {
    /** Стабильная скорость после разгона. */
    cruiseSpeed: 9, //12
    /** Радиус поворота в начале удержания. */
    turnRadiusStart: 12,
    /** Минимальный радиус поворота при долгом удержании. */
    turnRadiusMin: 6
  },
  occlusion: {
    /**
     * Прозрачность дома, который загораживает персонажа.
     * 0.4 = дом на 60% прозрачный.
     */
    buildingOpacity: 0.2,
    /** Длительность плавного изменения прозрачности (сек). */
    fadeSec: 0.22
  }
} as const;


export const CITY_GAMEPLAY = {
  bikerMotion: {
    speed: {
      idleSec: 2,
      rampSec: 3,
      cruiseSpeed: CITY_TUNING.biker.cruiseSpeed
    },
    turn: {
      radiusStart: CITY_TUNING.biker.turnRadiusStart,
      radiusMin: CITY_TUNING.biker.turnRadiusMin,
      radiusEaseSec: 1.8
    },
    // Подберём позже по модели. Сейчас — разумный оффсет вперёд/вверх.
    collisionTipLocalOffset: { x: 0, y: 0.35, z: 1.2 }
  } satisfies BikerMotionConfig,

  collisions: {
    activation: {
      enableRadius: 26,
      disableRadius: 30
    } satisfies ProximityActivationRule,
  },

  crash: {
    resetDelaySec: 3
  } satisfies CrashRecoveryConfig,

  /**
   * Сценарий "подъехал к девочке и заехал в цель":
   * - заранее замедляем (в зоне активации)
   * - на цилиндре плавно останавливаемся
   * - камера фокусируется на девочке, играет love -> love2
   * - держим кадр и возвращаемся в игру
   */
  girlEncounter: {
    slowdown: {
      /** Включить замедление при подъезде к цели. */
      enabled: true,
      /**
       * Радиус активации замедления относительно радиуса реакции девочки (CITY_GIRLS.hello.distance).
       * Внутри этого радиуса начинаем плавно замедляться по мере приближения к цилиндру.
       */
      activationRadiusMultiplier: 2.0,
      /**
       * Минимальная скорость на границе цилиндра (reachRadius).
       * 0.333 => в 3 раза медленнее.
       */
      edgeSpeedMultiplier: 1 / 3,
      /** Кривая замедления внутри зоны. */
      curve: "smoothstep" as "linear" | "smoothstep",
      /** Плавность замедления (сек). */
      approachEaseSec: 0.35,
      /** Плавность восстановления скорости (сек). */
      releaseEaseSec: 0.55
    },
    stop: {
      /** Плавность полной остановки после въезда в цилиндр (сек). */
      easeSec: 0.45
    },
    camera: {
      /** Насколько камера ближе при фокусе на девочке (distance * multiplier). */
      focusDistanceMultiplier: 0.7,
      /** Доп. множитель для Y-цели (0 = как в gameplay.view.targetY). */
      focusTargetY: 0.9,
      /** Сколько секунд "въезжаем" камерой к девочке (рост веса фокуса). */
      focusInSec: 0.55,
      /** Сколько секунд "выезжаем" обратно (падение веса фокуса). */
      returnSec: 0.75,
      /** Сколько секунд держим стоп+камера после окончания love. */
      holdSec: 2.5
    },
    resume: {
      /** Плавность набора скорости после катсцены (сек). */
      easeSec: 0.9
    }
  }
} as const;

const CHANNELS = {
  pedals: "pedals" as AnimationChannelId,
  turnBody: "turnBody" as AnimationChannelId,
  turnArms: "turnArms" as AnimationChannelId
} as const;

export const CITY_ANIMATION = {
  biker: {
    channels: CHANNELS,
    pedals: {
      fadeInSec: 0.2,
      fadeOutSec: 0.25,
      maxPlaybackSpeed: 2.2
    },
    turn: {
      fadeIn: { durationSec: 0.12, restartTarget: true },
      returnToNeutral: { durationSec: 0.12, restartTarget: false },
      reverseSnap: { durationSec: 0.07, restartTarget: true }
    }
  } satisfies BikerAnimationConfig
} as const;

export const CITY_CAMERA = {
  overview: {
    fitHorizontally: true,
    clamp: true,
    track: {
      prePadding01: 0.12,
      postPadding01: 0.12
    },
    usePerspective: true,
    orthoViewSize: 220,
    extraTransform: {
      positionOffset: { x: 0, y: 0, z: 400 },
      rotationOffsetDeg: { x: 10, y: 0, z: 0 }
    }
  } satisfies OverviewCameraConfig,

  /**
   * Настройки игровой камеры.
   * - `usePerspective`: true = PerspectiveCamera, false = OrthographicCamera
   * - `extraTransform`: дополнительная “ручная” подстройка (смещение + поворот в градусах)
   */
  gameplay: {
    usePerspective: true,
    orthoViewSize: 26,
    /** Фиксированный “3/4” ракурс: камера не вращается, только следует по плоскости. */
    view: {
      yawDeg: 45,
      pitchDeg: -35,
      rollDeg: 0,
      distance: CITY_TUNING.camera.distance,
      targetY: 0.8,
      followLerp: 0.12
    },
    /**
     * Приближение камеры при подъезде к девочке:
     * - есть радиус реакции девочки (см. CITY_GIRLS.hello.distance)
     * - есть больший радиус активации камеры
     * - внутри активации камера плавно приближается, но не ближе minDistanceMultiplier
     * - при отъезде — плавно возвращается назад
     */
    proximityZoom: {
      enabled: true,
      /**
       * Радиус активации камеры относительно радиуса реакции девочки.
       * Например 2 => активация в 2 раза дальше, чем начало реакции.
       */
      activationRadiusMultiplier: 2.0,
      /**
       * Насколько близко можно приблизить камеру.
       * 0.5 => в 2 раза ближе (distance * 0.5).
       */
      minDistanceMultiplier: 0.5,
      /** Плавность приближения (сек). */
      approachEaseSec: 0.35,
      /** Плавность отдаления (сек). */
      releaseEaseSec: 0.55,
      /** Кривая 0..1 → 0..1 внутри зоны активации. */
      curve: "smoothstep" as "linear" | "smoothstep"
    },
    extraTransform: {
      positionOffset: { x: 0, y: 0, z: 0 },
      rotationOffsetDeg: { x: 0, y: 0, z: 0 }
    }
  },

  focusStart: {
    travelSec: 1.1,
    ease: {
      curve: "smoothstep" as "linear" | "smoothstep"
    },
    gameplayPitchDeg: 52,
    gameplayDistance: 18
  } satisfies FocusStartConfig,

  /**
   * Debug камера для кнопки "Фокус на Girl #1" (используется только в overview режиме).
   * Позволяет руками подогнать:
   * - направление (yaw/pitch)
   * - отдаление (через padding + fov)
   * - скорость перелёта (travelSec)
   * - доп. локальный сдвиг и поворот (extraTransform)
   */
  debugFocusGirl: {
    /**
     * Режим:
     * - fit: автоматом ставим камеру так, чтобы девочка влезала целиком (по bbox + fov)
     * - fixed: фиксированное положение/поворот относительно центра девочки
     */
    mode: "fit" as "fit" | "fixed",
    travelSec: 0.9,
    /** Вертикальный FOV перспективной debug-камеры. */
    fov: 38,
    /** Запас вокруг модели (больше = камера дальше). */
    padding: 1.22,
    /** Направление, откуда смотрим на девочку. */
    yawDeg: 45,
    pitchDeg: -12,
    /**
     * Fixed-режим: позиция камеры задаётся через локальный оффсет относительно точки фокуса.
     * Оси локальные для "lookAt на девочку":
     * - x: вправо
     * - y: вверх
     * - z: вперёд (в сторону взгляда)
     *
     * Пример: { x: 0, y: 0.2, z: -7 } = камера чуть выше и дальше назад.
     */
    fixed: {
      /** Локальный оффсет камеры относительно центра (после lookAt). */
      cameraLocalOffset: { x: 0, y: 0.25, z: -8.5 },
      /** Локальный оффсет точки, куда смотрим (например, на грудь, а не в центр). */
      lookAtLocalOffset: { x: 0, y: 0.45, z: 0 }
    },
    /**
     * Доп. ручная подстройка:
     * - rotationOffsetDeg применяется к уже вычисленному lookAt (локальные оси камеры)
     * - positionOffset трактуется как локальный оффсет (вправо/вверх/вперёд)
     */
    extraTransform: {
      positionOffset: { x: 0, y: 0, z: 2 },
      rotationOffsetDeg: { x: 0, y: 180, z: 0 }
    }
  }
} as const;

