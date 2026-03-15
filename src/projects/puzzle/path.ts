import type { EdgeDef, PuzzlePieceModel } from "./types";

export type PieceGeometry = {
  cellPx: number;
  tabPx: number;
  padPx: number;
};

// ── helpers ──────────────────────────────────────────────────────────

function _connectorSign(edge: EdgeDef): number {
  if (edge.type === "tab") return 1;
  if (edge.type === "blank") return -1;
  return 0;
}

function _clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ── connector profile (with slight per-edge variation) ──────────────

type _ConnectorProfile = {
  /** Half-width of the connector base on the edge (px) */
  baseHW: number;
  /** Half-width of the narrow neck (px) */
  neckHW: number;
  /** Half-width of the rounded head (px) */
  headHW: number;
  /** Total outward depth of the connector (px) */
  depth: number;
  /** Fraction of depth that is neck (0–1) */
  neckRatio: number;
  /** Fraction of depth for concave shoulder indent (0–1) */
  shoulderDip: number;
};

function _connectorProfile(edge: EdgeDef, cell: number, tab: number): _ConnectorProfile {
  const v0 = _clamp01(edge.v0);
  const v1 = _clamp01(edge.v1);

  return {
    baseHW:      cell * (0.190 + 0.010 * (v0 - 0.5)),
    neckHW:      cell * (0.085 + 0.008 * (v1 - 0.5)),
    headHW:      cell * (0.155 + 0.010 * (v0 - 0.5)),
    depth:       tab  * (0.90  + 0.15  * (v1 - 0.5)),
    neckRatio:   0.30 + 0.04 * (v0 - 0.5),
    shoulderDip: 0.06,
  };
}

// ── jigsaw connector shape (6 cubic Béziers) ────────────────────────
//
//  The shape is defined in a local coordinate system:
//    "along"  — pixels along the edge direction (−left, +right)
//    "perp"   — normalised perpendicular: 0 = edge, 1 = full depth outward
//
//  Transform functions (tx, ty) convert (along, perp) → (worldX, worldY).
//
//             ___________
//            /           \          ← head top   (perp ≈ 1.0)
//           /             \
//          |               |        ← head side  (perp ≈ 0.60)
//           \_           _/
//             |         |           ← neck       (perp ≈ 0.30)
//             |         |
//        _____|         |_____      ← shoulder   (perp ≈ −0.06 … 0)
//

function _addConnectorCurves(
  path: Path2D,
  tx: (along: number, perp: number) => number,
  ty: (along: number, perp: number) => number,
  pr: _ConnectorProfile,
): void {
  const { baseHW, neckHW, headHW, neckRatio: nH, shoulderDip: dip } = pr;
  const hH = 1 - nH; // head portion fraction

  const lt = (a: number, p: number) => path.lineTo(tx(a, p), ty(a, p));

  const ct = (
    a1: number, p1: number,
    a2: number, p2: number,
    a3: number, p3: number,
  ) =>
    path.bezierCurveTo(
      tx(a1, p1), ty(a1, p1),
      tx(a2, p2), ty(a2, p2),
      tx(a3, p3), ty(a3, p3),
    );

  // Approach connector on the edge
  lt(-baseHW, 0);

  // 1 — Left shoulder (concave indent) → narrow into neck
  ct(-baseHW, -dip, -neckHW, -dip, -neckHW, nH);

  // 2 — Left head underside: flare from narrow neck to wide head
  ct(
    -neckHW, nH + hH * 0.35,
    -headHW, nH + hH * 0.12,
    -headHW, nH + hH * 0.60,
  );

  // 3 — Top-left of head (rounded)
  ct(
    -headHW,       nH + hH * 0.95,
    -headHW * 0.5, 1.0,
     0,            1.0,
  );

  // 4 — Top-right of head (mirror of 3)
  ct(
    headHW * 0.5, 1.0,
    headHW,       nH + hH * 0.95,
    headHW,       nH + hH * 0.60,
  );

  // 5 — Right head underside (mirror of 2)
  ct(
    headHW,  nH + hH * 0.12,
    neckHW,  nH + hH * 0.35,
    neckHW,  nH,
  );

  // 6 — Right neck → right shoulder (mirror of 1)
  ct(neckHW, -dip, baseHW, -dip, baseHW, 0);
}

// ── edge builders ───────────────────────────────────────────────────

function _addHorizontalEdge(
  path: Path2D,
  x0: number, y: number, x1: number,
  edge: EdgeDef,
  outwardY: number,
  cell: number, tab: number,
): void {
  const s = _connectorSign(edge);
  if (s === 0) { path.lineTo(x1, y); return; }

  const pr  = _connectorProfile(edge, cell, tab);
  const mid = (x0 + x1) * 0.5;
  const dir = Math.sign(x1 - x0); // +1 left→right, −1 right→left
  const out = s * outwardY;

  _addConnectorCurves(
    path,
    (a, _p) => mid + a * dir,
    (_a, p) => y + p * pr.depth * out,
    pr,
  );

  path.lineTo(x1, y);
}

function _addVerticalEdge(
  path: Path2D,
  x: number, y0: number, y1: number,
  edge: EdgeDef,
  outwardX: number,
  cell: number, tab: number,
): void {
  const s = _connectorSign(edge);
  if (s === 0) { path.lineTo(x, y1); return; }

  const pr  = _connectorProfile(edge, cell, tab);
  const mid = (y0 + y1) * 0.5;
  const dir = Math.sign(y1 - y0); // +1 top→bottom, −1 bottom→top
  const out = s * outwardX;

  _addConnectorCurves(
    path,
    (_a, p) => x + p * pr.depth * out,
    (a, _p) => mid + a * dir,
    pr,
  );

  path.lineTo(x, y1);
}

// ── main export ─────────────────────────────────────────────────────

export function createPiecePath(piece: PuzzlePieceModel, geom: PieceGeometry): Path2D {
  const { cellPx: cell, padPx: pad, tabPx: tab } = geom;
  const x0 = pad;
  const y0 = pad;
  const x1 = pad + cell;
  const y1 = pad + cell;

  const p = new Path2D();
  p.moveTo(x0, y0);

  // Top: left → right, outward normal = −Y
  _addHorizontalEdge(p, x0, y0, x1, piece.edges.top, -1, cell, tab);

  // Right: top → bottom, outward normal = +X
  _addVerticalEdge(p, x1, y0, y1, piece.edges.right, +1, cell, tab);

  // Bottom: right → left, outward normal = +Y
  _addHorizontalEdge(p, x1, y1, x0, piece.edges.bottom, +1, cell, tab);

  // Left: bottom → top, outward normal = −X
  _addVerticalEdge(p, x0, y1, y0, piece.edges.left, -1, cell, tab);

  p.closePath();
  return p;
}
