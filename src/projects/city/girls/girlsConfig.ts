export const CITY_GIRLS = {
  /** GLB модель NPC. */
  glbUrl: "/city/Girl.glb",

  /**
   * Маркеры в `city.glb` (коллекция `users`), которые задают места NPC.
   * В текущем ассете они названы именно так: "user 1" ... "user 5".
   */
  markerNames: ["user 1", "user 2", "user 3", "user 4", "user 5"],

  /**
   * Масштабирование модели.
   * - `mode: "source"` — оставить исходный масштаб из GLB (рекомендовано, если ассет уже подогнан под город).
   * - `mode: "targetHeight"` — нормализовать по высоте bounds до `targetHeight`.
   */
  scale: {
    mode: "targetHeight" as "source" | "targetHeight",
    multiplier: 1.0,
    targetHeight: 1.65
  },

  /** Доп. смещение после "grounding" (y=0). */
  extraYOffset: 0,

  /**
   * Выравнивание модели относительно её bounds.
   * Важно: у Chel/Girl в glTF есть “control” меши (Circle/Cylinder), из-за чего bounds могут быть огромными.
   * Поэтому по умолчанию ничего не сдвигаем — как у Chel (он работает “как есть”).
   */
  align: {
    centerXZ: false,
    groundToY0: false
  },

  /** Доп. поворот по Y (градусы) после взятия поворота маркера (если нужно подровнять спавн). */
  spawnExtraYawDeg: -90,

  /**
   * Доп. yaw (градусы), который добавляется при lookAt/повороте к велосипедисту,
   * если "forward" у модели не совпадает с -Z.
   */
  faceYawOffsetDeg: 180,

  animations: {
    /** Дефолтная поза для каждой арматуры (базовый слой). */
    non: "non",
    stay: "stay",
    hello: "hello",
    love: "love",
    love2: "love2"
  },

  hello: {
    /** Дистанция, на которой девочка поворачивается к велосипедисту и делает Hello. */
    distance: 20.0,
    /** Повтор Hello через N секунд после конца клипа (если велосипедист всё ещё рядом). */
    repeatDelaySec: 2.0,
    /** Скорость поворота к велосипедисту (0..1 на тик). */
    faceSlerp01: 0.14,
    /** Скорость возврата к исходному повороту (0..1 на тик). */
    returnSlerp01: 0.16,
    /** Плавность переключения анимаций. */
    fadeSec: 0.15
  },

  goal: {
    /** Смещение цилиндра "напротив" девочки (вперёд по её изначальному forward). */
    offsetForward: 6.0,
    /** Радиус зоны достижения цели. */
    reachRadius: 2.6,

    /** Визуал цилиндра. */
    radius: 2.2,
    height: 0.18,
    y: 0.05,
    color: 0x18c1ff,
    opacity: 0.32
  },

  love: {
    fadeSec: 0.18
  },

  debug: {
    /** Визуально показывать цилиндры-цели. */
    showGoalCylinders: true,
    /** Показать оси в точке NPC (помогает понять: NPC заспавнился или нет). */
    showAxes: true,
    /** Показать bounds-box helper вокруг модели (если материалы не видны). */
    showBounds: true,
    /** Рисовать синее кольцо вокруг NPC, обозначающее `hello.distance`. */
    showHelloRadiusRing: true,
    helloRadiusRing: {
      thickness: 0.18,
      y: 0.04,
      color: 0x1f6fff,
      opacity: 0.55
    }
  }
} as const;

