import type { PieceGeometry } from "../../path";
import type { RuntimePiece } from "../runtimeTypes";
import type { GroupSystem } from "./groupSystem";

export function snapThresholdPx(getDpr: () => number, geom: PieceGeometry): number {
  return Math.max(10 * getDpr(), geom.cellPx * 0.12);
}

export function trySnapGroupOnce(opts: {
  groupId: number;
  geom: PieceGeometry;
  getDpr: () => number;
  groupSys: GroupSystem;
  pieces: RuntimePiece[];
}): { mergedInto: number; pieces: RuntimePiece[] } | null {
  const { groupId, geom, getDpr, groupSys } = opts;
  const cell = geom.cellPx;
  const thr = snapThresholdPx(getDpr, geom);

  let best:
    | {
        score: number;
        dx: number;
        dy: number;
        targetGroupId: number;
      }
    | undefined;

  const members = groupSys.groupMembers(groupId);
  for (const p of members) {
    const n = p.img.piece.neighbors;
    const neighborChecks: Array<{ neighborId: number | null; offX: number; offY: number }> = [
      { neighborId: n.top, offX: 0, offY: -cell },
      { neighborId: n.right, offX: +cell, offY: 0 },
      { neighborId: n.bottom, offX: 0, offY: +cell },
      { neighborId: n.left, offX: -cell, offY: 0 }
    ];

    for (const c of neighborChecks) {
      if (c.neighborId == null) continue;
      const neighborPiece = groupSys.pieceById.get(c.neighborId);
      if (!neighborPiece) continue;
      if (neighborPiece.groupId === groupId) continue;

      const dx = neighborPiece.x - (p.x + c.offX);
      const dy = neighborPiece.y - (p.y + c.offY);
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx > thr || ady > thr) continue;
      const score = Math.hypot(dx, dy);
      if (!best || score < best.score) {
        best = { score, dx, dy, targetGroupId: neighborPiece.groupId };
      }
    }
  }

  if (!best) return null;

  groupSys.moveGroup(groupId, best.dx, best.dy);
  for (const p of groupSys.groupMembers(groupId)) {
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }
  groupSys.mergeGroups(best.targetGroupId, groupId);
  const pieces2 = groupSys.bringGroupToFront(best.targetGroupId, opts.pieces);
  return { mergedInto: best.targetGroupId, pieces: pieces2 };
}


