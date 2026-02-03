import type { DragState, DrawState, RuntimePiece } from "./runtimeTypes";
import type { PuzzleUI } from "./ui/puzzleUI";
import type { PaintSystem } from "./paint/types";
import type { GroupSystem } from "./groups/groupSystem";
import { getDpr } from "./utils";

export class InputHandler {
	private _hitCanvas: HTMLCanvasElement;
	private _hitCtx: CanvasRenderingContext2D;

	constructor() {
		this._hitCanvas = document.createElement("canvas");
		this._hitCanvas.width = 2;
		this._hitCanvas.height = 2;

		const hitCtx = this._hitCanvas.getContext("2d");

		if (!hitCtx) throw new Error("2D hit context not available");

		this._hitCtx = hitCtx;
	}

	canvasPointFromEvent(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect();
		const dpr = getDpr();

		return {
			x: (e.clientX - rect.left) * dpr,
			y: (e.clientY - rect.top) * dpr
		};
	}

	hitTestPiece(rp: RuntimePiece, x: number, y: number, bitsAtPointer: number): boolean {
		const maskBit = 1 << (bitsAtPointer | 0);
		if ((rp.maskSet & maskBit) === 0) return false;

		const pad = rp.img.geom.padPx;
		const localX = x - (rp.x - pad);
		const localY = y - (rp.y - pad);

		if (localX < 0 || localY < 0) return false;

		const w = rp.img.bitmap.width;
		const h = rp.img.bitmap.height;

		if (localX > w || localY > h) return false;

		return this._hitCtx.isPointInPath(rp.img.path, localX, localY);
	}

	handlePointerDown(
		e: PointerEvent,
		canvas: HTMLCanvasElement,
		pieces: RuntimePiece[],
		groupSys: GroupSystem,
		ui: PuzzleUI,
		paint: PaintSystem,
		maskBitsAt: (x: number, y: number) => number,
		onDragStart: (drag: DragState, reorderedPieces: RuntimePiece[]) => void,
		onDrawStart: (draw: DrawState) => void
	): RuntimePiece[] {
		const { x, y } = this.canvasPointFromEvent(canvas, e);
		const bitsAtPointer = maskBitsAt(x, y);

		for (let i = pieces.length - 1; i >= 0; i--) {
			const rp = pieces[i];
			if (this.hitTestPiece(rp, x, y, bitsAtPointer)) {
				const reorderedPieces = groupSys.bringGroupToFront(rp.groupId, pieces);
				const drag: DragState = {
					pointerId: e.pointerId,
					piece: rp,
					groupId: rp.groupId,
					offsetX: x - rp.x,
					offsetY: y - rp.y
				};
				canvas.setPointerCapture(e.pointerId);
				onDragStart(drag, reorderedPieces);
				return reorderedPieces;
			}
		}

		const draw: DrawState = { pointerId: e.pointerId, color: ui.getActiveColor() };
		canvas.setPointerCapture(e.pointerId);
		paint.addPoint(draw.color, x, y);
		onDrawStart(draw);
		return pieces;
	}

	handlePointerMove(
		e: PointerEvent,
		canvas: HTMLCanvasElement,
		drag: DragState | null,
		groupSys: GroupSystem,
		maskBitsAt: (x: number, y: number) => number
	): void {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const { x, y } = this.canvasPointFromEvent(canvas, e);
		const bitsAtPointer = maskBitsAt(x, y);
		const maskBit = 1 << (bitsAtPointer | 0);
		if ((drag.piece.maskSet & maskBit) === 0) return;
		const newX = x - drag.offsetX;
		const newY = y - drag.offsetY;
		const dx = newX - drag.piece.x;
		const dy = newY - drag.piece.y;
		groupSys.moveGroup(drag.groupId, dx, dy);
	}

	handlePointerMoveDraw(
		e: PointerEvent,
		canvas: HTMLCanvasElement,
		draw: DrawState | null,
		paint: PaintSystem
	): void {
		if (!draw || e.pointerId !== draw.pointerId) return;
		const { x, y } = this.canvasPointFromEvent(canvas, e);
		paint.addPoint(draw.color, x, y);
	}

	handlePointerUpOrCancel(
		e: PointerEvent,
		canvas: HTMLCanvasElement,
		drag: DragState | null,
		draw: DrawState | null,
		onDragEnd: (drag: DragState) => void,
		onDrawEnd: () => void
	): { wasDrag: DragState | null; wasDraw: boolean } {
		const wasDrag = drag && e.pointerId === drag.pointerId ? drag : null;
		const wasDraw = draw && e.pointerId === draw.pointerId ? draw : null;
		if (wasDrag) onDragEnd(wasDrag);
		if (wasDraw) onDrawEnd();

		try {
			canvas.releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}

		return { wasDrag, wasDraw: wasDraw !== null };
	}
}
