import type { RendererState } from "./index";

/**
 * Освобождает все ресурсы рендерера.
 */
export function disposeRenderer(state: RendererState): void {
  // Удаление RenderTarget'ов
  for (const rt of state.rtByBits.values()) {
    rt.dispose();
  }
  state.rtByBits.clear();
  
  // Удаление fallback-текстур
  for (const bits of [1, 2, 3, 4, 5, 6, 7] as const) {
    state.fallbackTexByBits[bits].dispose();
  }
  
  // Удаление геометрий и материалов
  const disposedMaterials = new Set();
  for (const tl of state.typeLayers) {
    for (const m of tl.meshes) {
      m.geometry.dispose();
      const mat = m.material as any;
      if (!disposedMaterials.has(mat)) {
        mat.dispose();
        disposedMaterials.add(mat);
      }
      state.scene.remove(m);
    }
  }
}
