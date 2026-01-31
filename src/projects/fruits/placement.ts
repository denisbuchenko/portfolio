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
 * Создаёт состояние размещения для bits-слоя.
 * Состояние должно кэшироваться в RendererState.placementByBits.
 */
export function createPlacementState(
  bits: FruitLayerBits,
  instanceCount: number,
  maxSizePx: number,
  w: number,
  h: number,
  margin: number,
  dpr: number,
  seed: number
): PlacementState {
  const n = Math.max(1, instanceCount | 0);
  const aspect = w / Math.max(1, h);

  // Вычисляем размер сетки клеток
  const { cols, rows, cellW, cellH } = _calculateGridSize(n, aspect, w, h, margin);

  // Создаём и перемешиваем сетку клеток
  const cells = _createAndShuffleGrid(cols, rows, cellW, cellH, margin, seed, bits);

  // Вычисляем размер клетки для spatial hash
  const hashCellSize = _calculateHashCellSize(maxSizePx, dpr);

  return {
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
}

/**
 * Пытается разместить объект в свободном месте без пересечений.
 * Использует spatial hash для быстрой проверки коллизий.
 */
export function tryPlaceObject(
  state: PlacementState,
  seed: number,
  radius: number,
  chaos: number
): { x: number; y: number } {
  const MAX_TRIES = 22;
  const PADDING = 6; // Отступ между объектами

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const cell = _getNextCell(state);
    const position = _applyJitter(cell, state, seed, attempt, chaos);

    // Проверка границ
    if (!_isWithinBounds(position, state, radius)) continue;

    // Проверка коллизий через spatial hash
    if (!_checkCollisions(position, radius, state, PADDING)) continue;

    // Размещаем объект
    _addToGrid(position, radius, state);
    return position;
  }

  // Fallback: если не нашли — кладём в центр следующей клетки
  return _getNextCell(state);
}

/**
 * Вычисляет размер сетки клеток на основе количества инстансов и аспекта экрана.
 */
function _calculateGridSize(
  instanceCount: number,
  aspect: number,
  w: number,
  h: number,
  margin: number
): { cols: number; rows: number; cellW: number; cellH: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(instanceCount * aspect)));
  const rows = Math.max(1, Math.ceil(instanceCount / cols));
  const cellW = (w + 2 * margin) / cols;
  const cellH = (h + 2 * margin) / rows;

  return { cols, rows, cellW, cellH };
}

/**
 * Создаёт сетку клеток и детерминированно перемешивает её.
 * Это убирает "равномерную матрицу" и делает размещение более естественным.
 */
function _createAndShuffleGrid(
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  margin: number,
  seed: number,
  bits: FruitLayerBits
): Array<{ x: number; y: number }> {
  // Создаём сетку клеток
  const cells: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: -margin + (c + 0.5) * cellW,
        y: -margin + (r + 0.5) * cellH
      });
    }
  }

  // Детерминированно перемешиваем (Fisher-Yates с LCG)
  let s = (seed + bits * 1337) | 0;
  for (let i = cells.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) | 0; // LCG
    const j = ((s >>> 0) % (i + 1)) | 0;
    const tmp = cells[i];
    cells[i] = cells[j];
    cells[j] = tmp;
  }

  return cells;
}

/**
 * Вычисляет размер клетки для spatial hash.
 * Размер примерно под max size для быстрой проверки коллизий.
 */
function _calculateHashCellSize(maxSizePx: number, dpr: number): number {
  return Math.max(12 * dpr, maxSizePx * 0.9 + 8 * dpr);
}

/**
 * Получает следующую клетку из сетки (с зацикливанием).
 */
function _getNextCell(state: PlacementState): { x: number; y: number } {
  const cell = state.cells[state.cursor % state.cells.length];
  state.cursor++;
  return cell;
}

/**
 * Применяет jitter (случайное смещение) к позиции клетки.
 * Jitter широкий, но ограниченный — выглядит "непредсказуемо".
 */
function _applyJitter(
  cell: { x: number; y: number },
  state: PlacementState,
  seed: number,
  attempt: number,
  chaos: number
): { x: number; y: number } {
  const jitterFrac = 0.15 + 0.8 * chaos; // 0.15..0.95
  const jx = (rand01(seed + 17 * attempt + 1) - 0.5) * state.cellW * jitterFrac;
  const jy = (rand01(seed + 17 * attempt + 2) - 0.5) * state.cellH * jitterFrac;

  return {
    x: cell.x + jx,
    y: cell.y + jy
  };
}

/**
 * Проверяет, находится ли позиция в пределах границ экрана с учётом margin.
 */
function _isWithinBounds(
  position: { x: number; y: number },
  state: PlacementState,
  radius: number
): boolean {
  const { x, y } = position;
  const { w, h, margin } = state;

  if (x < -margin - radius || x > w + margin + radius) return false;
  if (y < -margin - radius || y > h + margin + radius) return false;

  return true;
}

/**
 * Проверяет коллизии с уже размещёнными объектами через spatial hash.
 * Проверяет только соседние клетки (O(1) вместо O(n)).
 */
function _checkCollisions(
  position: { x: number; y: number },
  radius: number,
  state: PlacementState,
  padding: number
): boolean {
  const { x, y } = position;
  const cs = state.hashCellSize;
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);

  // Проверяем соседние клетки (3x3 область)
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const key = `${cx + ox},${cy + oy}`;
      const ids = state.grid.get(key);
      if (!ids) continue;

      // Проверяем коллизии с объектами в этой клетке
      for (const id of ids) {
        const placed = state.placed[id];
        const dx = x - placed.x;
        const dy = y - placed.y;
        const minDist = radius + placed.r + padding;

        if (dx * dx + dy * dy < minDist * minDist) {
          return false; // Коллизия найдена
        }
      }
    }
  }

  return true; // Коллизий нет
}

/**
 * Добавляет размещённый объект в spatial hash и список размещённых.
 */
function _addToGrid(
  position: { x: number; y: number },
  radius: number,
  state: PlacementState
): void {
  const { x, y } = position;
  const cs = state.hashCellSize;
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);

  // Добавляем в список размещённых
  const id = state.placed.length;
  state.placed.push({ x, y, r: radius });

  // Добавляем в spatial hash
  const key = `${cx},${cy}`;
  const arr = state.grid.get(key);
  if (arr) {
    arr.push(id);
  } else {
    state.grid.set(key, [id]);
  }
}

