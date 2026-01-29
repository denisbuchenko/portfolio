export type ConnectorType = "flat" | "tab" | "blank";
export type EdgeSide = "top" | "right" | "bottom" | "left";

export type EdgeDef = {
  type: ConnectorType;
  /**
   * Идентификатор общей грани между двумя соседями.
   * Для внешних граней = null.
   */
  key: string | null;
  /**
   * Вариации формы (чтобы пазл не выглядел «одинаковым»).
   * 0..1
   */
  v0: number;
  v1: number;
};

export type PieceNeighbors = {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
};

export type Vec2 = { x: number; y: number };

export type PuzzlePieceModel = {
  id: number;
  row: number;
  col: number;
  neighbors: PieceNeighbors;
  edges: Record<EdgeSide, EdgeDef>;

  /**
   * Координаты верхнего правого угла "ячейки" кусочка в источнике (в пикселях).
   * (x = правая граница клетки, y = верхняя граница клетки)
   */
  cellTopRightSrcPx: Vec2;
};

export type PuzzleModel = {
  rows: number;
  cols: number;

  /**
   * Квадратный кроп исходной картинки, из которого строится пазл.
   * (в пикселях исходного изображения)
   */
  cropSrcPx: { x: number; y: number; size: number };

  pieces: PuzzlePieceModel[];
};


