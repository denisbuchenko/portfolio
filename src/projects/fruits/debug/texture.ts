import * as THREE from "three";

const DEBUG_UI_Z_INDEX = 9999;
const MAX_DEBUG_SIZE = { width: 800, height: 600 };

const _createDebugElement = (tag: string, styles: string, text?: string): HTMLElement => {
  const el = document.createElement(tag);
  el.style.cssText = styles;
  if (text) el.textContent = text;
  return el;
};

export const showTextureDebug = (texture: THREE.Texture, label?: string): (() => void) => {
  const img = (texture.image as HTMLImageElement | HTMLCanvasElement | undefined);
  const source = (texture.source?.data as { width?: number; height?: number } | undefined);
  const w = img?.width ?? source?.width ?? 256;
  const h = img?.height ?? source?.height ?? 256;

  const scale = Math.min(
    Math.min(w, MAX_DEBUG_SIZE.width) / w,
    Math.min(h, MAX_DEBUG_SIZE.height) / h
  );
  const canvasW = Math.floor(w * scale);
  const canvasH = Math.floor(h * scale);

  const tempRenderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: false });
  tempRenderer.setSize(canvasW, canvasH);
  tempRenderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  scene.add(plane);
  tempRenderer.render(scene, cam);

  const overlay = _createDebugElement("div", `
    position: fixed; inset: 0; z-index: ${DEBUG_UI_Z_INDEX};
    background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
    padding: 20px; box-sizing: border-box;
  `);

  const container = _createDebugElement("div", `
    position: relative; max-width: 90vw; max-height: 90vh;
    background: rgba(18,22,34,0.95); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `);

  if (label) {
    container.appendChild(_createDebugElement("div", `
      font-size: 14px; font-weight: bold; color: rgba(255,255,255,0.88);
      margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);
    `, label));
  }

  const canvas = _createDebugElement("canvas", `
    display: block; max-width: 100%; max-height: 70vh;
    border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
  `) as HTMLCanvasElement;
  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.getContext("2d")?.drawImage(tempRenderer.domElement, 0, 0);

  container.appendChild(canvas);
  container.appendChild(_createDebugElement("div", `
    font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 8px; text-align: center;
  `, `Размер: ${w} × ${h}px`));

  const closeBtn = _createDebugElement("button", `
    position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
    border: none; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.88);
    border-radius: 4px; cursor: pointer; font-size: 18px; display: flex;
    align-items: center; justify-content: center; transition: background 0.2s;
  `, "✕") as HTMLButtonElement;

  closeBtn.onmouseenter = () => closeBtn.style.background = "rgba(255,255,255,0.2)";
  closeBtn.onmouseleave = () => closeBtn.style.background = "rgba(255,255,255,0.1)";
  container.appendChild(closeBtn);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const cleanup = () => {
    document.body.removeChild(overlay);
    tempRenderer.dispose();
    plane.geometry.dispose();
    (plane.material as THREE.Material).dispose();
    document.removeEventListener("keydown", handleKey);
  };

  const handleKey = (e: KeyboardEvent) => e.key === "Escape" && cleanup();
  closeBtn.onclick = cleanup;
  overlay.onclick = e => e.target === overlay && cleanup();
  document.addEventListener("keydown", handleKey);

  return cleanup;
};

