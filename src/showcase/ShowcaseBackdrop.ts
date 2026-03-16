type ShowcaseBackdropSection = {
  key: string;
  el: HTMLElement;
};

type ShowcaseBackdropOptions = {
  host: HTMLElement;
  sections: ShowcaseBackdropSection[];
};

type SectionMetric = {
  key: string;
  top: number;
  height: number;
  bottom: number;
};

type Accent = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fade: number;
};

type SectionDesign = {
  stops: Array<{ at: number; color: string }>;
  accents: Accent[];
};

// ── Дизайн секций ───────────────────────────────────────────────────────────
//
// stops  — стопы единого linear-gradient.
//          `at` = 0..100 (% высоты секции). Крайние стопы вдвинуты внутрь
//          (~7% сверху, ~93% снизу), чтобы между секциями оставалась зона
//          свободной интерполяции. Цвета на границах — почти одинаковый
//          нейтральный тёмный, поэтому швов не видно.
//
// accents — радиальные свечения поверх базы. Позиции локальные (% секции),
//           размеры эллипсов в px. Очень низкая непрозрачность + широкое
//           затухание → мягкие «ощущаемые» цветовые зоны.

const DESIGNS: Record<string, SectionDesign> = {

  // ── Сундук ────────────────────────────────────────────────────────────────
  // Верх: холодный тёмный с лёгким cyan/purple.
  // Вторая половина: чуть-чуть золота в центре, к низу темнеет обратно.
  sunduc: {
    stops: [
      { at: 0, color: "#070a10" },
      { at: 28, color: "#080b11" },
      { at: 54, color: "#0c0b0b" },
      { at: 72, color: "#0a0908" },
      { at: 93, color: "#07090e" },
    ],
    accents: [
      { x: 20, y: 10, w: 1000, h: 500, color: "rgba(110, 220, 255, 0.05)", fade: 80 },
      { x: 80, y: 6, w: 900, h: 460, color: "rgba(160, 120, 255, 0.04)", fade: 78 },
      { x: 50, y: 62, w: 1100, h: 520, color: "rgba(255, 200, 100, 0.06)", fade: 74 },
      { x: 50, y: 80, w: 800, h: 360, color: "rgba(255, 170, 70, 0.035)", fade: 76 },
    ],
  },

  // ── Частицы ───────────────────────────────────────────────────────────────
  // Почти полностью чёрный. Голубые оттенки появляются только у нижнего края.
  particles: {
    stops: [
      { at: 7, color: "#06080a" },
      { at: 48, color: "#050607" },
      { at: 76, color: "#060910" },
      { at: 93, color: "#080c16" },
    ],
    accents: [
      { x: 50, y: 86, w: 900, h: 440, color: "rgba(72, 180, 255, 0.06)", fade: 76 },
      { x: 24, y: 93, w: 1000, h: 500, color: "rgba(50, 100, 255, 0.04)", fade: 80 },
      { x: 76, y: 93, w: 1000, h: 500, color: "rgba(40, 160, 255, 0.035)", fade: 80 },
    ],
  },

  // ── Пазл ──────────────────────────────────────────────────────────────────
  // Сине-голубой переход, еле заметные переливы синего.
  puzzle: {
    stops: [
      { at: 7, color: "#080d18" },
      { at: 34, color: "#080e1c" },
      { at: 66, color: "#070d1a" },
      { at: 93, color: "#080a12" },
    ],
    accents: [
      { x: 18, y: 12, w: 1100, h: 560, color: "rgba(74, 190, 255, 0.05)", fade: 78 },
      { x: 50, y: 42, w: 900, h: 440, color: "rgba(80, 150, 255, 0.06)", fade: 74 },
      { x: 56, y: 78, w: 960, h: 460, color: "rgba(20, 70, 255, 0.05)", fade: 76 },
    ],
  },

  // ── Гномы (3 viewport'а) ──────────────────────────────────────────────────
  // 1/3: слегка белые радиалы по краям (неровные).
  // 2/3: немного сияюще-жёлтое.
  // 3/3: еле заметное пурпурное.
  gnomes: {
    stops: [
      { at: 5, color: "#090a0f" },
      { at: 14, color: "#0b0c10" },
      { at: 29, color: "#090a0e" },
      { at: 35, color: "#0b0a0c" },
      { at: 50, color: "#0d0c0a" },
      { at: 63, color: "#0b0a0c" },
      { at: 69, color: "#0a090e" },
      { at: 82, color: "#0b0910" },
      { at: 95, color: "#08080c" },
    ],
    accents: [
      { x: 6, y: 10, w: 640, h: 360, color: "rgba(255, 255, 255, 0.03)", fade: 78 },
      { x: 94, y: 14, w: 580, h: 340, color: "rgba(255, 255, 255, 0.025)", fade: 76 },
      { x: 10, y: 24, w: 680, h: 380, color: "rgba(255, 255, 255, 0.018)", fade: 80 },
      { x: 90, y: 26, w: 650, h: 360, color: "rgba(255, 255, 255, 0.015)", fade: 78 },
      { x: 50, y: 50, w: 1040, h: 480, color: "rgba(255, 210, 100, 0.05)", fade: 72 },
      { x: 46, y: 55, w: 720, h: 360, color: "rgba(255, 180, 60, 0.03)", fade: 74 },
      { x: 28, y: 80, w: 740, h: 380, color: "rgba(170, 110, 255, 0.025)", fade: 76 },
      { x: 76, y: 85, w: 660, h: 340, color: "rgba(120, 70, 210, 0.02)", fade: 74 },
    ],
  },

  // ── Город ─────────────────────────────────────────────────────────────────
  // Красные градиенты преобладают.
  city: {
    stops: [
      { at: 7, color: "#0a090c" },
      { at: 34, color: "#0e090b" },
      { at: 64, color: "#10090b" },
      { at: 93, color: "#08090c" },
    ],
    accents: [
      { x: 24, y: 20, w: 1100, h: 520, color: "rgba(255, 80, 80, 0.05)", fade: 76 },
      { x: 52, y: 44, w: 960, h: 460, color: "rgba(255, 70, 50, 0.06)", fade: 72 },
      { x: 56, y: 76, w: 940, h: 420, color: "rgba(255, 120, 60, 0.045)", fade: 74 },
      { x: 50, y: 92, w: 1200, h: 540, color: "rgba(120, 14, 30, 0.06)", fade: 76 },
    ],
  },

  // ── Осьминог ──────────────────────────────────────────────────────────────
  // Глубокий синий по центру сегмента.
  osminog: {
    stops: [
      { at: 7, color: "#080a0e" },
      { at: 28, color: "#070b16" },
      { at: 52, color: "#060c1a" },
      { at: 76, color: "#070b16" },
      { at: 100, color: "#060810" },
    ],
    accents: [
      { x: 50, y: 28, w: 720, h: 360, color: "rgba(96, 178, 255, 0.04)", fade: 74 },
      { x: 50, y: 52, w: 1040, h: 500, color: "rgba(36, 84, 255, 0.08)", fade: 70 },
      { x: 50, y: 88, w: 1100, h: 520, color: "rgba(10, 50, 170, 0.06)", fade: 74 },
    ],
  },
};

// ── ShowcaseBackdrop ─────────────────────────────────────────────────────────

export class ShowcaseBackdrop {
  private _host: HTMLElement;
  private _sections: ShowcaseBackdropSection[];
  private _rootEl: HTMLDivElement;
  private _resizeObserver: ResizeObserver | null = null;
  private _rafId = 0;

  constructor(options: ShowcaseBackdropOptions) {
    this._host = options.host;
    this._sections = options.sections;
    this._rootEl = document.createElement("div");
    this._rootEl.className = "showcase__backdrop";

    this._host.prepend(this._rootEl);
    this._startObservers();
    this.refresh();
  }

  refresh(): void {
    const metrics = this._getSectionMetrics();
    if (metrics.length === 0) return;

    const totalHeight = Math.max(
      this._host.scrollHeight,
      metrics[metrics.length - 1].bottom,
    );

    this._rootEl.style.height = `${totalHeight}px`;
    this._rootEl.style.backgroundImage = this._buildSuperGradient(metrics, totalHeight);
  }

  dispose(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    window.removeEventListener("resize", this._scheduleRefresh);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._rootEl.remove();
  }

  private _startObservers(): void {
    this._resizeObserver = new ResizeObserver(() => {
      this._scheduleRefresh();
    });
    this._resizeObserver.observe(this._host);
    for (const section of this._sections) {
      this._resizeObserver.observe(section.el);
    }
    window.addEventListener("resize", this._scheduleRefresh, { passive: true });
  }

  private _scheduleRefresh = (): void => {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      this.refresh();
    });
  };

  private _getSectionMetrics(): SectionMetric[] {
    return this._sections
      .map((s) => ({
        key: s.key,
        top: s.el.offsetTop,
        height: s.el.offsetHeight,
        bottom: s.el.offsetTop + s.el.offsetHeight,
      }))
      .filter((m) => m.height > 0);
  }

  private _buildSuperGradient(metrics: SectionMetric[], totalHeight: number): string {
    const layers: string[] = [];

    for (const m of metrics) {
      const design = DESIGNS[m.key];
      if (!design) continue;
      for (const a of design.accents) {
        const cy = this._toGlobalPct(m, totalHeight, a.y);
        layers.push(
          `radial-gradient(${a.w}px ${a.h}px at ${a.x}% ${cy}, ${a.color}, transparent ${a.fade}%)`,
        );
      }
    }

    const allStops: Array<{ pct: number; color: string }> = [];
    for (const m of metrics) {
      const design = DESIGNS[m.key];
      if (!design) continue;
      for (const s of design.stops) {
        const globalY = m.top + (m.height * s.at) / 100;
        allStops.push({ pct: (globalY / totalHeight) * 100, color: s.color });
      }
    }
    allStops.sort((a, b) => a.pct - b.pct);

    const stopStr = allStops
      .map((s) => `${s.color} ${s.pct.toFixed(3)}%`)
      .join(", ");
    layers.push(`linear-gradient(180deg, ${stopStr})`);

    return layers.join(", ");
  }

  private _toGlobalPct(m: SectionMetric, totalHeight: number, localPct: number): string {
    const globalY = m.top + (m.height * localPct) / 100;
    return `${((globalY / totalHeight) * 100).toFixed(3)}%`;
  }
}
