import * as THREE from "three";
import type { FruitBackgroundPresetsConfig, FruitLayerBits } from "../types";
import type { RendererState } from "./index";

/**
 * Рендерит все слои в offscreen RenderTarget'ы.
 */
export function renderTargets(
  state: RendererState,
  config: FruitBackgroundPresetsConfig,
  renderer: THREE.WebGLRenderer
): void {
  if (!config.enabled || !state.isReady || !state.shouldRenderThisFrame) return;
  if (!state.scene || !state.camera) return;
  
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevClearA = renderer.getClearAlpha();
  
  for (let bits = 1; bits <= 7; bits++) {
    const b = bits as FruitLayerBits;
    const rt = state.rtByBits.get(b);
    if (!rt) continue;
    
    renderer.setRenderTarget(rt);
    renderer.setClearColor(new THREE.Color(config.layers[b].bg), 1);
    renderer.clear(true, true, true);
    state.camera.layers.set(b);
    
    // Обновляем матрицы на GPU
    for (const tl of state.typeLayers) {
      if (tl.bits !== b || !tl._dirty) continue;
      for (const m of tl.meshes) {
        m.instanceMatrix.needsUpdate = true;
      }
      tl._dirty = false;
    }
    
    renderer.render(state.scene, state.camera);
  }
  
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevClearA);
  
  state.lastRenderedSec = state.lastTimeSec ?? state.lastRenderedSec;
  state.shouldRenderThisFrame = false;
}

/**
 * Рендерит конкретный слой на экран.
 */
export function renderLayerToScreen(
  state: RendererState,
  config: FruitBackgroundPresetsConfig,
  renderer: THREE.WebGLRenderer,
  bits: FruitLayerBits
): void {
  if (!config.enabled || !state.isReady) return;
  if (!state.scene || !state.camera) return;
  
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevClearA = renderer.getClearAlpha();
  
  renderer.setRenderTarget(null);
  renderer.setClearColor(new THREE.Color(config.layers[bits].bg), 1);
  renderer.clear(true, true, true);
  state.camera.layers.set(bits);
  
  // Обновляем матрицы на GPU
  for (const tl of state.typeLayers) {
    if (tl.bits !== bits || !tl._dirty) continue;
    for (const m of tl.meshes) {
      m.instanceMatrix.needsUpdate = true;
    }
    tl._dirty = false;
  }
  
  renderer.render(state.scene, state.camera);
  
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevClearA);
}
