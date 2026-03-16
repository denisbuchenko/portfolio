import * as THREE from "three";
import { loadGltf } from "../city/three/loadGltf";
import { buildSunducAnimationCatalog } from "./animation/SunducAnimationCatalog";
import { SunducAnimationController } from "./animation/SunducAnimationController";
import { SunducSequenceController, type SunducDropAcceptance } from "./animation/SunducSequenceController";
import { SUNDUC_CONFIG } from "./config";
import { createSunducRotationController, type SunducRotationController } from "./rotation/createSunducRotationController";
import type { SunducInventoryItemId, SunducProjectOptions } from "./types";
import { createSunducUI, type SunducUI } from "./ui/createSunducUI";
import { createSunducViewer, type SunducViewer } from "./viewer/createSunducViewer";

export type { SunducProjectOptions } from "./types";

export class SunducProject {
  private readonly _clock = new THREE.Clock();
  private readonly _ui: SunducUI;
  private readonly _viewer: SunducViewer;
  private readonly _rotationController: SunducRotationController;
  private readonly _resizeObserver: ResizeObserver;
  private readonly _onRestoreKeyRequest?: () => void;

  private _animationController: SunducAnimationController | null = null;
  private _sequenceController: SunducSequenceController | null = null;
  private _interactiveClipNames: string[] = [];
  private _frameHandle = 0;
  private _disposed = false;
  private _renderActive = true;

  constructor(options: SunducProjectOptions) {
    this._onRestoreKeyRequest = options.onRestoreKeyRequest;
    this._ui = createSunducUI({
      host: options.host,
      embedded: options.embedded ?? false
    });

    this._viewer = createSunducViewer({
      canvas: this._ui.canvas
    });

    this._rotationController = createSunducRotationController({
      canvas: this._ui.canvas,
      target: this._viewer.rotationRoot,
      canStartDrag: (clientX, clientY) => this._viewer.hitTestModelAtClientPoint(clientX, clientY)
    });

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this._ui.canvasWrap);
    this._resize();

    this._ui.setButtonsEnabled(false);
    this._ui.setStatus("");

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

  resume(): void {
    this.setRenderActive(true);
  }

  pause(): void {
    this.setRenderActive(false);
  }

  setRenderActive(active: boolean): void {
    if (this._disposed) return;
    if (this._renderActive === active) return;

    this._renderActive = active;
    if (active) {
      this._clock.start();
      this._clock.getDelta();
      this._renderOnce(0);
      this._requestFrame();
      return;
    }

    this._clock.stop();
    cancelAnimationFrame(this._frameHandle);
    this._frameHandle = 0;
  }

  hitTestInventoryDrop(clientX: number, clientY: number): boolean {
    const rect = this._ui.canvasWrap.getBoundingClientRect();
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return false;
    }

    const insetX = rect.width * 0.16;
    const insetTop = rect.height * 0.12;
    const insetBottom = rect.height * 0.08;

    return (
      clientX >= rect.left + insetX &&
      clientX <= rect.right - insetX &&
      clientY >= rect.top + insetTop &&
      clientY <= rect.bottom - insetBottom
    );
  }

  acceptInventoryItem(itemId: SunducInventoryItemId): SunducDropAcceptance {
    return this._sequenceController?.acceptItem(itemId) ?? { accepted: false };
  }

  canAcceptInventoryItem(itemId: SunducInventoryItemId): boolean {
    return this._sequenceController?.canAcceptItem(itemId) ?? false;
  }

  resetRotationToInitial(durationSec = 0.5): void {
    this._rotationController.resetToInitialRotation(durationSec);
    if (this._renderActive) this._requestFrame();
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
        onResetAll: () => {
          this._sequenceController?.resetProgress();
          this._viewer.resetTitleReveal();
          this._animationController?.resetClips(this._interactiveClipNames);
        }
      });
      this._animationController.initializeClips(this._interactiveClipNames);
      this._sequenceController = new SunducSequenceController({
        animationCatalog,
        animationController: this._animationController,
        onStatusChange: (text) => this._ui.setStatus(text),
        onOpen2Complete: () => this._viewer.scheduleTitleReveal(),
        onRestoreKeyRequest: this._onRestoreKeyRequest
      });

      this._ui.setButtonsEnabled(true);
      this._ui.setStatus("");
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
    if (this._disposed || !this._renderActive) {
      this._frameHandle = 0;
      return;
    }

    const deltaSeconds = Math.min(this._clock.getDelta(), 0.05);
    this._renderOnce(deltaSeconds);

    this._frameHandle = requestAnimationFrame(this._frame);
  };

  private _requestFrame(): void {
    if (this._frameHandle || this._disposed || !this._renderActive) return;
    this._frameHandle = requestAnimationFrame(this._frame);
  }

  private _renderOnce(deltaSeconds: number): void {
    this._rotationController.update(deltaSeconds);
    this._animationController?.update(deltaSeconds);
    this._viewer.update(deltaSeconds);
    this._viewer.render();
  }
}
