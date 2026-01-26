import * as THREE from "three";
import { assert } from "../utils/assert";

export type SvgSample = {
  pointsSvg: THREE.Vector2[]; // raw SVG coordinates (y-down)
  viewBox: { x: number; y: number; w: number; h: number };
};

export async function loadSvgPathSamples(opts: { url: string; samples: number; pathSelector?: string }): Promise<SvgSample> {
  const res = await fetch(opts.url);
  assert(res.ok, `Не удалось загрузить SVG: ${opts.url} (${res.status})`);
  const svgText = await res.text();

  // Create a hidden container so SVGPathElement APIs (getTotalLength/getPointAtLength) work reliably.
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "hidden";
  host.style.pointerEvents = "none";
  host.style.visibility = "hidden";
  host.innerHTML = svgText;
  document.body.appendChild(host);

  try {
    const svg = host.querySelector("svg") as SVGSVGElement | null;
    assert(svg, "SVG: не найден <svg>");

    const selector = opts.pathSelector ?? "path";
    const path = host.querySelector(selector) as SVGPathElement | null;
    assert(path, `SVG: не найден элемент по селектору "${selector}"`);

    const vb = svg.viewBox?.baseVal;
    const viewBox = vb
      ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height }
      : { x: 0, y: 0, w: svg.width.baseVal.value || 100, h: svg.height.baseVal.value || 100 };

    const n = Math.max(2, Math.floor(opts.samples));
    const total = Math.max(1e-6, path.getTotalLength());
    const pointsSvg: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1)) * total;
      const pt = path.getPointAtLength(s);
      pointsSvg.push(new THREE.Vector2(pt.x, pt.y));
    }

    return { pointsSvg, viewBox };
  } finally {
    host.remove();
  }
}

export function mapSvgPointsToWorld(opts: {
  pointsSvg: THREE.Vector2[];
  targetHalfBounds: THREE.Vector2; // world half-bounds
  fit: number; // 0..1: how much of bounds to occupy (e.g. 0.9)
}): THREE.Vector2[] {
  const pts = opts.pointsSvg;
  assert(pts.length >= 2, "SVG points должны содержать минимум 2 точки");

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  const fit = THREE.MathUtils.clamp(opts.fit, 0.05, 1.0);
  const targetW = Math.max(1e-6, opts.targetHalfBounds.x * 2 * fit);
  const targetH = Math.max(1e-6, opts.targetHalfBounds.y * 2 * fit);
  const scale = Math.min(targetW / w, targetH / h);

  // SVG is y-down; world is y-up. Flip Y.
  return pts.map((p) => new THREE.Vector2((p.x - cx) * scale, -(p.y - cy) * scale));
}


