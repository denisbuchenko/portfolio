import type { RuntimePiece } from "../runtimeTypes";

export type GroupSystem = {
  pieceById: Map<number, RuntimePiece>;
  groups: Map<number, number[]>;
  init(pieces: RuntimePiece[]): void;
  groupMembers(groupId: number): RuntimePiece[];
  moveGroup(groupId: number, dx: number, dy: number): void;
  mergeGroups(intoGroupId: number, fromGroupId: number): void;
  bringGroupToFront(groupId: number, pieces: RuntimePiece[]): RuntimePiece[];
};

// Внешние функции с явной инъекцией зависимостей
function initGroupSystem(
  pieceById: Map<number, RuntimePiece>,
  groups: Map<number, number[]>,
  pieces: RuntimePiece[]
): void {
  groups.clear();
  pieceById.clear();
  
  for (const piece of pieces) {
    pieceById.set(piece.id, piece);
    piece.groupId = piece.id;
    groups.set(piece.id, [piece.id]);
  }
}

function getGroupMembers(
  pieceById: Map<number, RuntimePiece>,
  groups: Map<number, number[]>,
  groupId: number
): RuntimePiece[] {
  const pieceIds = groups.get(groupId);
  if (!pieceIds) return [];
  
  const members: RuntimePiece[] = [];
  for (const id of pieceIds) {
    const piece = pieceById.get(id);
    if (piece) members.push(piece);
  }
  return members;
}

function moveGroupPieces(
  pieceById: Map<number, RuntimePiece>,
  groups: Map<number, number[]>,
  groupId: number,
  dx: number,
  dy: number
): void {
  const pieceIds = groups.get(groupId);
  if (!pieceIds) return;
  
  for (const id of pieceIds) {
    const piece = pieceById.get(id);
    if (piece) {
      piece.x += dx;
      piece.y += dy;
    }
  }
}

function mergeGroupsWithinSystem(
  groups: Map<number, number[]>,
  pieceById: Map<number, RuntimePiece>,
  targetGroupId: number,
  sourceGroupId: number
): void {
  if (targetGroupId === sourceGroupId) return;
  
  const targetGroup = groups.get(targetGroupId);
  const sourceGroup = groups.get(sourceGroupId);
  if (!targetGroup || !sourceGroup) return;
  
  for (const pieceId of sourceGroup) {
    const piece = pieceById.get(pieceId);
    if (piece) piece.groupId = targetGroupId;
    targetGroup.push(pieceId);
  }
  
  groups.delete(sourceGroupId);
}

function reorderPiecesWithGroupToFront(
  groups: Map<number, number[]>,
  groupId: number,
  allPieces: RuntimePiece[]
): RuntimePiece[] {
  const groupPieceIds = groups.get(groupId);
  if (!groupPieceIds || groupPieceIds.length === 0) return allPieces;
  
  const groupSet = new Set(groupPieceIds);
  const otherPieces: RuntimePiece[] = [];
  const groupPieces: RuntimePiece[] = [];
  
  for (const piece of allPieces) {
    (groupSet.has(piece.id) ? groupPieces : otherPieces).push(piece);
  }
  
  return [...otherPieces, ...groupPieces];
}

// Фабрика с инъекцией зависимостей в методы
export function createGroupSystem(): GroupSystem {
  const pieceById = new Map<number, RuntimePiece>();
  const groups = new Map<number, number[]>();
  
  return {
    pieceById,
    groups,
    init: (pieces) => initGroupSystem(pieceById, groups, pieces),
    groupMembers: (groupId) => getGroupMembers(pieceById, groups, groupId),
    moveGroup: (groupId, dx, dy) => moveGroupPieces(pieceById, groups, groupId, dx, dy),
    mergeGroups: (into, from) => mergeGroupsWithinSystem(groups, pieceById, into, from),
    bringGroupToFront: (groupId, pieces) => reorderPiecesWithGroupToFront(groups, groupId, pieces)
  };
}