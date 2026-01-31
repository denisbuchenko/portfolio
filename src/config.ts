export type Mode = -1 | 0 | 1 | 2 | 3;

export const CONFIG = {
  particles: 1024, // 32x32 — >= 1000

  // UI
  ui: {
    // Показывать кнопки режимов и статус (верхний HUD)
    showHud: false,
    // Показывать линию пути (Bezier/сплайн) поверх сцены
    showBezierLine: false
  },

  // Puzzle project
  puzzle: {
    paint: {
      // Ширина кисти в CSS-пикселях (на экране). Внутри умножается на DPR.
      brushSizeCssPx: 81,
      // Максимальная длина следа (каждый канал отдельно) в CSS-пикселях.
      maxTrailLengthCssPx: 1000
    },
    ui: {
      // Размер кружочков выбора цвета в CSS-пикселях.
      colorButtonCssPx: 36
    },
    background3d: {
      enabled: true,
      gltfUrl: "/3dmodels/3d_props_-_adorable_foods/scene.gltf",
      // Порог, после которого канал считается "включенным" (0..1) для получения bits.
      maskThreshold: 0.06,

      // Глобальные “усилители” пресетов:
      // - больше/меньше объектов
      // - больше/меньше размер
      // - больше/меньше беспорядка в стартовых позициях
      instanceMul: 8.0,
      sizeMul: 2.0,
      positionChaos: 0.3,

      camera: {
        fovDeg: 35,
        depthCssPx: 520
      },

      // Offscreen рендер пресетов (bits=1..7) в текстуры.
      // 1.0 = full-res (дороже), 0.5 = обычно выглядит почти так же, но быстрее.
      rtScale: 0.6,
      // 0 = каждый кадр, 30 = обновлять ~30fps (часто достаточно для фона).
      updateFps: 30,
      // Детерминизм выбора/раскладки фруктов
      seed: 0xdecafbad,

      // Свет (простая "мультяшная" Lambert-сцена)
      lighting: {
        ambientIntensity: 0.75,
        dirIntensity: 1.25,
        dirDirection: { x: -0.35, y: -0.65, z: 1.0 }
      },

      // Сколько фруктов (типов) показывать в каждом bits-слое (без повторов).
      // По умолчанию: 4+4+4+4+4+3+3 = 26 типов на 7 фонов.
      counts: { bits1to5: 4, bits6to7: 3 },

      // Общие параметры движения
      motion: {
        wrapMarginCssPx: 80,
        swayAmpCssPx: 18,
        swaySpeed: 0.8,
        spinSpeed: 0.6,
        axisSpinSpeed: 0.6
      },

      // Параметры по каждому bits=1..7 (фон, направление, скорость, размеры)
      layers: {
        1: { bg: "#00506f", dir: { x: 1.0, y: 0.25 }, speedCssPxPerSec: 80, sizeCssPx: { min: 90, max: 140 } },
        2: { bg: "#00a38c", dir: { x: 0.65, y: 0.95 }, speedCssPxPerSec: 95, sizeCssPx: { min: 80, max: 130 } },
        3: { bg: "#ffe400", dir: { x: -0.9, y: 0.35 }, speedCssPxPerSec: 75, sizeCssPx: { min: 85, max: 125 } },
        4: { bg: "#ff6a52", dir: { x: -0.55, y: -0.95 }, speedCssPxPerSec: 110, sizeCssPx: { min: 95, max: 150 } },
        5: { bg: "#ff9f2a", dir: { x: 0.15, y: -1.0 }, speedCssPxPerSec: 120, sizeCssPx: { min: 90, max: 150 } },
        6: { bg: "#5a4cff", dir: { x: 1.0, y: -0.35 }, speedCssPxPerSec: 90, sizeCssPx: { min: 85, max: 135 } },
        7: { bg: "#00d5ff", dir: { x: -0.35, y: 1.0 }, speedCssPxPerSec: 105, sizeCssPx: { min: 90, max: 140 } }
      }
    }
  },

  // Размер "головы" частицы в CSS-пикселях (визуально одинаковый на разных DPR).
  pointSizeCssPx: 4.0,

  // Скорость частиц в пикселях/сек (чтобы на разных размерах экрана движение выглядело одинаково).
  speedPxMin: 40.0,
  speedPxMax: 160.0,

  // Аттрактор (орбита вокруг пальца/мыши)
  influenceRadius: 2.2, // радиус, внутри которого частицы "захватываются" аттрактором
  captureRadius: 1.0, // радиус кольца/орбиты
  orbitOmega: 5, // угловая скорость (рад/сек)
  orbitStrength: 0.85, // целевая сила эффекта (сглаживается во времени в JS)

  // Сплайн (движение по кривой Безье)
  bezierJitterRadius: 0.25, // world units: 0 = строго по кривой
  bezierTimeScale: 0.08, // cycles/sec по параметру t кривой (не arc-length)
  bezierPhaseOffset: 0.0, // глобальный сдвиг фазы (для отладки/вариаций)

  // Следы (кометы): накопление предыдущих кадров в offscreen буфере
  trailPointSizeMul: 2.0, // толщина следа относительно точки
  trailHalfLife: 0.065, // секунды: в 2 раза длиннее хвост (больше = длиннее)
  trailStampAlpha: 0.2, // яркость "штампа" в trail-буфер (голова рисуется отдельно поверх)

  // Paint (рисование пальцем): "живое" пятно под частицами
  paintHalfLife: 0.85, // секунды: дольше = след держится дольше
  paintRadiusCssPx: 21, // размер кисти в CSS-пикселях (приблизительно "палец")
  paintSpacingCssPx: 10, // шаг штампов по траектории (меньше = ровнее линия)
  paintStampStrength: 0.4, // общая сила штампа
  paintNoiseScale: 50.0, // масштаб шума по краю
  paintEdgeAmp: 0.5, // амплитуда "рваного" края
  paintEdgeSoftness: 1.0, // мягкость перехода края
  paintGlowIntensity: 1.6, // свечение
  paintPulseSpeed: 2.2, // скорость пульса

  // Paint: "плавающая клякса" (доп. смещение/контур)
  paintWarpScale: 2.0, // масштаб поля смещения (больше = мельче детали)
  paintWarpSpeed: 0.85, // скорость "перетекания" поля
  paintWarpAmp: 0.1, // амплитуда UV-смещения (0..~0.06)
  paintContourThreshold: 0.08, // порог заливки (больше = тоньше след)
  paintContourWidth: 0.085, // ширина перехода контура (меньше = резче)
  paintContourNoiseAmp: 1.0, // насколько шум "рвёт" порог у края

  // Мини‑игра "прохождение сплайна" (Mode 3)
  traceGame: {
    // Дискретизация сплайна в "контрольные точки":
    spacingPx: 20, // шаг точек по пути (меньше = сложнее/точнее)

    // Старт:
    startRadiusPx: 60, // насколько близко нужно нажать к первой точке, чтобы стартовать
    startLabelHeightPx: 48, // высота надписи "start" (в CSS-пикселях)

    // Прогресс:
    reachRadiusPx: 140, // когда цель считается достигнутой и можно идти к следующей

    // Провал #1: "слишком далеко от текущей цели"
    // Если distToTarget > failRadiusPx → мгновенный провал.
    failRadiusPx: 220,

    // Провал #2: "отдалился от лучшего приближения"
    // bestDist = минимальная дистанция до текущей цели, которую ты уже достигал.
    // Если текущая dist > bestDist + failBacktrackPx → провал (анти‑чит/анти‑дребезг).
    failBacktrackPx: 200,

    // Опасность (для шейдеров): когда начинаем "краснеть" относительно failRadius.
    // 0.55 означает: краснеть начинаем после 55% от порога провала (в последние 45%).
    warnStartFrac: 0.4,

    // Чем ближе к 100% прохождения — тем больше "вес" режима Сплайн‑путь (uBezierActive).
    // Значение — с какого прогресса (0..1) начинаем заметно "перетекать" в сплайн.
    splineBlendStartFrac: 0.05,

    // Затухание "контура" (paint) после окончания прохождения:
    // - при провале/отпускании: базовая длительность
    // - при завершении: в 2 раза дольше (множитель)
    paintFadeOutSec: 0.65,
    paintFadeOutCompleteMul: 2.0
  }
} as const;


