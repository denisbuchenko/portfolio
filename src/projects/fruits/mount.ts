import { createFruitsUI } from "./ui";
import { getDpr } from "../puzzle/app/utils";
import { CONFIG } from "../../config";
import type { FruitBackgroundPresetsConfig } from "./types";
import { createFruitsRenderer, resizeRenderer } from "./core/scene";
import { FruitsProject } from "./project";

const MAX_FRAME_TIME = 0.033;
const MIN_FRAME_TIME = 0.001;

export async function mountFruitsProject(host: HTMLElement): Promise<() => void> {
  const ui = createFruitsUI(host);
  const renderer = createFruitsRenderer(ui.canvas);

  const project = new FruitsProject();

  function handleResize() {
    const { w, h, dpr } = resizeRenderer(ui.canvas, renderer, getDpr);
    project.resize(w, h, dpr);
    return { w, h, dpr };
  }

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

  const { w, h, dpr } = handleResize();
  project.setup(fruitsConfig, products, w, h, dpr);
  ui.statusEl.textContent = "Готово!";

  let lastTimestamp = performance.now();
  let animationFrame: number;

  function renderLoop(timestamp: number): void {
    animationFrame = requestAnimationFrame(renderLoop);

    const deltaSeconds = Math.min(
      MAX_FRAME_TIME,
      Math.max(MIN_FRAME_TIME, (timestamp - lastTimestamp) * 0.001)
    );
    lastTimestamp = timestamp;
    const timeSec = timestamp * 0.001;

    const { dpr } = handleResize();

    project.update(timeSec);
    project.render(renderer);

    ui.statusEl.textContent =
      `Фрукты • Δt=${(deltaSeconds * 1000).toFixed(1)}мс • DPR=${dpr.toFixed(2)}`;
  }

  animationFrame = requestAnimationFrame(renderLoop);

  const resizeHandler = () => handleResize();
  window.addEventListener("resize", resizeHandler);

  return () => {
    window.removeEventListener("resize", resizeHandler);
    cancelAnimationFrame(animationFrame);
    project.dispose();
    renderer.dispose();
  };
}

