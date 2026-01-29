import type { PuzzleModel, PuzzlePieceModel } from "./types";
import type { PieceGeometry } from "./path";
import { createPiecePath } from "./path";

export type PieceImage = {
  piece: PuzzlePieceModel;
  geom: PieceGeometry;
  /**
   * Растр кусочка (вместе с pad’ом для выемок/выпуклостей).
   * Важно: координаты кусочка в мире будут задаваться по «клетке» (без pad),
   * поэтому рисовать bitmap нужно с вычитанием pad.
   */
  bitmap: ImageBitmap;
  /**
   * Контур кусочка в локальных координатах bitmap’а.
   * (top-left bitmap = 0,0)
   */
  path: Path2D;
};

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export async function createPieceImage(params: {
  model: PuzzleModel;
  piece: PuzzlePieceModel;
  geom: PieceGeometry;
  source: HTMLImageElement;
}): Promise<PieceImage> {
  const { model, piece, geom, source } = params;

  const path = createPiecePath(piece, geom);
  const outW = Math.ceil(geom.cellPx + geom.padPx * 2);
  const outH = outW;
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");

  // Маска
  ctx.save();
  ctx.clip(path);

  // Рисуем исходную картинку в координатах «кропа» -> канвас кусочка.
  // source crop (square) маппим в (0..rows*cellPx) на уровне пазла.
  const srcCrop = model.cropSrcPx;
  const srcCell = srcCrop.size / model.cols;
  const srcX0 = srcCrop.x + piece.col * srcCell;
  const srcY0 = srcCrop.y + piece.row * srcCell;

  // Трансформация: (srcX0,srcY0) -> (pad,pad)
  // Масштаб src->out: srcCell -> geom.cellPx
  const scale = geom.cellPx / srcCell;
  ctx.setTransform(scale, 0, 0, scale, -srcX0 * scale + geom.padPx, -srcY0 * scale + geom.padPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0);

  ctx.restore();

  // Лёгкая обводка, чтобы кусочки читались.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = Math.max(1, Math.round(geom.cellPx * 0.02));
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke(path);
  ctx.restore();

  const bitmap = await createImageBitmap(canvas);
  return { piece, geom, bitmap, path };
}


