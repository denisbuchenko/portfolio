import type { EdgeDef, PuzzlePieceModel } from "./types";

export type PieceGeometry = {
  cellPx: number;
  tabPx: number;
  padPx: number;
};

function connectorSign(edge: EdgeDef): number {
  if (edge.type === "tab") return 1;
  if (edge.type === "blank") return -1;
  return 0;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function edgeProfile(edge: EdgeDef, cell: number, tab: number) {
  // ширина "шляпки" и глубина — слегка варьируем
  const w = cell * (0.46 + 0.10 * (clamp01(edge.v0) - 0.5)); // ~0.41..0.51
  const depth = tab * (0.9 + 0.25 * (clamp01(edge.v1) - 0.5)); // ~0.84..0.96
  const neck = w * 0.22;
  return { w, depth, neck };
}

function addHorizontalEdge(params: {
  path: Path2D;
  x0: number;
  y: number;
  x1: number;
  edge: EdgeDef;
  outwardNormalY: number; // top: -1, bottom: +1
  cell: number;
  tab: number;
}): void {
  const { path, x0, y, x1, edge, outwardNormalY, cell, tab } = params;
  const s = connectorSign(edge);
  const { w, depth, neck } = edgeProfile(edge, cell, tab);
  const mid = (x0 + x1) * 0.5;
  const a = mid - w * 0.5;
  const b = mid + w * 0.5;

  path.lineTo(a, y);
  if (s !== 0) {
    const out = s * outwardNormalY * depth;
    const peakX = mid;
    const peakY = y + out;
    path.bezierCurveTo(a + neck, y, peakX - neck, peakY, peakX, peakY);
    path.bezierCurveTo(peakX + neck, peakY, b - neck, y, b, y);
  }
  path.lineTo(x1, y);
}

function addVerticalEdge(params: {
  path: Path2D;
  x: number;
  y0: number;
  y1: number;
  edge: EdgeDef;
  outwardNormalX: number; // left: -1, right: +1
  cell: number;
  tab: number;
}): void {
  const { path, x, y0, y1, edge, outwardNormalX, cell, tab } = params;
  const s = connectorSign(edge);
  const { w, depth, neck } = edgeProfile(edge, cell, tab);
  const mid = (y0 + y1) * 0.5;
  const a = mid - w * 0.5;
  const b = mid + w * 0.5;

  path.lineTo(x, a);
  if (s !== 0) {
    const out = s * outwardNormalX * depth;
    const peakX = x + out;
    const peakY = mid;
    path.bezierCurveTo(x, a + neck, peakX, peakY - neck, peakX, peakY);
    path.bezierCurveTo(peakX, peakY + neck, x, b - neck, x, b);
  }
  path.lineTo(x, y1);
}

export function createPiecePath(piece: PuzzlePieceModel, geom: PieceGeometry): Path2D {
  const { cellPx: cell, padPx: pad, tabPx: tab } = geom;
  const x0 = pad;
  const y0 = pad;
  const x1 = pad + cell;
  const y1 = pad + cell;

  const p = new Path2D();
  p.moveTo(x0, y0);

  // top: left -> right, outward normal = -Y
  addHorizontalEdge({
    path: p,
    x0,
    y: y0,
    x1,
    edge: piece.edges.top,
    outwardNormalY: -1,
    cell,
    tab
  });

  // right: top -> bottom, outward normal = +X
  addVerticalEdge({
    path: p,
    x: x1,
    y0,
    y1,
    edge: piece.edges.right,
    outwardNormalX: +1,
    cell,
    tab
  });

  // bottom: right -> left, outward normal = +Y
  // идём назад по X, поэтому разворачиваем параметризацию: строим от x1 к x0 через перевёрнутую Path2D нельзя,
  // но можно просто вести линию в обратную сторону — bezier по сути симметричен.
  // Чтобы не дублировать код, «притворимся» что идём слева направо, но используем локальную систему: зеркалим по X.
  // Проще: добавим сегменты вручную.
  {
    const s = connectorSign(piece.edges.bottom);
    const { w, depth, neck } = edgeProfile(piece.edges.bottom, cell, tab);
    const mid = (x0 + x1) * 0.5;
    const a = mid + w * 0.5; // при движении справа налево "a" ближе к правой части
    const b = mid - w * 0.5;
    p.lineTo(a, y1);
    if (s !== 0) {
      const out = s * +1 * depth; // outward +Y
      const peakX = mid;
      const peakY = y1 + out;
      p.bezierCurveTo(a - neck, y1, peakX + neck, peakY, peakX, peakY);
      p.bezierCurveTo(peakX - neck, peakY, b + neck, y1, b, y1);
    }
    p.lineTo(x0, y1);
  }

  // left: bottom -> top, outward normal = -X
  {
    const s = connectorSign(piece.edges.left);
    const { w, depth, neck } = edgeProfile(piece.edges.left, cell, tab);
    const mid = (y0 + y1) * 0.5;
    const a = mid + w * 0.5;
    const b = mid - w * 0.5;
    p.lineTo(x0, a);
    if (s !== 0) {
      const out = s * -1 * depth; // outward -X
      const peakX = x0 + out;
      const peakY = mid;
      p.bezierCurveTo(x0, a - neck, peakX, peakY + neck, peakX, peakY);
      p.bezierCurveTo(peakX, peakY - neck, x0, b + neck, x0, b);
    }
    p.lineTo(x0, y0);
  }

  p.closePath();
  return p;
}


