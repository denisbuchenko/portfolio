import type { PhaseContext, PhaseFunction } from "./orchestrator";

/**
 * Фаза освобождения ресурсов
 * Удаляет RenderTarget'ы, fallback-текстуры, геометрии, материалы, объекты из сцены.
 */

/**
 * Главная функция фазы освобождения ресурсов
 */
export const executeDisposal: PhaseFunction = (context) => {
  _disposeRenderTargets(context);
  _disposeFallbackTextures(context);
  _removeFromScene(context);
  _disposeGeometries(context);
  _disposeMaterials(context);
  return context;
};


/**
 * Удаление RenderTarget'ов
 */
function _disposeRenderTargets(context: PhaseContext): void {
  if (context.rtByBits) {
    for (const rt of context.rtByBits.values()) {
      rt.dispose();
    }
    context.rtByBits.clear();
  }
}

/**
 * Удаление fallback-текстур
 */
function _disposeFallbackTextures(context: PhaseContext): void {
  if (context.fallbackTexByBits) {
    for (const bits of [1, 2, 3, 4, 5, 6, 7] as const) {
      context.fallbackTexByBits[bits].dispose();
    }
  }
}

/**
 * Удаление геометрий
 */
function _disposeGeometries(context: PhaseContext): void {
  if (context.typeLayers) {
    for (const tl of context.typeLayers) {
      for (const m of tl.meshes) {
        m.geometry.dispose();
      }
    }
  }
}

/**
 * Удаление материалов
 */
function _disposeMaterials(context: PhaseContext): void {
  if (!context.typeLayers) {
    return;
  }
  
  const disposedMaterials = new Set();
  for (const tl of context.typeLayers) {
    for (const m of tl.meshes) {
      const mat = m.material as any;
      if (!disposedMaterials.has(mat)) {
        mat.dispose();
        disposedMaterials.add(mat);
      }
    }
  }
}

/**
 * Удаление из сцены
 */
function _removeFromScene(context: PhaseContext): void {
  if (!context.scene || !context.typeLayers) {
    return;
  }
  
  for (const tl of context.typeLayers) {
    for (const m of tl.meshes) {
      context.scene.remove(m);
    }
  }
}

