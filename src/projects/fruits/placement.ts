import type { FruitLayerBits } from "./types";
import { rand01 } from "./utils";

/**
 * Логика размещения объектов на экране без пересечений.
 * Использует spatial hash для быстрой проверки коллизий.
 */

/**
 * Размещённый круг (для проверки пересечений).
 */
type PlacedCircle = { x: number; y: number; r: number };

/**
 * Состояние размещения для одного bits-слоя.
 * Содержит сетку клеток, spatial hash и список уже размещённых объектов.
 */
export type PlacementState = {
  w: number;
  h: number;
  margin: number;
  cellW: number;
  cellH: number;
  cells: Array<{ x: number; y: number }>;
  cursor: number;
  hashCellSize: number;
  placed: PlacedCircle[];
  grid: Map<string, number[]>;
};

/**
 * Создаёт или возвращает существующее состояние размещения для bits-слоя.
 * Состояние кэшируется пока не изменятся размеры экрана или margin.
 */
/**
 * Кэш состояний размещения (чтобы не пересоздавать при каждом update).
 */
const placementCache = new Map<string, PlacementState>();

export function getPlacementState(
  bits: FruitLayerBits,
  instanceCount: number,
  maxSizePx: number,
  w: number,
  h: number,
  margin: number,
  dpr: number,
  seed: number
): PlacementState {
  // Проверяем кэш
  const cacheKey = `${bits}_${w}_${h}_${margin.toFixed(2)}`;
  const cached = placementCache.get(cacheKey);
  if (cached) return cached;
  const n = Math.max(1, instanceCount | 0);
  const aspect = w / Math.max(1, h);

  // Вычисляем размер сетки клеток
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = (w + 2 * margin) / cols;
  const cellH = (h + 2 * margin) / rows;

  // Создаём сетку клеток
  const cells: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: -margin + (c + 0.5) * cellW, y: -margin + (r + 0.5) * cellH });
    }
  }

  // Детерминированно перемешиваем клетки — убирает "равномерную матрицу"
  let s = (seed + bits * 1337) | 0;
  for (let i = cells.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) | 0;
    const j = ((s >>> 0) % (i + 1)) | 0;
    const tmp = cells[i];
    cells[i] = cells[j];
    cells[j] = tmp;
  }

  // Spatial hash: размер клетки примерно под max size для быстрой проверки коллизий
  const hashCellSize = Math.max(12 * dpr, maxSizePx * 0.9 + 8 * dpr);

  const state: PlacementState = {
    w,
    h,
    margin,
    cellW,
    cellH,
    cells,
    cursor: 0,
    hashCellSize,
    placed: [],
    grid: new Map()
  };

  placementCache.set(cacheKey, state);
  return state;
}

/**
 * Очищает кэш состояний размещения (вызывать при resize).
 */
export function clearPlacementCache(): void {
  placementCache.clear();
}

/**
 * Пытается разместить объект в свободном месте без пересечений.
 * Использует spatial hash для быстрой проверки коллизий с уже размещёнными объектами.
 *
 * @param st - Состояние размещения
 * @param seed - Seed для детерминированного jitter
 * @param r - Радиус объекта
 * @param chaos - Коэффициент беспорядочности (0..1)
 * @returns Позиция {x, y} или fallback на центр следующей клетки
 */
export function tryPlace(st: PlacementState, seed: number, r: number, chaos: number): { x: number; y: number } {
  const pad = 6; // Отступ между объектами
  const tries = 22; // Максимум попыток

  for (let attempt = 0; attempt < tries; attempt++) {
    const cell = st.cells[st.cursor % st.cells.length];
    st.cursor++;

    // Jitter: широкий, но ограниченный — выглядит "непредсказуемо"
    const jitterFrac = 0.15 + 0.8 * chaos; // 0.15..0.95
    const jx = (rand01(seed + 17 * attempt + 1) - 0.5) * st.cellW * jitterFrac;
    const jy = (rand01(seed + 17 * attempt + 2) - 0.5) * st.cellH * jitterFrac;
    const x = cell.x + jx;
    const y = cell.y + jy;

    // Проверка границ
    if (x < -st.margin - r || x > st.w + st.margin + r) continue;
    if (y < -st.margin - r || y > st.h + st.margin + r) continue;

    // Spatial hash: проверяем коллизии с соседними клетками
    const cs = st.hashCellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);

    let ok = true;
    for (let oy = -1; oy <= 1 && ok; oy++) {
      for (let ox = -1; ox <= 1 && ok; ox++) {
        const key = `${cx + ox},${cy + oy}`;
        const ids = st.grid.get(key);
        if (!ids) continue;

        for (const id of ids) {
          const p = st.placed[id];
          const dx = x - p.x;
          const dy = y - p.y;
          const rr = r + p.r + pad;
          if (dx * dx + dy * dy < rr * rr) {
            ok = false;
            break;
          }
        }
      }
    }

    if (!ok) continue;

    // Размещаем объект
    const id = st.placed.length;
    st.placed.push({ x, y, r });
    const key = `${cx},${cy}`;
    const arr = st.grid.get(key);
    if (arr) arr.push(id);
    else st.grid.set(key, [id]);

    return { x, y };
  }

  // Fallback: если не нашли — кладём в центр следующей клетки
  const cell = st.cells[st.cursor % st.cells.length];
  st.cursor++;
  return { x: cell.x, y: cell.y };
}
