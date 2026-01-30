import type * as THREE from "three";
import type { PieceImage } from "../pieceImage";

export type ColorKey = "r" | "g" | "b";

export type RuntimePiece = {
  img: PieceImage;
  id: number;
  groupId: number;
  /**
   * Какой 3-bit цвет (0..7) должен показывать этот пазл.
   * 0 = (0,0,0) — виден там, где следа нет.
   */
  maskBits: number;
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


