import * as THREE from "three";
import { loadGltf } from "../city/three/loadGltf";
import { buildSunducAnimationCatalog } from "./animation/SunducAnimationCatalog";
import { SunducAnimationController } from "./animation/SunducAnimationController";
import { SUNDUC_CONFIG } from "./config";
import { createSunducRotationController, type SunducRotationController } from "./rotation/createSunducRotationController";
import type { SunducProjectOptions } from "./types";
import { createSunducUI, type SunducUI } from "./ui/createSunducUI";
import { createSunducViewer, type SunducViewer } from "./viewer/createSunducViewer";

export type { SunducProjectOptions } from "./types";

export class SunducProject {
  private readonly _clock = new THREE.Clock();
  private readonly _ui: SunducUI;
  private readonly _viewer: SunducViewer;
  private readonly _rotationController: SunducRotationController;
  private readonly _resizeObserver: ResizeObserver;

  private _animationController: SunducAnimationController | null = null;
  private _interactiveClipNames: string[] = [];
  private _frameHandle = 0;
  private _disposed = false;

  constructor(options: SunducProjectOptions) {
    this._ui = createSunducUI({
      host: options.host,
      embedded: options.embedded ?? false,
      onMenu: options.onMenu ?? (() => window.location.reload())
    });

    this._viewer = createSunducViewer({
      canvas: this._ui.canvas
    });

    this._rotationController = createSunducRotationController({
      canvas: this._ui.canvas,
      target: this._viewer.rotationRoot
    });

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this._ui.canvasWrap);
    this._resize();

    this._ui.setButtonsEnabled(false);
    this._ui.setStatus("Загрузка модели и анимаций…");

    this._frameHandle = requestAnimationFrame(this._frame);
    void this._load();
  }

  dispose(): void {
    this._disposed = true;
    cancelAnimationFrame(this._frameHandle);
    this._resizeObserver.disconnect();
    this._animationController?.dispose();
    this._rotationController.dispose();
    this._viewer.dispose();
    this._ui.dispose();
  }

  private async _load(): Promise<void> {
    try {
      const gltf = await loadGltf(SUNDUC_CONFIG.assetUrl);
      if (this._disposed) return;

      this._viewer.setModel(gltf.scene);
      this._animationController = new SunducAnimationController({
        root: gltf.scene,
        animations: gltf.animations,
        onStatusChange: (text) => this._ui.setStatus(text),
        onClipStateChange: (clipName, active) => this._ui.setClipButtonActive(clipName, active)
      });

      const animationCatalog = buildSunducAnimationCatalog(this._animationController.getClipNames());
      this._interactiveClipNames = [...animationCatalog.stoneClipNames, ...animationCatalog.sequenceClipNames];

      this._ui.renderAnimationControls({
        stoneClipNames: animationCatalog.stoneClipNames,
        sequenceClipNames: animationCatalog.sequenceClipNames,
        summary: animationCatalog.summary,
        onToggleClip: (clipName) => this._animationController?.toggleClip(clipName),
        onResetAll: () => this._animationController?.resetClips(this._interactiveClipNames)
      });
      this._animationController.initializeClips(this._interactiveClipNames);

      this._ui.setButtonsEnabled(true);
      this._ui.setStatus("Модель готова. Включай тумблеры, чтобы ставить анимации в нужное состояние.");
    } catch (error) {
      if (this._disposed) return;
      this._ui.setStatus(`Ошибка загрузки: ${error instanceof Error ? error.message : String(error)}`);
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  private _resize(): void {
    const width = Math.max(1, this._ui.canvasWrap.clientWidth);
    const height = Math.max(1, this._ui.canvasWrap.clientHeight);
    this._viewer.resize(width, height);
  }

  private _frame = (): void => {
    if (this._disposed) return;

    const deltaSeconds = Math.min(this._clock.getDelta(), 0.05);
    this._rotationController.update(deltaSeconds);
    this._animationController?.update(deltaSeconds);
    this._viewer.render();

    this._frameHandle = requestAnimationFrame(this._frame);
  };
}
