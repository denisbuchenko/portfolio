import type { PieceGeometry } from "../../path";
import { createPuzzleModel } from "../../model";
import { createPieceImage } from "../../pieceImage";
import type { RuntimePiece } from "../runtimeTypes";
import { XorShift32 } from "../../rng";

/**
 * Конфиг масок по id пазла.
 *
 * Ключ: `pieceId` (0..rows*cols-1)
 * Значение:
 * - число 0..7: одна маска
 * - массив чисел 0..7: несколько масок
 *
 * Пример:
 * { 0: 0, 1: [1, 2, 4] }
 */
export const PIECE_MASKS_BY_ID: Record<number, number | number[]> = {
  0: [2],
  1: [6],
  2: [6],
  3: [1, 7],
  4: [2],
  5: [4, 2],
  6: [0, 2],
  7: [1, 3],
  8: [5, 1],
  9: [3, 6],
  10: [5],
  11: [7, 2],
  12: [0],
  13: [6, 5],
  14: [4],
  15: [3],
};

export type BuildPiecesResult = {
  geom: PieceGeometry;
  pieces: RuntimePiece[];
};

export function pickGeometry(viewW: number, viewH: number, dpr: number): PieceGeometry {
  const minCss = Math.min(viewW / dpr, viewH / dpr);
  const puzzleCss = Math.max(320, minCss * 0.72);
  const cellCss = puzzleCss / 4;
  const cellPx = Math.max(48, Math.floor(cellCss * dpr));
  const tabPx = cellPx * 0.22;
  const padPx = tabPx * 1.3;
  return { cellPx, tabPx, padPx };
}

export function scramblePieces(pieces: RuntimePiece[], rng: InstanceType<typeof XorShift32>, viewW: number, viewH: number, geom: PieceGeometry, dpr: number): void {
  const cell = geom.cellPx;
  const pad = geom.padPx;
  const ext = cell + pad * 2;
  const margin = Math.max(16 * dpr, pad);

  for (const p of pieces) {
    const xMin = margin;
    const xMax = Math.max(xMin, viewW - ext - margin);
    const yMin = margin;
    const yMax = Math.max(yMin, viewH - ext - margin);
    const drawX = rng.range(xMin, xMax);
    const drawY = rng.range(yMin, yMax);
    p.x = drawX + pad;
    p.y = drawY + pad;
  }
}

export async function buildPieces(opts: {
  rows: number;
  cols: number;
  img: HTMLImageElement;
  geom: PieceGeometry;
  seed: number;
}): Promise<RuntimePiece[]> {
  const { rows, cols, img, geom, seed } = opts;
  const model = createPuzzleModel({
    rows,
    cols,
    imgW: img.naturalWidth || img.width,
    imgH: img.naturalHeight || img.height,
    seed
  });

  const imgs = await Promise.all(model.pieces.map((piece) => createPieceImage({ model, piece, geom, source: img })));
  // 8 комбинаций фиксированы: 0..7. Детерминированно по id.
  return imgs.map((pi) => ({
    img: pi,
    id: pi.piece.id,
    groupId: pi.piece.id,
    // По умолчанию — одна маска (можно расширять на уровне группы через OR).
    // Можно переопределить через PIECE_MASKS_BY_ID.
    maskSet: maskSetFromConfig(pi.piece.id),
    x: 0,
    y: 0
  }));
}

function maskSetFromConfig(pieceId: number): number {
  const cfg = PIECE_MASKS_BY_ID[pieceId];
  if (cfg === undefined) return 1 << (pieceId % 8);

  const bits = Array.isArray(cfg) ? cfg : [cfg];
  let set = 0;
  for (const b of bits) {
    const bi = b | 0;
    if (bi < 0 || bi > 7) continue;
    set |= 1 << bi;
  }
  return set | 0;
}


