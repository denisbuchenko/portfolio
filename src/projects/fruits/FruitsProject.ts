import * as THREE from "three";
import { CONFIG } from "../../config";
import { XorShift32 } from "../puzzle/rng";
import { getDpr } from "../puzzle/app/utils";
import { loadFoodCatalog } from "./foodCatalog";

type FruitInstance = {
  name: string;
  obj: THREE.Group;
  vel: THREE.Vector2;
  baseScale: number;
};

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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(-0.35, -0.65, 1.0).normalize();
  scene.add(ambient, dir);

  // Важно: для больших/объёмных моделей нужен адекватный near/far, иначе будет клиппинг/артефакты.
  const CAMERA_Z = 1000;
  const CAMERA_NEAR = 0.1;
  const CAMERA_FAR = 5000;
  let camera = new THREE.OrthographicCamera(0, 1, 0, 1, CAMERA_NEAR, CAMERA_FAR);

  const rng = new XorShift32(0xfeedcafe);
  const instances: FruitInstance[] = [];

  function resize(): { w: number; h: number; dpr: number } {
    const rect = canvas.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    renderer.setSize(w, h, false);

    // Фрустум задаётся в пространстве камеры, поэтому делаем его "центрированным",
    // а саму камеру ставим в центр экрана. Тогда мир в координатах 0..w / 0..h
    // будет полностью попадать в видимую область.
    camera = new THREE.OrthographicCamera(-w * 0.5, w * 0.5, h * 0.5, -h * 0.5, CAMERA_NEAR, CAMERA_FAR);
    camera.position.set(w * 0.5, h * 0.5, CAMERA_Z);
    camera.lookAt(w * 0.5, h * 0.5, 0);
    camera.updateProjectionMatrix();
    return { w, h, dpr };
  }

  statusEl.textContent = "Загружаю glTF…";
  const { entries } = await loadFoodCatalog(CONFIG.puzzle.background3d.gltfUrl);

  // Раскидываем все объекты по экрану
  const { w, h, dpr } = resize();
  const margin = 50 * dpr;

  for (const e of entries) {
    const obj = e.object.clone(true);
    obj.position.set(rng.range(margin, w - margin), rng.range(margin, h - margin), 0);
    obj.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI));

    // размер в пикселях
    const target = rng.range(90 * dpr, 150 * dpr);
    const scale = e.normalizedScale * target;
    obj.scale.setScalar(scale);

    // случайное движение
    const vel = new THREE.Vector2(rng.range(-1, 1), rng.range(-1, 1));
    if (vel.length() < 0.1) vel.set(1, 0);
    vel.normalize().multiplyScalar(rng.range(40, 120) * dpr);

    scene.add(obj);
    instances.push({ name: e.name, obj, vel, baseScale: scale });
  }

  statusEl.textContent = `Готово: объектов ${instances.length}`;

  let lastT = performance.now();
  function frame(tNow: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.033, Math.max(0.001, (tNow - lastT) * 0.001));
    lastT = tNow;

    const { w, h, dpr } = resize();
    const wrap = 90 * dpr;

    for (const it of instances) {
      it.obj.position.x += it.vel.x * dt;
      it.obj.position.y += it.vel.y * dt;
      it.obj.rotation.z += dt * 0.8;

      if (it.obj.position.x > w + wrap) it.obj.position.x = -wrap;
      if (it.obj.position.x < -wrap) it.obj.position.x = w + wrap;
      if (it.obj.position.y > h + wrap) it.obj.position.y = -wrap;
      if (it.obj.position.y < -wrap) it.obj.position.y = h + wrap;
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);

  window.addEventListener("resize", () => resize());

  // eslint-disable-next-line no-console
  console.log("Fruits loaded:", entries.map((e) => e.name));
}

