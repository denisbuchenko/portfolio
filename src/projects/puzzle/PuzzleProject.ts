import { createPuzzleModel } from "./model";
import { createPieceImage } from "./pieceImage";
import type { PieceGeometry } from "./path";
import { XorShift32 } from "./rng";
import type { PieceImage } from "./pieceImage";
import { CONFIG } from "../../config";
import * as THREE from "three";

import puzzleVert from "../../shaders/puzzleTextured.vert.glsl?raw";
import puzzlePaintFrag from "../../shaders/puzzlePaint.frag.glsl?raw";
import puzzlePieceMaskFrag from "../../shaders/puzzlePieceMask.frag.glsl?raw";

type ColorKey = "r" | "g" | "b";

type RuntimePiece = {
  img: PieceImage;
  id: number;
  groupId: number;
  /**
   * Какой 3-bit цвет (0..7) должен показывать этот пазл.
   * 0 = (0,0,0) — виден там, где следа нет.
   * 1 = (1,0,0), 2 = (0,1,0), 4 = (0,0,1),
   * 3 = (1,1,0), 5 = (1,0,1), 6 = (0,1,1), 7 = (1,1,1)
   */
  maskBits: number;
  mesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /**
   * Позиция в мире в пикселях канваса: это top-left клетки (без pad).
   */
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  piece: RuntimePiece;
  groupId: number;
  offsetX: number;
  offsetY: number;
} | null;

type DrawState = {
  pointerId: number;
  color: ColorKey;
} | null;

type Trail = {
  points: Array<{ x: number; y: number }>;
  lengthPx: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function getDpr(): number {
  return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
}

export function mountPuzzleProject(host: HTMLElement): void {
  host.classList.add("launcher--puzzle");
  host.innerHTML = `
    <div class="puzzle">
      <canvas class="puzzle__canvas"></canvas>
      <div class="puzzle__panel">
        <div class="puzzle__title">Пазл 4×4</div>
        <div class="puzzle__hint">Перетаскивай кусочки мышкой или пальцем.</div>
      </div>
      <div class="puzzle__colors" aria-label="Выбор цвета">
        <button class="puzzle__color puzzle__color--r puzzle__color--active" data-color="r" type="button" aria-label="Красный"></button>
        <button class="puzzle__color puzzle__color--g" data-color="g" type="button" aria-label="Зелёный"></button>
        <button class="puzzle__color puzzle__color--b" data-color="b" type="button" aria-label="Синий"></button>
      </div>
      <div class="puzzle__status" id="puzzle-status">Загрузка...</div>
    </div>
  `;

  const canvas = host.querySelector("canvas.puzzle__canvas") as HTMLCanvasElement | null;
  const status = host.querySelector("#puzzle-status") as HTMLDivElement | null;
  const colorsEl = host.querySelector(".puzzle__colors") as HTMLDivElement | null;
  if (!canvas) throw new Error("Puzzle canvas not found");
  if (!status) throw new Error("Puzzle status not found");
  if (!colorsEl) throw new Error("Puzzle colors element not found");

  // Важно: TS не сохраняет narrowing внутрь вложенных функций для переменных типа T|null,
  // поэтому сразу фиксируем non-null ссылки в отдельных const.
  const canvasEl: HTMLCanvasElement = canvas;
  const statusEl: HTMLDivElement = status;
  const colorsRoot: HTMLDivElement = colorsEl;
  colorsRoot.style.setProperty("--puzzle-color-btn-size", `${CONFIG.puzzle.ui.colorButtonCssPx}px`);

  // Отдельный контекст для hit-test’ов по Path2D (transform = identity).
  const hitCanvas = document.createElement("canvas");
  hitCanvas.width = 2;
  hitCanvas.height = 2;
  const hitCtx = hitCanvas.getContext("2d");
  if (!hitCtx) throw new Error("2D hit context not available");
  const hitCtx2: CanvasRenderingContext2D = hitCtx;

  // Слой рисования (offscreen) — рисуем под пазлами, смешивание каналов делаем аддитивным.
  const paintCanvas = document.createElement("canvas");
  paintCanvas.width = 2;
  paintCanvas.height = 2;
  const paintCtx = paintCanvas.getContext("2d");
  if (!paintCtx) throw new Error("2D paint context not available");
  const paintCtx2: CanvasRenderingContext2D = paintCtx;

  // Downsample для быстрых CPU hit-test’ов/ограничения перемещения по маске.
  const maskSampleCanvas = document.createElement("canvas");
  maskSampleCanvas.width = 256;
  maskSampleCanvas.height = 256;
  const maskSampleCtx = maskSampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskSampleCtx) throw new Error("2D mask sample context not available");
  const maskSampleCtx2: CanvasRenderingContext2D = maskSampleCtx;
  let maskSampleData: ImageData | null = null;

  // WebGL (Three.js) рендер
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });
  renderer.autoClear = true;
  renderer.setPixelRatio(1); // canvas уже в px, мы сами ресайзим.

  const scene = new THREE.Scene();
  let camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);

  const maskTex = new THREE.CanvasTexture(paintCanvas);
  maskTex.generateMipmaps = false;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.wrapS = THREE.ClampToEdgeWrapping;
  maskTex.wrapT = THREE.ClampToEdgeWrapping;

  const paintMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      tMask: { value: maskTex },
      uResolution: { value: new THREE.Vector2(2, 2) }
    },
    vertexShader: puzzleVert,
    fragmentShader: puzzlePaintFrag
  });
  const paintQuadGeom = new THREE.PlaneGeometry(1, 1);
  const paintQuad = new THREE.Mesh(paintQuadGeom, paintMat);
  paintQuad.renderOrder = 0;
  scene.add(paintQuad);

  const rng = new XorShift32(0x0ddba11);

  let sourceImg: HTMLImageElement | null = null;
  let pieces: RuntimePiece[] = [];
  let geom: PieceGeometry | null = null;
  let drag: DragState = null;
  let draw: DrawState = null;
  let activeColor: ColorKey = "r";
  let rafId = 0;

  const pieceById = new Map<number, RuntimePiece>();
  const groups = new Map<number, number[]>(); // groupId -> piece ids

  const trails: Record<ColorKey, Trail> = {
    r: { points: [], lengthPx: 0 },
    g: { points: [], lengthPx: 0 },
    b: { points: [], lengthPx: 0 }
  };

  function initGroups(): void {
    groups.clear();
    pieceById.clear();
    for (const p of pieces) {
      pieceById.set(p.id, p);
      p.groupId = p.id;
      groups.set(p.groupId, [p.id]);
    }
  }

  function groupMembers(groupId: number): RuntimePiece[] {
    const ids = groups.get(groupId);
    if (!ids) return [];
    const out: RuntimePiece[] = [];
    for (const id of ids) {
      const p = pieceById.get(id);
      if (p) out.push(p);
    }
    return out;
  }

  function moveGroup(groupId: number, dx: number, dy: number): void {
    const ids = groups.get(groupId);
    if (!ids) return;
    for (const id of ids) {
      const p = pieceById.get(id);
      if (!p) continue;
      p.x += dx;
      p.y += dy;
    }
  }

  function mergeGroups(intoGroupId: number, fromGroupId: number): void {
    if (intoGroupId === fromGroupId) return;
    const a = groups.get(intoGroupId);
    const b = groups.get(fromGroupId);
    if (!a || !b) return;
    for (const id of b) {
      const p = pieceById.get(id);
      if (p) p.groupId = intoGroupId;
      a.push(id);
    }
    groups.delete(fromGroupId);
  }

  function bringGroupToFront(groupId: number): void {
    const groupIds = new Set(groups.get(groupId) ?? []);
    if (groupIds.size === 0) return;
    const back: RuntimePiece[] = [];
    const front: RuntimePiece[] = [];
    for (const p of pieces) {
      if (groupIds.has(p.id)) front.push(p);
      else back.push(p);
    }
    pieces = back.concat(front);
  }

  function resizeCanvas(): { w: number; h: number; dpr: number } {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = getDpr();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
    if (paintCanvas.width !== w) paintCanvas.width = w;
    if (paintCanvas.height !== h) paintCanvas.height = h;
    renderer.setSize(w, h, false);
    camera = new THREE.OrthographicCamera(0, w, 0, h, -10, 10);
    // y вниз: top=0, bottom=h
    camera.top = 0;
    camera.bottom = h;
    camera.left = 0;
    camera.right = w;
    camera.updateProjectionMatrix();

    paintQuad.scale.set(w, h, 1);
    paintQuad.position.set(w * 0.5, h * 0.5, 0);

    // Обновим sample-буфер (его разрешение фиксированное, но данные будут перерисованы в redrawPaint()).
    return { w, h, dpr };
  }

  function pickGeometry(viewW: number, viewH: number, dpr: number): PieceGeometry {
    const minCss = Math.min(viewW / dpr, viewH / dpr);
    const puzzleCss = Math.max(320, minCss * 0.72);
    const cellCss = puzzleCss / 4;
    const cellPx = Math.max(48, Math.floor(cellCss * dpr));
    const tabPx = cellPx * 0.22;
    const padPx = tabPx * 1.3;
    return { cellPx, tabPx, padPx };
  }

  function scramblePieces(viewW: number, viewH: number, g: PieceGeometry): void {
    const cell = g.cellPx;
    const pad = g.padPx;
    const ext = cell + pad * 2;
    const margin = Math.max(16 * getDpr(), pad);

    for (const p of pieces) {
      const xMin = margin;
      const xMax = Math.max(xMin, viewW - ext - margin);
      const yMin = margin;
      const yMax = Math.max(yMin, viewH - ext - margin);
      // x,y — top-left клетки, поэтому добавляем pad.
      const drawX = rng.range(xMin, xMax);
      const drawY = rng.range(yMin, yMax);
      p.x = drawX + pad;
      p.y = drawY + pad;
    }
  }

  function render(): void {
    rafId = window.requestAnimationFrame(render);

    const dpr = getDpr();
    const w = canvasEl.width;
    const h = canvasEl.height;

    (paintMat.uniforms.uResolution.value as THREE.Vector2).set(w, h);

    // порядок отрисовки пазлов = порядок в массиве
    for (let i = 0; i < pieces.length; i++) {
      const rp = pieces[i];
      if (!rp.mesh) continue;
      rp.mesh.renderOrder = 10 + i;
      const pad = rp.img.geom.padPx;
      const dx = rp.x - pad;
      const dy = rp.y - pad;
      const bw = rp.img.bitmap.width;
      const bh = rp.img.bitmap.height;
      rp.mesh.scale.set(bw, bh, 1);
      rp.mesh.position.set(dx + bw * 0.5, dy + bh * 0.5, 0);
      // uResolution может меняться на resize.
      (rp.mesh.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }

    renderer.setClearColor(0x070a10, 1);
    renderer.render(scene, camera);

    // небольшой статус
    if (geom) {
      statusEl.textContent = `Кусочков: ${pieces.length} • Групп: ${groups.size} • Цвет: ${activeColor.toUpperCase()} • DPR: ${dpr.toFixed(2)}`;
    }
  }

  function canvasPointFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = getDpr();
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr
    };
  }

  function maskBitsAt(x: number, y: number): number {
    if (!maskSampleData) return 0;
    const w = canvasEl.width;
    const h = canvasEl.height;
    const sw = maskSampleCanvas.width;
    const sh = maskSampleCanvas.height;
    const sx = Math.max(0, Math.min(sw - 1, Math.floor((x / Math.max(1, w)) * sw)));
    const sy = Math.max(0, Math.min(sh - 1, Math.floor((y / Math.max(1, h)) * sh)));
    const idx = (sy * sw + sx) * 4;
    const d = maskSampleData.data;
    // порог в 0..255 (чуть выше нуля, чтобы антиалиас по краю не дрожал)
    const thr = 12;
    let bits = 0;
    if (d[idx + 0] > thr) bits |= 1;
    if (d[idx + 1] > thr) bits |= 2;
    if (d[idx + 2] > thr) bits |= 4;
    return bits;
  }

  function hitTestPiece(rp: RuntimePiece, x: number, y: number): boolean {
    if (maskBitsAt(x, y) !== rp.maskBits) return false;
    const pad = rp.img.geom.padPx;
    const localX = x - (rp.x - pad);
    const localY = y - (rp.y - pad);
    if (localX < 0 || localY < 0) return false;
    const w = rp.img.bitmap.width;
    const h = rp.img.bitmap.height;
    if (localX > w || localY > h) return false;
    return hitCtx2.isPointInPath(rp.img.path, localX, localY);
  }

  function snapThresholdPx(g: PieceGeometry): number {
    return Math.max(10 * getDpr(), g.cellPx * 0.12);
  }

  function trailMaxLenPx(): number {
    // 200 в "логике" = CSS px, переводим в canvas px по DPR.
    return CONFIG.puzzle.paint.maxTrailLengthCssPx * getDpr();
  }

  function addTrailPoint(color: ColorKey, x: number, y: number): void {
    const t = trails[color];
    const pts = t.points;
    const maxLen = trailMaxLenPx();

    if (pts.length === 0) {
      pts.push({ x, y });
      t.lengthPx = 0;
      return;
    }

    const last = pts[pts.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    // слишком мелкие шаги не добавляем
    if (dist < 0.5 * getDpr()) return;

    pts.push({ x, y });
    t.lengthPx += dist;

    while (t.lengthPx > maxLen && pts.length > 1) {
      const a = pts[0];
      const b = pts[1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      pts.shift();
      t.lengthPx -= seg;
    }

    // Перерисовываем слой: следов мало и они ограничены длиной, так что это недорого.
    redrawPaint();
  }

  function strokeForColor(color: ColorKey): string {
    if (color === "r") return "rgba(255,0,0,1)";
    if (color === "g") return "rgba(0,255,0,1)";
    return "rgba(0,0,255,1)";
  }

  function redrawPaint(): void {
    const w = paintCanvas.width;
    const h = paintCanvas.height;
    paintCtx2.setTransform(1, 0, 0, 1, 0, 0);
    paintCtx2.clearRect(0, 0, w, h);

    paintCtx2.globalCompositeOperation = "lighter";
    paintCtx2.lineCap = "round";
    paintCtx2.lineJoin = "round";
    paintCtx2.imageSmoothingEnabled = true;

    const lw = Math.max(1, CONFIG.puzzle.paint.brushSizeCssPx * getDpr());
    paintCtx2.lineWidth = lw;

    const order: ColorKey[] = ["r", "g", "b"];
    for (const c of order) {
      const pts = trails[c].points;
      if (pts.length < 2) continue;
      paintCtx2.strokeStyle = strokeForColor(c);
      paintCtx2.beginPath();
      paintCtx2.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) paintCtx2.lineTo(pts[i].x, pts[i].y);
      paintCtx2.stroke();
    }

    paintCtx2.globalCompositeOperation = "source-over";

    // обновляем WebGL texture
    maskTex.needsUpdate = true;

    // обновляем downsample буфер
    maskSampleCtx2.setTransform(1, 0, 0, 1, 0, 0);
    maskSampleCtx2.clearRect(0, 0, maskSampleCanvas.width, maskSampleCanvas.height);
    maskSampleCtx2.drawImage(paintCanvas, 0, 0, maskSampleCanvas.width, maskSampleCanvas.height);
    maskSampleData = maskSampleCtx2.getImageData(0, 0, maskSampleCanvas.width, maskSampleCanvas.height);
  }

  function trySnapGroupOnce(groupId: number): { mergedInto: number } | null {
    if (!geom) return null;
    const cell = geom.cellPx;
    const thr = snapThresholdPx(geom);

    let best:
      | {
          score: number;
          dx: number;
          dy: number;
          targetGroupId: number;
        }
      | undefined;

    const members = groupMembers(groupId);
    for (const p of members) {
      const n = p.img.piece.neighbors;
      const neighborChecks: Array<{ neighborId: number | null; offX: number; offY: number }> = [
        { neighborId: n.top, offX: 0, offY: -cell },
        { neighborId: n.right, offX: +cell, offY: 0 },
        { neighborId: n.bottom, offX: 0, offY: +cell },
        { neighborId: n.left, offX: -cell, offY: 0 }
      ];

      for (const c of neighborChecks) {
        if (c.neighborId == null) continue;
        const neighborPiece = pieceById.get(c.neighborId);
        if (!neighborPiece) continue;
        if (neighborPiece.groupId === groupId) continue;

        const dx = neighborPiece.x - (p.x + c.offX);
        const dy = neighborPiece.y - (p.y + c.offY);
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx > thr || ady > thr) continue;
        const score = Math.hypot(dx, dy);
        if (!best || score < best.score) {
          best = {
            score,
            dx,
            dy,
            targetGroupId: neighborPiece.groupId
          };
        }
      }
    }

    if (!best) return null;

    // Дотягиваем текущую (перетаскиваемую) группу к стоящей на месте группе.
    moveGroup(groupId, best.dx, best.dy);

    // Немного стабилизируем координаты после снэпа, чтобы не копилась дробь.
    for (const p of groupMembers(groupId)) {
      p.x = Math.round(p.x);
      p.y = Math.round(p.y);
    }

    mergeGroups(best.targetGroupId, groupId);
    bringGroupToFront(best.targetGroupId);
    return { mergedInto: best.targetGroupId };
  }

  function onPointerDown(e: PointerEvent): void {
    if (!geom) return;
    if (drag) return;
    if (draw) return;
    const { x, y } = canvasPointFromEvent(e);

    for (let i = pieces.length - 1; i >= 0; i--) {
      const rp = pieces[i];
      if (hitTestPiece(rp, x, y)) {
        bringGroupToFront(rp.groupId);
        drag = {
          pointerId: e.pointerId,
          piece: rp,
          groupId: rp.groupId,
          offsetX: x - rp.x,
          offsetY: y - rp.y
        };
        canvasEl.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Если попали не по пазлу — начинаем рисовать.
    draw = { pointerId: e.pointerId, color: activeColor };
    canvasEl.setPointerCapture(e.pointerId);
    addTrailPoint(activeColor, x, y);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag) return;
    if (e.pointerId !== drag.pointerId) return;
    const { x, y } = canvasPointFromEvent(e);
    // двигать можно только внутри "видимых" мест для цвета того пазла, который схватили
    if (maskBitsAt(x, y) !== drag.piece.maskBits) return;
    const newX = x - drag.offsetX;
    const newY = y - drag.offsetY;
    const dx = newX - drag.piece.x;
    const dy = newY - drag.piece.y;
    moveGroup(drag.groupId, dx, dy);
  }

  function onPointerMoveDraw(e: PointerEvent): void {
    if (!draw) return;
    if (e.pointerId !== draw.pointerId) return;
    const { x, y } = canvasPointFromEvent(e);
    addTrailPoint(draw.color, x, y);
  }

  function onPointerUpOrCancel(e: PointerEvent): void {
    const wasDrag = drag && e.pointerId === drag.pointerId ? drag : null;
    const wasDraw = draw && e.pointerId === draw.pointerId ? draw : null;

    if (wasDrag) drag = null;
    if (wasDraw) draw = null;

    if (!wasDrag && !wasDraw) return;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (wasDrag) {
      // После отпускания пробуем пристыковать группу: можно "цеплять" несколько раз подряд.
      let currentGroupId = wasDrag.groupId;
      for (let i = 0; i < 12; i++) {
        const res = trySnapGroupOnce(currentGroupId);
        if (!res) break;
        currentGroupId = res.mergedInto;
      }
    }
  }

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointermove", onPointerMoveDraw);
  canvasEl.addEventListener("pointerup", onPointerUpOrCancel);
  canvasEl.addEventListener("pointercancel", onPointerUpOrCancel);

  function setActiveColor(c: ColorKey): void {
    activeColor = c;
    const buttons = Array.from(colorsRoot.querySelectorAll("button.puzzle__color"));
    for (const b of buttons) {
      const bc = b.getAttribute("data-color") as ColorKey | null;
      if (bc === activeColor) b.classList.add("puzzle__color--active");
      else b.classList.remove("puzzle__color--active");
    }
  }

  colorsRoot.addEventListener("pointerdown", (e) => {
    // чтобы нажатия по UI не запускали рисование на канвасе
    e.preventDefault();
    e.stopPropagation();
  });
  colorsRoot.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest("button.puzzle__color") as HTMLButtonElement | null;
    if (!btn) return;
    const c = btn.getAttribute("data-color") as ColorKey | null;
    if (!c) return;
    setActiveColor(c);
  });

  let rebuildToken = 0;
  async function rebuild(): Promise<void> {
    const token = ++rebuildToken;
    const { w, h, dpr } = resizeCanvas();
    if (!sourceImg) return;

    const g = pickGeometry(w, h, dpr);
    geom = g;

    const model = createPuzzleModel({
      rows: 4,
      cols: 4,
      imgW: sourceImg.naturalWidth || sourceImg.width,
      imgH: sourceImg.naturalHeight || sourceImg.height,
      seed: 0x1eafc0de
    });

    const imgs = await Promise.all(model.pieces.map((piece) => createPieceImage({ model, piece, geom: g, source: sourceImg! })));
    if (token !== rebuildToken) return;

    // 8 комбинаций фиксированы: 0..7.
    // Пока раскладываем детерминированно по id, чтобы гарантировать присутствие всех комбинаций.
    pieces = imgs.map((img) => ({
      img,
      id: img.piece.id,
      groupId: img.piece.id,
      maskBits: img.piece.id % 8,
      x: 0,
      y: 0
    }));
    scramblePieces(w, h, g);
    initGroups();
    // При ребилде (resize) очищаем рисовалку, чтобы не было несовпадения масштаба.
    for (const k of ["r", "g", "b"] as const) {
      trails[k].points = [];
      trails[k].lengthPx = 0;
    }
    redrawPaint();
    statusEl.textContent = "Готово";

    // (пере)создаём меши для пазлов
    for (const p of pieces) {
      if (p.mesh) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        p.mesh = undefined;
      }
      const tex = new THREE.Texture(p.img.bitmap);
      tex.needsUpdate = true;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;

      const mat = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          tPiece: { value: tex },
          tMask: { value: maskTex },
          uResolution: { value: new THREE.Vector2(w, h) },
          uPieceBits: { value: p.maskBits | 0 },
          uThreshold: { value: 0.06 }
        },
        vertexShader: puzzleVert,
        fragmentShader: puzzlePieceMaskFrag
      });

      const geom2 = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geom2, mat);
      mesh.renderOrder = 10;
      p.mesh = mesh;
      scene.add(mesh);
    }
  }

  // старт
  (async () => {
    try {
      sourceImg = await loadImage("/img-lol.jpg");
      await rebuild();
      if (!rafId) rafId = window.requestAnimationFrame(render);
      statusEl.classList.add("puzzle__status--ready");
    } catch (e) {
      statusEl.textContent = e instanceof Error ? e.message : String(e);
    }
  })();

  // resize debounce
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      void rebuild();
    });
  });
}


