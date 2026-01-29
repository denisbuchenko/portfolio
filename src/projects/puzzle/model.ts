import type { ConnectorType, EdgeDef, PuzzleModel, PuzzlePieceModel } from "./types";
import { XorShift32 } from "./rng";

function oppositeConnector(t: ConnectorType): ConnectorType {
  if (t === "tab") return "blank";
  if (t === "blank") return "tab";
  return "flat";
}

function randomInnerConnector(rng: XorShift32): ConnectorType {
  return rng.next01() < 0.5 ? "tab" : "blank";
}

function edgeDef(type: ConnectorType, key: string | null, rng: XorShift32): EdgeDef {
  return { type, key, v0: rng.next01(), v1: rng.next01() };
}

/**
 * Создаёт модель пазла rows×cols для исходной картинки imgW×imgH.
 * Пазл строится по квадратному кропу (центр, сторона = min(imgW,imgH)).
 */
export function createPuzzleModel(params: {
  rows: number;
  cols: number;
  imgW: number;
  imgH: number;
  seed?: number;
}): PuzzleModel {
  const { rows, cols, imgW, imgH } = params;
  const seed = params.seed ?? 0xdecafbad;
  const rng = new XorShift32(seed);

  const cropSize = Math.min(imgW, imgH);
  const cropX = Math.floor((imgW - cropSize) / 2);
  const cropY = Math.floor((imgH - cropSize) / 2);
  const cell = cropSize / cols; // rows==cols в нашем кейсе, но оставим так.

  const pieces: PuzzlePieceModel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      pieces.push({
        id,
        row: r,
        col: c,
        neighbors: {
          top: r > 0 ? (r - 1) * cols + c : null,
          right: c < cols - 1 ? r * cols + (c + 1) : null,
          bottom: r < rows - 1 ? (r + 1) * cols + c : null,
          left: c > 0 ? r * cols + (c - 1) : null
        },
        edges: {
          top: edgeDef("flat", null, rng),
          right: edgeDef("flat", null, rng),
          bottom: edgeDef("flat", null, rng),
          left: edgeDef("flat", null, rng)
        },
        cellTopRightSrcPx: {
          x: cropX + (c + 1) * cell,
          y: cropY + r * cell
        }
      });
    }
  }

  // Внутренние вертикальные грани (между (r,c) и (r,c+1)): right/left
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const aId = r * cols + c;
      const bId = r * cols + (c + 1);
      const key = `V:${r}:${c}`; // граница между c и c+1
      const t = randomInnerConnector(rng);
      pieces[aId].edges.right = edgeDef(t, key, rng);
      pieces[bId].edges.left = edgeDef(oppositeConnector(t), key, rng);
    }
  }

  // Внутренние горизонтальные грани (между (r,c) и (r+1,c)): bottom/top
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const aId = r * cols + c;
      const bId = (r + 1) * cols + c;
      const key = `H:${r}:${c}`; // граница между r и r+1
      const t = randomInnerConnector(rng);
      pieces[aId].edges.bottom = edgeDef(t, key, rng);
      pieces[bId].edges.top = edgeDef(oppositeConnector(t), key, rng);
    }
  }

  return {
    rows,
    cols,
    cropSrcPx: { x: cropX, y: cropY, size: cropSize },
    pieces
  };
}


