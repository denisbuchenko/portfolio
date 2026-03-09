import { createFruitsUI } from "./ui";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";
import type { FruitBackgroundPresetsConfig } from "./types";
import { createFruitsRenderer, resizeRenderer } from "./core/scene";
import { FruitsProject } from "./project";

const MAX_FRAME_TIME = 0.033;
const MIN_FRAME_TIME = 0.001;

export class MountedFruitsProject {
  private _ui;
  private _renderer;
  private _project;
  private _disposed = false;
  private _renderActive = true;
  private _animationFrame = 0;
  private _lastTimestamp = 0;
  private _resizeRaf = 0;

  private _onWindowResize = () => this._scheduleResize();

  constructor(
    ui: ReturnType<typeof createFruitsUI>,
    renderer: ReturnType<typeof createFruitsRenderer>,
    project: FruitsProject
  ) {
    this._ui = ui;
    this._renderer = renderer;
    this._project = project;
  }

  start(): void {
    this._lastTimestamp = performance.now();
    this._handleResize();
    this._renderOnce(this._lastTimestamp);
    this._requestNextFrame();
    window.addEventListener("resize", this._onWindowResize);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    window.removeEventListener("resize", this._onWindowResize);
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
    this._resizeRaf = 0;
    this._animationFrame = 0;
    this._project.dispose();
    this._renderer.dispose();
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
      this._lastTimestamp = performance.now();
      this._handleResize();
      this._renderOnce(this._lastTimestamp);
      this._requestNextFrame();
      return;
    }

    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
    this._animationFrame = 0;
  }

  private _scheduleResize(): void {
    if (this._disposed) return;
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = 0;
      this._handleResize();
      if (this._renderActive) this._renderOnce(performance.now());
    });
  }

  private _handleResize(): { w: number; h: number; dpr: number } {
    const { w, h, dpr } = resizeRenderer(this._ui.canvas, this._renderer, getDpr);
    this._project.resize(w, h, dpr);
    return { w, h, dpr };
  }

  private _requestNextFrame(): void {
    if (this._animationFrame || this._disposed || !this._renderActive) return;
    this._animationFrame = requestAnimationFrame((timestamp) => this._renderLoop(timestamp));
  }

  private _renderLoop(timestamp: number): void {
    if (this._disposed || !this._renderActive) {
      this._animationFrame = 0;
      return;
    }

    this._animationFrame = 0;
    this._renderOnce(timestamp);
    this._requestNextFrame();
  }

  private _renderOnce(timestamp: number): void {
    const deltaSeconds = Math.min(
      MAX_FRAME_TIME,
      Math.max(MIN_FRAME_TIME, (timestamp - this._lastTimestamp) * 0.001)
    );
    this._lastTimestamp = timestamp;
    const timeSec = timestamp * 0.001;

    const { dpr } = this._handleResize();

    this._project.update(timeSec);
    this._project.render(this._renderer);

    this._ui.statusEl.textContent =
      `Фрукты • Δt=${(deltaSeconds * 1000).toFixed(1)}мс • DPR=${dpr.toFixed(2)}`;
  }
}

export async function mountFruitsProject(host: HTMLElement): Promise<MountedFruitsProject> {
  const ui = createFruitsUI(host);
  const renderer = createFruitsRenderer(ui.canvas);
  const project = new FruitsProject();

  ui.statusEl.textContent = "Загрузка моделей фруктов...";
  const products = await project.load(CONFIG.puzzle.background3d.gltfUrl);

  const fruitsConfig = ((): any => {
    const preset = CONFIG.puzzle.background3d as FruitBackgroundPresetsConfig;
    const layer = preset.layers[1];
    const sizeMultiplier = preset.sizeMul * 0.01;

    const productNames = products.map(p => p.name);
    const maxTypes = layer.fruits?.countTypes ?? preset.counts.bits1to5;
    const selectedProducts = productNames.slice(0, maxTypes);

    const instancesPerProduct = layer.fruits?.countInstances
      ? Math.floor(layer.fruits.countInstances * preset.instanceMul)
      : Math.floor(10 * preset.instanceMul);

    return {
      gltfUrl: preset.gltfUrl,
      backgroundColor: layer.bg,
      motion: {
        // Можно задавать и углом (angleDeg/angleRad), но тут используем вектор из пресета.
        direction: layer.dir,
        speedCssPxPerSec: layer.speedCssPxPerSec,
      },
      camera: { fov: preset.camera.fovDeg },
      products: selectedProducts.map(name => ({
        productName: name,
        count: instancesPerProduct,
        size: {
          min: layer.sizeCssPx.min * sizeMultiplier,
          max: layer.sizeCssPx.max * sizeMultiplier
        }
      })),
      seed: preset.seed
    };
  })();

  const bootstrap = resizeRenderer(ui.canvas, renderer, getDpr);
  project.setup(fruitsConfig, products, bootstrap.w, bootstrap.h, bootstrap.dpr);
  ui.statusEl.textContent = "Готово!";

  const mounted = new MountedFruitsProject(ui, renderer, project);
  mounted.start();
  return mounted;
}

