import type { PieceGeometry } from "../../path";
import type { RuntimePiece } from "../runtimeTypes";
import type { GroupSystem } from "./groupSystem";

// --- Константы ---
const SNAP_THRESHOLD_BASE = 10;
const SNAP_THRESHOLD_RATIO = 0.12;

// --- Основная функция ---

export function snapThresholdPx(getDpr: () => number, geom: PieceGeometry): number {
    return calculateSnapThreshold(getDpr, geom.cellPx);
}

export function trySnapGroupOnce(opts: {
    groupId: number;
    geom: PieceGeometry;
    getDpr: () => number;
    groupSys: GroupSystem;
    pieces: RuntimePiece[];
}): { mergedInto: number; pieces: RuntimePiece[] } | null {
    const { groupId, geom, getDpr, groupSys, pieces } = opts;
    const snapThreshold = calculateSnapThreshold(getDpr, geom.cellPx);
    const neighborChecks = getNeighborOffsets(geom.cellPx);

    // Ищем лучшее совпадение для привязки
    let bestMatch: {
      score: number;
      offsetX: number;
      offsetY: number;
      targetGroupId: number;
    } | null = null;

    for (const piece of groupSys.groupMembers(groupId)) {
      const match = findBestSnapMatch(piece, groupSys, groupId, snapThreshold, neighborChecks);
      if (match && (!bestMatch || match.score < bestMatch.score)) {
        bestMatch = match;
      }
    }

    if (!bestMatch) return null;

    return applySnapAndMerge(
      groupSys,
      groupId,
      bestMatch.targetGroupId,
      bestMatch.offsetX,
      bestMatch.offsetY,
      pieces
    );
}

// --- Вспомогательные функции ---

function calculateSnapThreshold(getDpr: () => number, cellPx: number): number {
    const dprThreshold = SNAP_THRESHOLD_BASE * getDpr();
    const cellThreshold = cellPx * SNAP_THRESHOLD_RATIO;
    return Math.max(dprThreshold, cellThreshold);
}

function getNeighborOffsets(cellPx: number): Array<{
    neighborId: number | null;
    offsetX: number;
    offsetY: number;
}> {
    return [
      { neighborId: null, offsetX: 0, offsetY: -cellPx },   // top
      { neighborId: null, offsetX: +cellPx, offsetY: 0 },   // right
      { neighborId: null, offsetX: 0, offsetY: +cellPx },   // bottom
      { neighborId: null, offsetX: -cellPx, offsetY: 0 }       // left
    ];
}

function findBestSnapMatch(
    piece: RuntimePiece,
    groupSystem: GroupSystem,
    currentGroupId: number,
    snapThreshold: number,
    neighborOffsets: Array<{ neighborId: number | null; offsetX: number; offsetY: number }>
): {
    score: number;
    offsetX: number;
    offsetY: number;
    targetGroupId: number;
} | null {
    let bestMatch: { score: number; offsetX: number; offsetY: number; targetGroupId: number } | null = null;
    
    const neighbors = piece.img.piece.neighbors;
    neighborOffsets[0].neighborId = neighbors.top;
    neighborOffsets[1].neighborId = neighbors.right;
    neighborOffsets[2].neighborId = neighbors.bottom;
    neighborOffsets[3].neighborId = neighbors.left;

    for (const check of neighborOffsets) {
      if (check.neighborId == null) continue;
      
      const neighbor = groupSystem.pieceById.get(check.neighborId);
      if (!neighbor || neighbor.groupId === currentGroupId) continue;

      // Правило: группы могут соединяться только если у них есть хотя бы одна общая маска.
      // maskSet у кусочка — это maskSet его текущей группы.
      if (((piece.maskSet | 0) & (neighbor.maskSet | 0)) === 0) continue;
      
      const offsetX = neighbor.x - (piece.x + check.offsetX);
      const offsetY = neighbor.y - (piece.y + check.offsetY);
      
      if (Math.abs(offsetX) > snapThreshold || Math.abs(offsetY) > snapThreshold) continue;
      
      const score = Math.hypot(offsetX, offsetY);
      if (!bestMatch || score < bestMatch.score) {
          bestMatch = {
            score,
            offsetX,
            offsetY,
            targetGroupId: neighbor.groupId
          };
      }
    }

    return bestMatch;
}

function applySnapAndMerge(
    groupSystem: GroupSystem,
    sourceGroupId: number,
    targetGroupId: number,
    offsetX: number,
    offsetY: number,
    allPieces: RuntimePiece[]
): { mergedInto: number; pieces: RuntimePiece[] } {
    // Применяем смещение
    groupSystem.moveGroup(sourceGroupId, offsetX, offsetY);

    // Округляем координаты
    for (const piece of groupSystem.groupMembers(sourceGroupId)) {
      piece.x = Math.round(piece.x);
      piece.y = Math.round(piece.y);
    }

    // Объединяем группы
    groupSystem.mergeGroups(targetGroupId, sourceGroupId);

    // Перемещаем группу на передний план
    const reorderedPieces = groupSystem.bringGroupToFront(targetGroupId, allPieces);

    return { mergedInto: targetGroupId, pieces: reorderedPieces };
}
