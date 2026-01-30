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

export function createGroupSystem(): GroupSystem {
  const pieceById = new Map<number, RuntimePiece>();
  const groups = new Map<number, number[]>();

  function init(pieces: RuntimePiece[]): void {
    groups.clear();
    pieceById.clear();
    for (const p of pieces) {
      pieceById.set(p.id, p);
      p.groupId = p.id;
      groups.set(p.groupId, [p.id]);
    }
  }

  function groupMembers(groupId: number): RuntimePiece[] {
    const ids = groups.get(groupId);
    if (!ids) return [];
    const out: RuntimePiece[] = [];
    for (const id of ids) {
      const p = pieceById.get(id);
      if (p) out.push(p);
    }
    return out;
  }

  function moveGroup(groupId: number, dx: number, dy: number): void {
    const ids = groups.get(groupId);
    if (!ids) return;
    for (const id of ids) {
      const p = pieceById.get(id);
      if (!p) continue;
      p.x += dx;
      p.y += dy;
    }
  }

  function mergeGroups(intoGroupId: number, fromGroupId: number): void {
    if (intoGroupId === fromGroupId) return;
    const a = groups.get(intoGroupId);
    const b = groups.get(fromGroupId);
    if (!a || !b) return;
    for (const id of b) {
      const p = pieceById.get(id);
      if (p) p.groupId = intoGroupId;
      a.push(id);
    }
    groups.delete(fromGroupId);
  }

  function bringGroupToFront(groupId: number, pieces: RuntimePiece[]): RuntimePiece[] {
    const groupIds = new Set(groups.get(groupId) ?? []);
    if (groupIds.size === 0) return pieces;
    const back: RuntimePiece[] = [];
    const front: RuntimePiece[] = [];
    for (const p of pieces) {
      if (groupIds.has(p.id)) front.push(p);
      else back.push(p);
    }
    return back.concat(front);
  }

  return { pieceById, groups, init, groupMembers, moveGroup, mergeGroups, bringGroupToFront };
}


