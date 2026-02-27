import type { CityGirlRuntime } from "../girls/CityGirlsSystem";

export type DebugFocusGirlTuning = Readonly<{
  mode: "fit" | "fixed";
  travelSec: number;
  fov: number;
  padding: number;
  yawDeg: number;
  pitchDeg: number;
  fixed: {
    cameraLocalOffset: { x: number; y: number; z: number };
    lookAtLocalOffset: { x: number; y: number; z: number };
  };
  extraTransform: {
    positionOffset: { x: number; y: number; z: number };
    rotationOffsetDeg: { x: number; y: number; z: number };
  };
}>;

export class CityDebugPanel {
  private _root: HTMLDivElement;
  private _toggle: HTMLButtonElement;
  private _panel: HTMLDivElement;
  private _open = false;
  private _girls: ReadonlyArray<CityGirlRuntime> = [];

  private _onFocusFirst: (() => void) | null = null;
  private _tuning: DebugFocusGirlTuning | null = null;
  private _onTuningChange: ((next: DebugFocusGirlTuning) => void) | null = null;

  constructor(host: HTMLElement) {
    this._root = document.createElement("div");
    this._root.style.position = "absolute";
    this._root.style.right = "14px";
    this._root.style.top = "14px";
    this._root.style.zIndex = "50";
    this._root.style.pointerEvents = "auto";
    this._root.style.display = "none";
    this._root.dataset.cityUi = "1";
    host.appendChild(this._root);

    this._toggle = document.createElement("button");
    this._toggle.className = "btn";
    this._toggle.type = "button";
    this._toggle.textContent = "Debug";
    this._toggle.style.pointerEvents = "auto";
    this._toggle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    this._toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      this._open = !this._open;
      this._render();
    });
    this._root.appendChild(this._toggle);

    this._panel = document.createElement("div");
    this._panel.style.marginTop = "10px";
    this._panel.style.width = "min(340px, calc(100vw - 28px))";
    this._panel.style.maxHeight = "min(calc(100vh - 80px), 56vh)";
    this._panel.style.overflow = "auto";
    this._panel.style.padding = "12px";
    this._panel.style.borderRadius = "12px";
    this._panel.style.background = "rgba(10,12,18,0.72)";
    this._panel.style.backdropFilter = "blur(10px)";
    this._panel.style.border = "1px solid rgba(255,255,255,0.08)";
    this._panel.style.color = "rgba(255,255,255,0.92)";
    this._panel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif";
    this._panel.style.fontSize = "13px";
    this._panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    this._panel.addEventListener("wheel", (e) => e.stopPropagation());
    this._root.appendChild(this._panel);

    this._render();
  }

  setVisible(visible: boolean): void {
    this._root.style.display = visible ? "block" : "none";
  }

  setGirls(girls: ReadonlyArray<CityGirlRuntime>): void {
    this._girls = girls;
    this._render();
  }

  setDebugFocusGirlTuning(tuning: DebugFocusGirlTuning): void {
    this._tuning = tuning;
    this._render();
  }

  onDebugFocusGirlTuningChange(handler: (next: DebugFocusGirlTuning) => void): void {
    this._onTuningChange = handler;
    this._render();
  }

  onFocusFirstGirl(handler: () => void): void {
    this._onFocusFirst = handler;
    this._render();
  }

  dispose(): void {
    this._root.remove();
  }

  private _render(): void {
    this._toggle.textContent = this._open ? "Debug (закрыть)" : "Debug";
    this._panel.style.display = this._open ? "block" : "none";
    this._panel.innerHTML = "";

    const title = document.createElement("div");
    title.textContent = "City Debug (overview)";
    title.style.fontWeight = "700";
    title.style.marginBottom = "10px";
    this._panel.appendChild(title);

    const btnFocus = this._mkBtn("Фокус на Girl #1 (full height)", () => this._onFocusFirst?.());
    btnFocus.style.width = "100%";
    this._panel.appendChild(btnFocus);

    const hint = document.createElement("div");
    hint.textContent = "Тест анимаций: non/stay/hello/love/love2 + A-pose (bind).";
    hint.style.opacity = "0.8";
    hint.style.margin = "10px 0 12px";
    this._panel.appendChild(hint);

    if (this._tuning) {
      const tuneTitle = document.createElement("div");
      tuneTitle.textContent = "Камера (Debug Focus Girl)";
      tuneTitle.style.fontWeight = "700";
      tuneTitle.style.margin = "12px 0 8px";
      this._panel.appendChild(tuneTitle);

      this._panel.appendChild(this._mkSelect("mode", this._tuning.mode, ["fit", "fixed"], (v) => this._setTuning({ mode: v as "fit" | "fixed" })));
      this._panel.appendChild(this._mkNum("travelSec", this._tuning.travelSec, 0.05, (v) => this._setTuning({ travelSec: v })));
      this._panel.appendChild(this._mkNum("fov", this._tuning.fov, 1, (v) => this._setTuning({ fov: v })));
      this._panel.appendChild(this._mkNum("padding", this._tuning.padding, 0.01, (v) => this._setTuning({ padding: v })));
      this._panel.appendChild(this._mkNum("yawDeg", this._tuning.yawDeg, 1, (v) => this._setTuning({ yawDeg: v })));
      this._panel.appendChild(this._mkNum("pitchDeg", this._tuning.pitchDeg, 1, (v) => this._setTuning({ pitchDeg: v })));

      const fixedTitle = document.createElement("div");
      fixedTitle.textContent = "fixed.* (локальные оффсеты)";
      fixedTitle.style.opacity = "0.85";
      fixedTitle.style.margin = "10px 0 6px";
      this._panel.appendChild(fixedTitle);

      this._panel.appendChild(
        this._mkVec3("fixed.cameraLocalOffset", this._tuning.fixed.cameraLocalOffset, (next) =>
          this._setTuning({ fixed: { ...this._tuning!.fixed, cameraLocalOffset: next } })
        )
      );
      this._panel.appendChild(
        this._mkVec3("fixed.lookAtLocalOffset", this._tuning.fixed.lookAtLocalOffset, (next) =>
          this._setTuning({ fixed: { ...this._tuning!.fixed, lookAtLocalOffset: next } })
        )
      );

      const extraTitle = document.createElement("div");
      extraTitle.textContent = "extraTransform.* (ручная подстройка)";
      extraTitle.style.opacity = "0.85";
      extraTitle.style.margin = "10px 0 6px";
      this._panel.appendChild(extraTitle);

      this._panel.appendChild(
        this._mkVec3("extra.positionOffset", this._tuning.extraTransform.positionOffset, (next) =>
          this._setTuning({ extraTransform: { ...this._tuning!.extraTransform, positionOffset: next } })
        )
      );
      this._panel.appendChild(
        this._mkVec3("extra.rotationOffsetDeg", this._tuning.extraTransform.rotationOffsetDeg, (next) =>
          this._setTuning({ extraTransform: { ...this._tuning!.extraTransform, rotationOffsetDeg: next } })
        )
      );
    }

    for (const g of this._girls) {
      const card = document.createElement("div");
      card.style.padding = "10px";
      card.style.borderRadius = "10px";
      card.style.background = "rgba(255,255,255,0.06)";
      card.style.border = "1px solid rgba(255,255,255,0.08)";
      card.style.marginBottom = "10px";

      const h = document.createElement("div");
      h.textContent = `${g.id} / ${g.markerName}`;
      h.style.fontWeight = "600";
      h.style.marginBottom = "8px";
      card.appendChild(h);

      const row1 = document.createElement("div");
      row1.style.display = "flex";
      row1.style.flexWrap = "wrap";
      row1.style.gap = "6px";

      row1.appendChild(this._mkBtn("A-pose", () => g.controller.applyAPose()));
      row1.appendChild(this._mkBtn("non", () => g.controller.applyDefaultNonPose()));
      row1.appendChild(this._mkBtn("stay", () => g.anim.playStay({ restart: true })));
      row1.appendChild(this._mkBtn("hello", () => g.anim.playHello({ restart: true })));
      row1.appendChild(this._mkBtn("love seq", () => g.anim.beginLoveSequence()));
      row1.appendChild(this._mkBtn("love2", () => g.anim.playLove2({ restart: true })));
      card.appendChild(row1);

      this._panel.appendChild(card);
    }
  }

  private _mkBtn(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "btn";
    b.type = "button";
    b.textContent = text;
    b.style.pointerEvents = "auto";
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private _mkRow(): HTMLDivElement {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "10px";
    row.style.marginBottom = "6px";
    return row;
  }

  private _mkNum(label: string, value: number, step: number, onChange: (v: number) => void): HTMLDivElement {
    const row = this._mkRow();
    const l = document.createElement("div");
    l.textContent = label;
    l.style.opacity = "0.9";
    row.appendChild(l);

    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    input.step = String(step);
    input.style.width = "120px";
    input.style.padding = "8px 10px";
    input.style.borderRadius = "10px";
    input.style.border = "1px solid rgba(255,255,255,0.14)";
    input.style.background = "rgba(0,0,0,0.25)";
    input.style.color = "rgba(255,255,255,0.92)";
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
    input.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = Number((e.target as HTMLInputElement).value);
      if (!Number.isFinite(v)) return;
      onChange(v);
    });
    row.appendChild(input);
    return row;
  }

  private _mkSelect(label: string, value: string, options: readonly string[], onChange: (v: string) => void): HTMLDivElement {
    const row = this._mkRow();
    const l = document.createElement("div");
    l.textContent = label;
    l.style.opacity = "0.9";
    row.appendChild(l);

    const sel = document.createElement("select");
    sel.value = value;
    sel.style.width = "120px";
    sel.style.padding = "8px 10px";
    sel.style.borderRadius = "10px";
    sel.style.border = "1px solid rgba(255,255,255,0.14)";
    sel.style.background = "rgba(0,0,0,0.25)";
    sel.style.color = "rgba(255,255,255,0.92)";
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      sel.appendChild(opt);
    }
    sel.addEventListener("pointerdown", (e) => e.stopPropagation());
    sel.addEventListener("change", (e) => {
      e.stopPropagation();
      onChange((e.target as HTMLSelectElement).value);
    });
    row.appendChild(sel);
    return row;
  }

  private _mkVec3(
    label: string,
    v: Readonly<{ x: number; y: number; z: number }>,
    onChange: (next: { x: number; y: number; z: number }) => void
  ): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "8px";

    const head = document.createElement("div");
    head.textContent = label;
    head.style.opacity = "0.9";
    head.style.marginBottom = "6px";
    wrap.appendChild(head);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";
    row.style.flexWrap = "wrap";

    const mk = (axis: "x" | "y" | "z", step: number) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(v[axis]);
      input.step = String(step);
      input.style.width = "100px";
      input.style.padding = "8px 10px";
      input.style.borderRadius = "10px";
      input.style.border = "1px solid rgba(255,255,255,0.14)";
      input.style.background = "rgba(0,0,0,0.25)";
      input.style.color = "rgba(255,255,255,0.92)";
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
      input.addEventListener("input", (e) => {
        e.stopPropagation();
        const next = { x: v.x, y: v.y, z: v.z };
        const n = Number((e.target as HTMLInputElement).value);
        if (!Number.isFinite(n)) return;
        next[axis] = n;
        onChange(next);
      });
      input.placeholder = axis;
      return input;
    };

    row.appendChild(mk("x", 0.01));
    row.appendChild(mk("y", 0.01));
    row.appendChild(mk("z", 0.01));
    wrap.appendChild(row);
    return wrap;
  }

  private _setTuning(patch: Partial<DebugFocusGirlTuning>): void {
    if (!this._tuning) return;
    const next: DebugFocusGirlTuning = {
      ...this._tuning,
      ...patch,
      fixed: (patch.fixed ?? this._tuning.fixed) as DebugFocusGirlTuning["fixed"],
      extraTransform: (patch.extraTransform ?? this._tuning.extraTransform) as DebugFocusGirlTuning["extraTransform"]
    };
    this._tuning = next;
    this._onTuningChange?.(next);
  }
}

