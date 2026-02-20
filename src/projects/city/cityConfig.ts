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
  mapRotationYDeg: -90
} as const;


export const CITY_GAMEPLAY = {
  bikerMotion: {
    speed: {
      idleSec: 2,
      rampSec: 3,
      cruiseSpeed: 18
    },
    turn: {
      radiusStart: 22,
      radiusMin: 6,
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
    extraTransform: {
      positionOffset: { x: 0, y: 0, z: 0 },
      rotationOffsetDeg: { x: 0, y: 0, z: 0 }
    }
  },

  focusStart: {
    travelSec: 1.1,
    gameplayPitchDeg: 52,
    gameplayDistance: 18
  } satisfies FocusStartConfig
} as const;

