import type { RuntimePiece } from "../runtimeTypes";

const GROUP_MAX_HIDDEN_RATIO = 0.6;
const GROUP_MIN_VISIBLE_RATIO = 1 - GROUP_MAX_HIDDEN_RATIO;

export function createGroupSystem(): GroupSystem {
    return new GroupSystem();
}

export class GroupSystem implements GroupSystem {
    public pieceById = new Map<number, RuntimePiece>();
    public groups = new Map<number, number[]>();
    /** Битсет видимых масок (см. RuntimePiece.maskSet) для каждой группы. */
    public groupMaskSet = new Map<number, number>();

    public init(pieces: RuntimePiece[]): void {
      this.groups.clear();
      this.pieceById.clear();
      this.groupMaskSet.clear();
      
      for (const piece of pieces) {
          this.pieceById.set(piece.id, piece);
          piece.groupId = piece.id;
          this.groups.set(piece.id, [piece.id]);
          this.groupMaskSet.set(piece.id, piece.maskSet | 0);
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

    public moveGroupWithinVisibility(groupId: number, dx: number, dy: number, viewW: number, viewH: number): void {
      const bounds = this._getGroupBounds(groupId);
      if (!bounds) return;

      const allowedDx = this._clampAxisDelta(
        dx,
        bounds.minX,
        bounds.maxX,
        Math.max(1, viewW)
      );
      const allowedDy = this._clampAxisDelta(
        dy,
        bounds.minY,
        bounds.maxY,
        Math.max(1, viewH)
      );

      if (allowedDx === 0 && allowedDy === 0) return;
      this.moveGroup(groupId, allowedDx, allowedDy);
    }

    public mergeGroups(targetGroupId: number, sourceGroupId: number): void {
      if (targetGroupId === sourceGroupId) return;
      
      const targetGroup = this._getGroupPieceIds(targetGroupId);
      const sourceGroup = this._getGroupPieceIds(sourceGroupId);
      if (!targetGroup || !sourceGroup) return;

      const targetMask = this.groupMaskSet.get(targetGroupId) ?? 0;
      const sourceMask = this.groupMaskSet.get(sourceGroupId) ?? 0;
      const mergedMask = (targetMask | sourceMask) | 0;
      
      for (const pieceId of sourceGroup) {
          const piece = this._getPiece(pieceId);
          if (piece) piece.groupId = targetGroupId;
          targetGroup.push(pieceId);
      }
      
      this.groups.delete(sourceGroupId);
      this.groupMaskSet.delete(sourceGroupId);

      this.groupMaskSet.set(targetGroupId, mergedMask);
      // Синхронизируем maskSet у всех кусочков группы (группа — источник истины).
      for (const pieceId of targetGroup) {
        const piece = this._getPiece(pieceId);
        if (piece) piece.maskSet = mergedMask;
      }
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

    private _getGroupBounds(groupId: number): { minX: number; maxX: number; minY: number; maxY: number } | null {
      const pieceIds = this._getGroupPieceIds(groupId);
      if (!pieceIds || pieceIds.length === 0) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const pieceId of pieceIds) {
        const piece = this._getPiece(pieceId);
        if (!piece) continue;

        const pad = piece.img.geom.padPx;
        const left = piece.x - pad;
        const top = piece.y - pad;
        const right = left + piece.img.bitmap.width;
        const bottom = top + piece.img.bitmap.height;

        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
      }

      return { minX, maxX, minY, maxY };
    }

    private _clampAxisDelta(delta: number, minEdge: number, maxEdge: number, viewportSize: number): number {
      if (delta === 0) return 0;

      const groupSize = Math.max(1, maxEdge - minEdge);
      const minVisibleSize = Math.min(viewportSize, groupSize * GROUP_MIN_VISIBLE_RATIO);
      const minDelta = minVisibleSize - maxEdge;
      const maxDelta = viewportSize - minVisibleSize - minEdge;

      return Math.max(minDelta, Math.min(maxDelta, delta));
    }
}