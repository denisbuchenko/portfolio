export type Mode = -1 | 0 | 1;

export const CONFIG = {
  particles: 1024, // 32x32 — >= 1000
  // Аттрактор (орбита вокруг пальца/мыши)
  influenceRadius: 2.2, // радиус, внутри которого частицы "захватываются" аттрактором
  captureRadius: 1.0, // радиус кольца/орбиты
  orbitOmega: 5.2, // угловая скорость (рад/сек)
  orbitStrength: 1.0 // целевая сила эффекта (сглаживается во времени в JS)
} as const;


