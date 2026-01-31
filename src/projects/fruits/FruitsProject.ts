import * as THREE from "three";
import { CONFIG } from "../../config";
import { getDpr } from "../puzzle/app/utils";
import { createFruitBackgroundRenderer } from "../shared/fruitBackground/fruitBackgroundRenderer";

function mountUI(host: HTMLElement): { canvas: HTMLCanvasElement; statusEl: HTMLDivElement } {
  host.classList.add("launcher--puzzle");
  host.innerHTML = `
    <div class="puzzle">
      <canvas class="puzzle__canvas"></canvas>
      <div class="puzzle__panel">
        <div class="puzzle__title">Фрукты (debug)</div>
        <div class="puzzle__hint">Показывает все объекты из glTF рандомно на экране.</div>
      </div>
      <div class="puzzle__status" id="puzzle-status">Загрузка...</div>
    </div>
  `;
  const canvas = host.querySelector("canvas.puzzle__canvas") as HTMLCanvasElement | null;
  const statusEl = host.querySelector("#puzzle-status") as HTMLDivElement | null;
  if (!canvas) throw new Error("Fruits canvas not found");
  if (!statusEl) throw new Error("Fruits status not found");
  return { canvas, statusEl };
}

export async function mountFruitsProject(host: HTMLElement): Promise<void> {
  const { canvas, statusEl } = mountUI(host);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = true;

  function resize(): { w: number; h: number; dpr: number } {
    const rect = canvas.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    renderer.setSize(w, h, false);
    return { w, h, dpr };
  }

  statusEl.textContent = "Загружаю пресеты фруктов…";
  const fruitBg = createFruitBackgroundRenderer({ config: CONFIG.puzzle.background3d });
  await fruitBg.load();

  let activeBits: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1;
  let lastSwitchSec = 0;
  let lastW = 0;
  let lastH = 0;

  let lastT = performance.now();
  function frame(tNow: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.033, Math.max(0.001, (tNow - lastT) * 0.001));
    lastT = tNow;
    const timeSec = tNow * 0.001;

    const { w, h, dpr } = resize();
    if (w !== lastW || h !== lastH) {
      fruitBg.resize(w, h, dpr);
      lastW = w;
      lastH = h;
    }

    // Автопереключение пресетов для превью
    if (timeSec - lastSwitchSec > 2.4) {
      activeBits = (((activeBits % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7);
      lastSwitchSec = timeSec;
    }

    fruitBg.update(timeSec, dpr);
    fruitBg.renderLayerToScreen(renderer, activeBits);
    statusEl.textContent = `Пресет bits=${activeBits} • dt=${(dt * 1000).toFixed(1)}ms • DPR=${dpr.toFixed(2)}`;
  }

  requestAnimationFrame(frame);

  window.addEventListener("resize", () => resize());
}

