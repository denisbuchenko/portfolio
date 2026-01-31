import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import type { RendererState } from "./index";
import { clamp } from "../utils";

/**
 * Обновляет размеры сцены, RenderTarget'ы и камеру.
 */
export function resizeRenderer(
  state: RendererState,
  config: FruitBackgroundPresetsConfig,
  w: number,
  h: number,
  dpr: number
): void {
  state.viewW = w;
  state.viewH = h;
  state.dpr = dpr;
  
  // Обновление RenderTarget'ов
  const s = clamp(config.rtScale, 0.25, 1.0);
  const tw = Math.max(1, Math.floor(w * s));
  const th = Math.max(1, Math.floor(h * s));
  
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const rt = state.rtByBits.get(b);
    if (!rt) {
      const nrt = new THREE.WebGLRenderTarget(tw, th, {
        depthBuffer: true,
        stencilBuffer: false
      });
      nrt.texture.generateMipmaps = false;
      nrt.texture.minFilter = THREE.LinearFilter;
      nrt.texture.magFilter = THREE.LinearFilter;
      nrt.texture.wrapS = THREE.ClampToEdgeWrapping;
      nrt.texture.wrapT = THREE.ClampToEdgeWrapping;
      state.rtByBits.set(b, nrt);
    } else {
      if (rt.width !== tw || rt.height !== th) {
        rt.setSize(tw, th);
      }
    }
  }
  
  // Настройка камеры
  state.camera = new THREE.PerspectiveCamera(
    clamp(config.camera.fovDeg, 12, 85),
    w / Math.max(1, h),
    0.1,
    8000
  );
  state.camera.up.set(0, -1, 0);
  
  const fovRad = (state.camera.fov * Math.PI) / 180;
  state.cameraZ = h / Math.max(1e-3, 2 * Math.tan(fovRad * 0.5));
  state.depthPx = Math.max(1, config.camera.depthCssPx * Math.max(0.5, dpr));
  
  state.camera.position.set(w * 0.5, h * 0.5, state.cameraZ);
  state.camera.lookAt(w * 0.5, h * 0.5, 0);
  state.camera.updateProjectionMatrix();
  
  // Очистка кэша размещения
  state.placementByBits.clear();
  for (const it of state.instances) {
    it._inited = false;
  }
}
