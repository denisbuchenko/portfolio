import type { RuntimePiece } from "../runtimeTypes";

export function createGroupSystem(): GroupSystem {
    return new GroupSystem();
}

export class GroupSystem implements GroupSystem {
    public pieceById = new Map<number, RuntimePiece>();
    public groups = new Map<number, number[]>();

    public init(pieces: RuntimePiece[]): void {
      this.groups.clear();
      this.pieceById.clear();
      
      for (const piece of pieces) {
          this.pieceById.set(piece.id, piece);
          piece.groupId = piece.id;
          this.groups.set(piece.id, [piece.id]);
      }
    }

    public groupMembers(groupId: number): RuntimePiece[] {
      const pieceIds = this._getGroupPieceIds(groupId);
      if (!pieceIds) return [];
      
      const members: RuntimePiece[] = [];
      for (const id of pieceIds) {
          const piece = this._getPiece(id);
          if (piece) members.push(piece);
      }
      return members;
    }

    public moveGroup(groupId: number, dx: number, dy: number): void {
      const pieceIds = this._getGroupPieceIds(groupId);
      if (!pieceIds) return;
      
      for (const id of pieceIds) {
          const piece = this._getPiece(id);
          if (piece) {
            piece.x += dx;
            piece.y += dy;
          }
      }
    }

    public mergeGroups(targetGroupId: number, sourceGroupId: number): void {
      if (targetGroupId === sourceGroupId) return;
      
      const targetGroup = this._getGroupPieceIds(targetGroupId);
      const sourceGroup = this._getGroupPieceIds(sourceGroupId);
      if (!targetGroup || !sourceGroup) return;
      
      for (const pieceId of sourceGroup) {
          const piece = this._getPiece(pieceId);
          if (piece) piece.groupId = targetGroupId;
          targetGroup.push(pieceId);
      }
      
      this.groups.delete(sourceGroupId);
    }

    public bringGroupToFront(groupId: number, allPieces: RuntimePiece[]): RuntimePiece[] {
      const groupPieceIds = this._getGroupPieceIds(groupId);
      if (!groupPieceIds || groupPieceIds.length === 0) return allPieces;
      
      const groupSet = new Set(groupPieceIds);
      const otherPieces: RuntimePiece[] = [];
      const groupPieces: RuntimePiece[] = [];
      
      for (const piece of allPieces) {
          (groupSet.has(piece.id) ? groupPieces : otherPieces).push(piece);
      }
      
      return [...otherPieces, ...groupPieces];
    }

    private _getGroupPieceIds(groupId: number): number[] | null {
      return this.groups.get(groupId) ?? null;
    }

    private _getPiece(pieceId: number): RuntimePiece | null {
      return this.pieceById.get(pieceId) ?? null;
    }
}