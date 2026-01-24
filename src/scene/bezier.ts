import * as THREE from "three";

export type BezierControlPoints = [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];

export function bezierPoint(p: BezierControlPoints, t: number) {
  const u = 1 - t;
  const p0 = p[0].clone().multiplyScalar(u * u * u);
  const p1 = p[1].clone().multiplyScalar(3 * u * u * t);
  const p2 = p[2].clone().multiplyScalar(3 * u * t * t);
  const p3 = p[3].clone().multiplyScalar(t * t * t);
  return p0.add(p1).add(p2).add(p3);
}

export function createBezierLine(opts: { points: BezierControlPoints; segments: number }) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= opts.segments; i++) {
    const t = i / opts.segments;
    pts.push(bezierPoint(opts.points, t));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0x6ee7ff,
    transparent: true,
    opacity: 0.35
  });
  return new THREE.Line(geom, mat);
}


