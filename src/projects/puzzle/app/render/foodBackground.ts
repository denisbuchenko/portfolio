import * as THREE from "three";
import { type FoodCatalogEntry, loadFoodCatalog } from "./food/catalog";
import { patchLambertForMask } from "./food/maskLambert";
import { hexToColor3, norm2, rand01 } from "./food/utils";

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export type FoodBackgroundLayerConfig = {
  bg: string; // hex
  dir: Vec2;
  speedCssPxPerSec: number;
  sizeCssPx: { min: number; max: number };
};

export type FoodBackgroundConfig = {
  enabled: boolean;
  gltfUrl: string;
  maskThreshold: number;
  lighting: {
    ambientIntensity: number;
    dirIntensity: number;
    dirDirection: Vec3;
  };
  counts: { bits1to5: number; bits6to7: number };
  motion: {
    wrapMarginCssPx: number;
    swayAmpCssPx: number;
    swaySpeed: number;
    spinSpeed: number;
  };
  layers: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, FoodBackgroundLayerConfig>;
};

export type FoodBackground = {
  isReady(): boolean;
  load(): Promise<void>;
  resize(w: number, h: number): void;
  updateAndApplyUniforms(params: {
    tMask: THREE.Texture;
    resolution: THREE.Vector2;
    timeSec: number;
    dpr: number;
  }): void;
};

type BgQuad = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.RawShaderMaterial>;
  bits: number;
};

type FlyingFood = {
  root: THREE.Object3D;
  bits: number;
  vel: THREE.Vector2;
  baseScale: number;
  seed: number;
};

export function createFoodBackground(opts: {
  scene: THREE.Scene;
  config: FoodBackgroundConfig;
  bgFrag: string;
  vert: string;
}): FoodBackground {
  const { scene, config } = opts;

  const resolution = new THREE.Vector2(2, 2);
  const isReadyRef = { v: false };

  const bgQuads: BgQuad[] = [];
  const foods: FlyingFood[] = [];

  const lightGroup = new THREE.Group();
  const ambient = new THREE.AmbientLight(0xffffff, config.lighting.ambientIntensity);
  const dir = new THREE.DirectionalLight(0xffffff, config.lighting.dirIntensity);
  dir.position.set(config.lighting.dirDirection.x, config.lighting.dirDirection.y, config.lighting.dirDirection.z).normalize();
  lightGroup.add(ambient);
  lightGroup.add(dir);
  scene.add(lightGroup);

  // 7 background quads (один на bits)
  for (let bits = 1; bits <= 7; bits++) {
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        tMask: { value: new THREE.Texture() },
        uResolution: { value: resolution.clone() },
        uThreshold: { value: config.maskThreshold },
        uBits: { value: bits },
        uBgColor: { value: hexToColor3(config.layers[bits as 1 | 2 | 3 | 4 | 5 | 6 | 7].bg) }
      },
      vertexShader: opts.vert,
      fragmentShader: opts.bgFrag
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = -20 + bits; // ниже всех
    mesh.position.z = -9;
    scene.add(mesh);
    bgQuads.push({ mesh, bits });
  }

  let foodCatalog: FoodCatalogEntry[] = [];

  async function load(): Promise<void> {
    if (!config.enabled) return;
    foodCatalog = await loadFoodCatalog(config.gltfUrl);

    // Раздаём по 7 слоям без повторов: 4+4+4+4+4+3+3 по умолчанию
    const counts: number[] = [
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits1to5,
      config.counts.bits6to7,
      config.counts.bits6to7
    ];

    let cursor = 0;
    for (let bits = 1; bits <= 7; bits++) {
      const take = Math.max(1, counts[bits - 1] | 0);
      const layer = config.layers[bits as 1 | 2 | 3 | 4 | 5 | 6 | 7];
      const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
      const speedCss = layer.speedCssPxPerSec;

      for (let i = 0; i < take; i++) {
        if (cursor >= foodCatalog.length) break;
        const entry = foodCatalog[cursor++];
        const obj = entry.group.clone(true);
        obj.name = `bgFood:${bits}:${entry.name}`;
        obj.position.set(0, 0, -6);
        obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
        });

        const seed = (bits * 1000 + i * 17 + entry.name.length * 13) | 0;
        foods.push({
          root: obj,
          bits,
          vel: dirV.clone().multiplyScalar(speedCss),
          baseScale: entry.normalizedScale,
          seed
        });
        scene.add(obj);
      }
    }

    isReadyRef.v = true;
  }

  function resize(w: number, h: number): void {
    resolution.set(w, h);
    for (const q of bgQuads) {
      q.mesh.scale.set(w, h, 1);
      q.mesh.position.set(w * 0.5, h * 0.5, -9);
      (q.mesh.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }
  }

  function updateAndApplyUniforms(params: { tMask: THREE.Texture; resolution: THREE.Vector2; timeSec: number; dpr: number }): void {
    if (!config.enabled) return;
    const { tMask, timeSec, dpr } = params;

    // обновляем фоновые материалы
    for (const q of bgQuads) {
      (q.mesh.material.uniforms.tMask.value as THREE.Texture) = tMask;
      (q.mesh.material.uniforms.uThreshold.value as number) = config.maskThreshold;
      // uBgColor можно тюнить из конфига на лету
      const bg = hexToColor3(config.layers[q.bits as 1 | 2 | 3 | 4 | 5 | 6 | 7].bg);
      (q.mesh.material.uniforms.uBgColor.value as THREE.Color).copy(bg);
    }

    if (!isReadyRef.v) return;

    const w = params.resolution.x;
    const h = params.resolution.y;
    const margin = config.motion.wrapMarginCssPx * dpr;
    const swayAmp = config.motion.swayAmpCssPx * dpr;
    const swaySpeed = config.motion.swaySpeed;
    const spinSpeed = config.motion.spinSpeed;

    for (const f of foods) {
      const layer = config.layers[f.bits as 1 | 2 | 3 | 4 | 5 | 6 | 7];
      const speed = layer.speedCssPxPerSec * dpr;
      const dirV = norm2(new THREE.Vector2(layer.dir.x, layer.dir.y));
      f.vel.copy(dirV).multiplyScalar(speed);

      // Init position deterministically on first update
      if (f.root.userData.__inited !== true) {
        const rx = rand01(f.seed + 1);
        const ry = rand01(f.seed + 2);
        f.root.position.x = -margin + rx * (w + 2 * margin);
        f.root.position.y = -margin + ry * (h + 2 * margin);
        f.root.userData.__inited = true;
      }

      // motion (dt approximation: use speed scaled by fixed step)
      const dt = 1 / 60;
      f.root.position.x += f.vel.x * dt;
      f.root.position.y += f.vel.y * dt;

      // gentle sway
      const sway =
        swayAmp *
        (0.5 +
          0.5 *
            Math.sin(timeSec * (swaySpeed + 0.3 * rand01(f.seed + 7)) + 6.28318 * rand01(f.seed + 11)));
      f.root.position.x += -dirV.y * sway * dt;
      f.root.position.y += dirV.x * sway * dt;

      // wrap
      if (dirV.x > 0.0 && f.root.position.x > w + margin) f.root.position.x = -margin;
      if (dirV.x < 0.0 && f.root.position.x < -margin) f.root.position.x = w + margin;
      if (dirV.y > 0.0 && f.root.position.y > h + margin) f.root.position.y = -margin;
      if (dirV.y < 0.0 && f.root.position.y < -margin) f.root.position.y = h + margin;

      // scale per layer
      const rs = rand01(f.seed + 3);
      const targetSizePx = (layer.sizeCssPx.min + (layer.sizeCssPx.max - layer.sizeCssPx.min) * rs) * dpr;
      const scale = f.baseScale * targetSizePx;
      f.root.scale.setScalar(scale);

      // spin
      const rSpin = 0.6 + 0.8 * rand01(f.seed + 5);
      f.root.rotation.z = timeSec * spinSpeed * rSpin;

      // apply mask patch to all MeshLambertMaterial inside
      f.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.Material;
        if (!(mat as THREE.MeshLambertMaterial).isMeshLambertMaterial) return;
        const lm = mat as THREE.MeshLambertMaterial;
        // patch once
        if (lm.userData.__maskPatched === true) return;
        patchLambertForMask({
          material: lm,
          tMask,
          bits: f.bits,
          threshold: config.maskThreshold,
          uResolution: params.resolution
        });
        lm.userData.__maskPatched = true;
      });
    }
  }

  return {
    isReady: () => isReadyRef.v,
    load,
    resize,
    updateAndApplyUniforms
  };
}

