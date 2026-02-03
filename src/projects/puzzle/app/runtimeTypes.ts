import type * as THREE from "three";
import type { PieceImage } from "../pieceImage";

export type ColorKey = "r" | "g" | "b";

export type RuntimePiece = {
  img: PieceImage;
  id: number;
  groupId: number;
  /**
   * Набор масок, в которых этот пазл (точнее: его текущая группа) видим.
   *
   * Представление: битсет по значениям `maskBitsAt()` (0..7):
   * - bit 0 → виден там, где следа нет (mask = 0)
   * - bit N → виден в маске N
   */
  maskSet: number;
  mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>;
  /**
   * Позиция в мире в пикселях канваса: это top-left клетки (без pad).
   */
  x: number;
  y: number;
};

export type DragState = {
  pointerId: number;
  piece: RuntimePiece;
  groupId: number;
  offsetX: number;
  offsetY: number;
} | null;

export type DrawState = {
  pointerId: number;
  color: ColorKey;
} | null;

export type Trail = {
  points: Array<{ x: number; y: number }>;
  lengthPx: number;
};


