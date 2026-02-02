import * as THREE from "three";
import vertexShader from "../shaders/animatedProduct.vert.glsl?raw";
import fragmentShader from "../shaders/animatedProduct.frag.glsl?raw";
import type { Product } from "../types";
import { DEFAULT_COLOR, rand01 } from "./utils";

const ANIMATION_BOUNDS_SCALE = 1 / 3;
const Z_MIN = -7.5;
const Z_MAX = -2.5;

export const createAnimatedMaterial = (
  product: Product,
  bounds: { width: number; height: number }
): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    map: { value: product.materials[0]?.map ?? null },
    color: { value: new THREE.Color(DEFAULT_COLOR) },
    uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
  },
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
});

export const updateAnimation = (mat: THREE.ShaderMaterial, time: number): void => {
  if ("uTime" in mat.uniforms) mat.uniforms.uTime.value = time;
};

const _createInstancedAttr = (array: Float32Array, itemSize: number) =>
  new THREE.InstancedBufferAttribute(array, itemSize);

export const createAnimationAttributes = (
  count: number,
  seed: number,
  bounds: { width: number; height: number },
  startIdx = 0
) => {
  const rs = new Float32Array(count);
  const ra = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  const md = new Float32Array(count * 2);
  const ms = new Float32Array(count);
  const ip = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const s = (seed + idx * 31) | 0;
    const rand = (o: number) => rand01(s + o);

    rs[i] = 0.3 + rand(0) * 0.7;
    const ax = (rand(1) - 0.5) * 2;
    const ay = (rand(2) - 0.5) * 2;
    const az = (rand(3) - 0.5) * 2;
    const len = Math.hypot(ax, ay, az) || 1;
    ra.set([ax / len, ay / len, az / len], i * 3);
    ph[i] = rand(4) * Math.PI * 2;

    const ang = rand(5) * Math.PI * 2;
    md.set([Math.cos(ang), Math.sin(ang)], i * 2);
    ms[i] = 1.0 + rand(6) * 2.0;

    const vw = bounds.width * ANIMATION_BOUNDS_SCALE;
    const vh = bounds.height * ANIMATION_BOUNDS_SCALE;
    ip.set([
      (rand(7) - 0.5) * vw,
      (rand(8) - 0.5) * vh,
      (rand(9) - 0.5) * (Z_MAX - Z_MIN) + Z_MIN
    ], i * 3);
  }

  return {
    rotationSpeed: _createInstancedAttr(rs, 1),
    rotationAxis: _createInstancedAttr(ra, 3),
    phase: _createInstancedAttr(ph, 1),
    movementDirection: _createInstancedAttr(md, 2),
    movementSpeed: _createInstancedAttr(ms, 1),
    initialPosition: _createInstancedAttr(ip, 3),
  };
};

export type InstancedProduct = { mesh: THREE.InstancedMesh; count: number; product: Product };

export const createInstancedProduct = (product: Product, count: number): InstancedProduct => {
  const mat = product.materials[0] ?? new THREE.MeshBasicMaterial({ color: DEFAULT_COLOR });
  const mesh = new THREE.InstancedMesh(product.geometry, mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, count, product };
};

const _warnOutOfBounds = (idx: number, max: number) =>
  console.warn(`Индекс ${idx} вне диапазона [0, ${max})`);

export const setInstanceMatrix = (inst: InstancedProduct, idx: number, m: THREE.Matrix4): void => {
  if (idx < 0 || idx >= inst.count) return _warnOutOfBounds(idx, inst.count);
  inst.mesh.setMatrixAt(idx, m);
};

export const setInstanceTransform = (
  inst: InstancedProduct,
  idx: number,
  pos: THREE.Vector3,
  scale?: number,
  rot?: THREE.Euler
): void => {
  if (idx < 0 || idx >= inst.count) return _warnOutOfBounds(idx, inst.count);

  const s = (scale ?? 1) * inst.product.normalizedScale;
  const quat = rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion();
  const mat = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(s, s, s));

  inst.mesh.setMatrixAt(idx, mat);
};

export const markInstancesDirty = (inst: InstancedProduct): void => {
  inst.mesh.instanceMatrix.needsUpdate = true;
};

