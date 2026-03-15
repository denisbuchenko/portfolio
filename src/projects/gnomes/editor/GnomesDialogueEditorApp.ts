import cytoscape, { type Core, type ElementDefinition, type EventObjectNode } from "cytoscape";
import dagre from "cytoscape-dagre";
import edgehandles from "cytoscape-edgehandles";

import { loadAllDialogues } from "../dialogue/loadDialogues";
import type { DialogueData, DialoguePlayerOption, DialogueReply } from "../dialogue/types";
import type { EditorReplyRef } from "./model";
import { buildAllGraphElements, buildCharacterIndex, buildGraphElements, cloneDialogueData, ensureOptionUid, parseList } from "./model";

cytoscape.use(dagre as any);
cytoscape.use(edgehandles as any);

type Selected =
  | { kind: "none" }
  | { kind: "reply"; characterId: string; replyId: string; graphId: string };

const ALL_GNOMES_ID = "__all__";

export class GnomesDialogueEditorApp {
  private _host: HTMLElement;
  private _toolbar!: HTMLDivElement;
  private _sidebar!: HTMLDivElement;
  private _graphEl!: HTMLDivElement;
  private _selectionEl!: HTMLDivElement;
  private _editEl!: HTMLDivElement;

  private _characterSelect!: HTMLSelectElement;
  private _actFilter!: HTMLSelectElement;
  private _btnLayout!: HTMLButtonElement;
  private _btnFit!: HTMLButtonElement;
  private _btnExport!: HTMLButtonElement;
  private _btnExportAll!: HTMLButtonElement;
  private _btnMenu!: HTMLButtonElement;

  private _cy: Core | null = null;
  private _onResize = () => {
    // Cytoscape не всегда сам понимает, что контейнер сменил размеры.
    // resize() + fit() делает поведение более предсказуемым.
    const cy = this._cy;
    if (!cy) return;
    cy.resize();
  };

  // Middle-mouse panning (dragging the canvas no matter what's under cursor)
  private _mm = {
    active: false,
    lastX: 0,
    lastY: 0,
  };

  private _onMiddleDown = (e: MouseEvent) => {
    if (e.button !== 1) return;
    // Prevent scroll / autoscroll.
    e.preventDefault();
    this._mm.active = true;
    this._mm.lastX = e.clientX;
    this._mm.lastY = e.clientY;
  };

  private _onMiddleMove = (e: MouseEvent) => {
    if (!this._mm.active) return;
    const cy = this._cy;
    if (!cy) return;
    e.preventDefault();
    const dx = e.clientX - this._mm.lastX;
    const dy = e.clientY - this._mm.lastY;
    this._mm.lastX = e.clientX;
    this._mm.lastY = e.clientY;
    // Cytoscape pan is in rendered pixels.
    const p = cy.pan();
    cy.pan({ x: p.x + dx, y: p.y + dy });
  };

  private _onMiddleUp = (e: MouseEvent) => {
    if (e.button !== 1) return;
    if (!this._mm.active) return;
    e.preventDefault();
    this._mm.active = false;
  };

  private _onAuxClick = (e: MouseEvent) => {
    // Avoid browser auto-scroll icon on middle click.
    if (e.button === 1) e.preventDefault();
  };
  private _all: DialogueData[] = [];
  private _activeId: string = "horogran";
  private _actFilterValue: "all" | "1" | "2" | "3" = "all";

  private _selected: Selected = { kind: "none" };

  private _compoundDrag:
    | {
        active: true;
        start: { x: number; y: number };
        movedNodeIds: string[];
        startPos: Record<string, { x: number; y: number }>;
      }
    | { active: false } = { active: false };

  constructor(opts: { host: HTMLElement }) {
    this._host = opts.host;
    this._initDom();

    this._all = loadAllDialogues().map((d) => cloneDialogueData(d));

    const firstId = this._all[0]?.characterId;
    if (firstId) this._activeId = firstId;

    this._fillCharacterSelect();
    this._bindToolbar();
    this._render();

    window.addEventListener("resize", this._onResize);
    // Middle mouse panning: attach to window so it works "everywhere".
    window.addEventListener("mousedown", this._onMiddleDown, { passive: false });
    window.addEventListener("mousemove", this._onMiddleMove, { passive: false });
    window.addEventListener("mouseup", this._onMiddleUp, { passive: false });
    window.addEventListener("auxclick", this._onAuxClick, { passive: false });
  }

  dispose(): void {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("mousedown", this._onMiddleDown);
    window.removeEventListener("mousemove", this._onMiddleMove);
    window.removeEventListener("mouseup", this._onMiddleUp);
    window.removeEventListener("auxclick", this._onAuxClick);
    this._cy?.destroy();
    this._cy = null;
    this._host.innerHTML = "";
  }

  private _initDom(): void {
    this._host.innerHTML = "";
    this._host.classList.add("dialogue-editor");

    this._toolbar = document.createElement("div");
    this._toolbar.className = "dialogue-editor__toolbar";
    this._host.appendChild(this._toolbar);

    const main = document.createElement("div");
    main.className = "dialogue-editor__main";
    this._host.appendChild(main);

    this._sidebar = document.createElement("div");
    this._sidebar.className = "dialogue-editor__sidebar";
    main.appendChild(this._sidebar);

    this._graphEl = document.createElement("div");
    this._graphEl.className = "dialogue-editor__graph";
    main.appendChild(this._graphEl);

    this._toolbar.innerHTML = `
      <div class="dialogue-editor__toolbar-left">
        <div class="dialogue-editor__title">Gnomes • Dialogue Graph Editor</div>
        <label class="dialogue-editor__label">
          Гном
          <select id="dialogue-editor-character" class="dialogue-editor__select"></select>
        </label>
        <label class="dialogue-editor__label">
          Акт
          <select id="dialogue-editor-act" class="dialogue-editor__select">
            <option value="all">Все</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
      </div>
      <div class="dialogue-editor__toolbar-right">
        <button id="dialogue-editor-layout" class="btn" type="button">Layout</button>
        <button id="dialogue-editor-fit" class="btn" type="button">Показать всё</button>
        <button id="dialogue-editor-export" class="btn" type="button">Экспорт JSON</button>
        <button id="dialogue-editor-export-all" class="btn" type="button">Экспорт всех</button>
        <button id="dialogue-editor-menu" class="btn" type="button">В меню</button>
      </div>
    `;

    this._characterSelect = this._toolbar.querySelector("#dialogue-editor-character") as HTMLSelectElement;
    this._actFilter = this._toolbar.querySelector("#dialogue-editor-act") as HTMLSelectElement;
    this._btnLayout = this._toolbar.querySelector("#dialogue-editor-layout") as HTMLButtonElement;
    this._btnFit = this._toolbar.querySelector("#dialogue-editor-fit") as HTMLButtonElement;
    this._btnExport = this._toolbar.querySelector("#dialogue-editor-export") as HTMLButtonElement;
    this._btnExportAll = this._toolbar.querySelector("#dialogue-editor-export-all") as HTMLButtonElement;
    this._btnMenu = this._toolbar.querySelector("#dialogue-editor-menu") as HTMLButtonElement;

    this._sidebar.innerHTML = `
      <div class="dialogue-editor__panel">
        <div class="dialogue-editor__panel-title">Создать реплику</div>
        <div id="dialogue-editor-create" class="dialogue-editor__panel-body"></div>
      </div>
      <div class="dialogue-editor__panel">
        <div class="dialogue-editor__panel-title">Выбор</div>
        <div id="dialogue-editor-selection" class="dialogue-editor__panel-body"></div>
      </div>
      <div class="dialogue-editor__panel">
        <div class="dialogue-editor__panel-title">Редактирование</div>
        <div id="dialogue-editor-edit" class="dialogue-editor__panel-body"></div>
      </div>
      <div class="dialogue-editor__panel">
        <div class="dialogue-editor__panel-title">Подсказка</div>
        <div class="dialogue-editor__panel-body dialogue-editor__hint">
          - <b>Pan</b>: зажми колёсико мыши и тащи (работает везде)<br/>
          - <b>Zoom</b>: колесо мыши<br/>
          - <b>Перетаскивание</b>: тащи реплики (маленькие ноды внутри узлов)<br/>
          - <b>Редактирование</b>: кликай по реплике — справа всё редактируется в одном месте<br/>
          - <b>Стрелки</b>: только визуализация, клики по ним не нужны<br/>
        </div>
      </div>
    `;

    this._selectionEl = this._sidebar.querySelector("#dialogue-editor-selection") as HTMLDivElement;
    this._editEl = this._sidebar.querySelector("#dialogue-editor-edit") as HTMLDivElement;
  }

  private _fillCharacterSelect(): void {
    this._characterSelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = ALL_GNOMES_ID;
    allOpt.textContent = "Все гномы (один холст)";
    this._characterSelect.appendChild(allOpt);
    for (const d of this._all) {
      const opt = document.createElement("option");
      opt.value = d.characterId;
      opt.textContent = d.characterInfo?.name ? `${d.characterInfo.name} (${d.characterId})` : d.characterId;
      this._characterSelect.appendChild(opt);
    }
    this._characterSelect.value = this._activeId;
  }

  private _bindToolbar(): void {
    this._characterSelect.addEventListener("change", () => {
      this._activeId = this._characterSelect.value;
      this._selected = { kind: "none" };
      this._render();
    });

    this._actFilter.addEventListener("change", () => {
      this._actFilterValue = this._actFilter.value as typeof this._actFilterValue;
      this._selected = { kind: "none" };
      this._render();
    });

    this._btnLayout.addEventListener("click", () => this._layout());
    this._btnFit.addEventListener("click", () => this._fit());
    this._btnExport.addEventListener("click", () => this._exportActive());
    this._btnExportAll.addEventListener("click", () => this._exportAll());
    this._btnMenu.addEventListener("click", () => window.location.reload());
  }

  private _getActive(): DialogueData {
    const d = this._all.find((x) => x.characterId === this._activeId);
    if (!d) throw new Error(`Dialogue not found: ${this._activeId}`);
    return d;
  }

  private _getCharacter(characterId: string): DialogueData {
    const d = this._all.find((x) => x.characterId === characterId);
    if (!d) throw new Error(`Dialogue not found: ${characterId}`);
    return d;
  }

  private _isAllMode(): boolean {
    return this._activeId === ALL_GNOMES_ID;
  }

  private _render(): void {
    const isAll = this._isAllMode();

    const includeActs =
      this._actFilterValue === "all" ? undefined : [Number(this._actFilterValue)].filter((n) => Number.isFinite(n));
    const el = isAll
      ? buildAllGraphElements(this._all, { includeActs })
      : (() => {
          const active = this._getActive();
          const idx = buildCharacterIndex(active);
          return buildGraphElements(active, idx, { includeActs });
        })();

    this._cy?.destroy();
    this._cy = cytoscape({
      container: this._graphEl,
      elements: [...(el.nodes as unknown as ElementDefinition[]), ...(el.edges as unknown as ElementDefinition[])],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#1b2436",
            label: "data(label)",
            color: "rgba(255,255,255,0.86)",
            "font-size": 8,
            "text-wrap": "wrap",
            "text-max-width": 140,
            "text-valign": "center",
            "text-halign": "center",
            shape: "round-rectangle",
            width: 170,
            height: 60,
            "border-width": 1,
            "border-color": "rgba(255,255,255,0.10)",
          },
        },
        {
          selector: 'node[kind = "act"]',
          style: {
            "background-color": "rgba(167,139,250,0.08)",
            "border-color": "rgba(167,139,250,0.42)",
            "border-width": 2,
            "text-valign": "top",
            "text-halign": "left",
            "font-size": 11,
            "text-margin-x": 10,
            "text-margin-y": 10,
            padding: 18,
          },
        },
        {
          selector: 'node[kind = "character"]',
          style: {
            "background-color": "rgba(10, 12, 18, 0.18)",
            "border-color": "rgba(110,231,255,0.55)",
            "border-width": 3,
            "border-style": "dashed",
            "text-valign": "top",
            "text-halign": "left",
            "font-size": 12,
            "text-margin-x": 12,
            "text-margin-y": 12,
            padding: 22,
          },
        },
        {
          selector: 'node[kind = "node"]',
          style: {
            "background-color": "rgba(110,231,255,0.04)",
            "border-color": "rgba(110,231,255,0.28)",
            "border-width": 1.5,
            "text-valign": "top",
            "text-halign": "left",
            "font-size": 9,
            "text-margin-x": 10,
            "text-margin-y": 10,
            padding: 14,
          },
        },
        {
          selector: 'node[kind = "end"]',
          style: {
            "background-color": "rgba(255,255,255,0.06)",
            "border-color": "rgba(255,255,255,0.18)",
            width: 120,
            height: 50,
            "font-size": 10,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "rgba(255,255,255,0.24)",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "rgba(255,255,255,0.24)",
            label: "data(label)",
            "font-size": 8,
            color: "rgba(255,255,255,0.72)",
            "text-wrap": "wrap",
            "text-max-width": 220,
            "text-background-color": "rgba(10, 12, 18, 0.72)",
            "text-background-opacity": 1,
            "text-background-padding": 3,
            "text-border-color": "rgba(255,255,255,0.12)",
            "text-border-width": 1,
            "text-border-opacity": 1,
          },
        },
        // Стрелки — чисто визуальные: клики/выбор через них не делаем.
        {
          selector: "edge",
          style: {
            events: "no",
          },
        },
        {
          selector: "edge[requiredCount > 0]",
          style: {
            "line-color": "rgba(255, 168, 70, 0.55)",
            "target-arrow-color": "rgba(255, 168, 70, 0.55)",
          },
        },
        {
          selector: "edge[grantsCount > 0]",
          style: {
            "line-color": "rgba(80, 220, 140, 0.55)",
            "target-arrow-color": "rgba(80, 220, 140, 0.55)",
          },
        },
        {
          selector: ":selected",
          style: {
            "border-color": "rgba(110,231,255,0.9)",
            "border-width": 2,
            "line-color": "rgba(110,231,255,0.75)",
            "target-arrow-color": "rgba(110,231,255,0.75)",
          },
        },
      ] as any,
      // Всегда стартуем с дефолтной раскладки.
      layout: ({ name: "dagre", rankDir: isAll ? "TB" : "LR", nodeSep: 40, rankSep: 90, padding: 80, spacingFactor: 1.1 } as any),
      maxZoom: 2.2,
      // В all-mode граф существенно больше, поэтому разрешаем сильнее отдаляться.
      minZoom: isAll ? 0.02 : 0.12,
    });

    // Bind events and sidebar: in all-mode sidebar is driven by selection and per-character indexes.
    this._bindCy();
    this._renderSidebar();

    // После initial layout применим сохранённые позиции/pan/zoom.
    const cy = this._cy;
    if (cy) {
      cy.ready(() => {
        try {
        cy.resize();
        if (isAll) {
          try {
            cy.zoom(1);
            cy.pan({ x: 0, y: 0 });
          } catch {
            // ignore
          }
          requestAnimationFrame(() => this._fit());
        } else {
          this._maybeAutoFit();
        }
        } catch {
          // ignore
        }
      });
    }
  }

  private _fit(): void {
    const cy = this._cy;
    if (!cy) return;
    try {
      // fit по nodes, чтобы огромные текстовые bbox на edges не ломали масштаб.
      cy.fit(cy.nodes(), 90);
    } catch {
      // ignore
    }
  }

  private _maybeAutoFit(): void {
    const cy = this._cy;
    if (!cy) return;
    const els = cy.elements();
    if (els.length === 0) return;
    const bb = els.boundingBox({ includeLabels: true });
    const vp = cy.extent(); // viewport box in model coords

    // Если вообще не пересекается — значит, контент "улетел".
    const noOverlap = bb.x2 < vp.x1 || bb.x1 > vp.x2 || bb.y2 < vp.y1 || bb.y1 > vp.y2;
    if (noOverlap) this._fit();
  }

  // NOTE: ранее тут была кастомная расстановка слева-направо.
  // Убрали её, потому что она легко приводит к "пустому" экрану при сочетании compound nodes + сохранённого viewport.

  private _bindCy(): void {
    const cy = this._cy;
    if (!cy) return;

    cy.on("select", "node", (e: EventObjectNode) => {
      const n = e.target;
      const kind = n.data("kind") as string;
      if (kind === "reply") {
        const characterId = (n.data("characterId") as string | undefined) ?? this._activeId;
        const replyId = (n.data("replyId") as string | undefined) ?? n.id();
        this._selected = { kind: "reply", characterId, replyId, graphId: n.id() };
      } else {
        this._selected = { kind: "none" };
      }
      this._renderSidebar();
    });

    cy.on("unselect", () => {
      // cytoscape шлёт unselect на каждый элемент — будем пересчитывать через requestAnimationFrame.
      requestAnimationFrame(() => {
        if (!cy) return;
        if (cy.$(":selected").length === 0) {
          this._selected = { kind: "none" };
          this._renderSidebar();
        }
      });
    });

    // После перетаскивания просто обновим сайдбар (persist отключён).
    cy.on("dragfree", 'node[kind = "reply"]', () => {
      this._renderSidebar();
    });

    // Compound drag: move a whole subtree together (character / act / node containers).
    const compoundSelector = 'node[kind = "character"], node[kind = "act"], node[kind = "node"]';

    cy.on("grab", compoundSelector, (e) => {
      const n = e.target;
      // Only act on compounds with descendants.
      const desc = n.descendants();
      if (desc.empty()) return;
      const movable = desc.filter('node[kind = "reply"], node[kind = "end"]');
      const ids = movable.map((x: any) => x.id());
      const startPos: Record<string, { x: number; y: number }> = {};
      for (const id of ids) {
        const nn = cy.getElementById(id);
        const p = nn.position();
        startPos[id] = { x: p.x, y: p.y };
      }
      this._compoundDrag = {
        active: true,
        start: { x: e.position.x, y: e.position.y },
        movedNodeIds: ids,
        startPos,
      };
    });

    cy.on("drag", compoundSelector, (e) => {
      if (!this._compoundDrag.active) return;
      const dx = e.position.x - this._compoundDrag.start.x;
      const dy = e.position.y - this._compoundDrag.start.y;
      for (const id of this._compoundDrag.movedNodeIds) {
        const nn = cy.getElementById(id);
        const sp = this._compoundDrag.startPos[id];
        if (!sp) continue;
        nn.position({ x: sp.x + dx, y: sp.y + dy });
      }
    });

    cy.on("free", compoundSelector, () => {
      if (!this._compoundDrag.active) return;
      this._renderSidebar();
      this._compoundDrag = { active: false };
    });
  }

  private _renderSidebar(): void {
    const selEl = this._selectionEl;
    const editEl = this._editEl;

    const isAll = this._isAllMode();
    selEl.innerHTML = `
      <div class="dialogue-editor__kv"><span>Режим</span><b>${isAll ? "Все гномы" : "Один гном"}</b></div>
      <div class="dialogue-editor__kv"><span>Выбрано</span><b>${this._selected.kind}</b></div>
    `;

    this._renderCreatePanel();

    if (this._selected.kind === "reply") {
      const character = this._getCharacter(this._selected.characterId);
      const idx = buildCharacterIndex(character);
      const ref = idx.replyById.get(this._selected.replyId);
      if (!ref) {
        editEl.textContent = "Реплика не найдена.";
        return;
      }
      editEl.innerHTML = this._renderReplyForm(ref.reply, ref);
      this._bindReplyForm(character, idx, ref);
      return;
    }

    editEl.innerHTML = `
      <div class="dialogue-editor__muted">
        Выбери реплику на графе, чтобы редактировать.<br/><br/>
        Цвет ребра — подсказка:<br/>
        - оранжевый: <b>замок</b> (requiredKnowledge)<br/>
        - зелёный: <b>ключ</b> (grantsKnowledge)
      </div>
    `;
  }

  private _renderCreatePanel(): void {
    const root = this._sidebar.querySelector("#dialogue-editor-create") as HTMLDivElement;
    const isAll = this._isAllMode();
    const activeCharacter = isAll ? this._all[0] : this._getActive();
    const acts = (activeCharacter.dialogueTree ?? []).slice().sort((a, b) => a.act - b.act);
    const actOpts = acts
      .map((a) => `<option value="${a.act}">Акт ${a.act}: ${escapeHtml(a.actTitle)}</option>`)
      .join("");

    const charOpts = this._all
      .map(
        (d) =>
          `<option value="${escapeAttr(d.characterId)}">${
            d.characterInfo?.name ? `${escapeHtml(d.characterInfo.name)} (${escapeHtml(d.characterId)})` : escapeHtml(d.characterId)
          }</option>`
      )
      .join("");

    root.innerHTML = `
      ${
        isAll
          ? `<label class="dialogue-editor__field">
              <div class="dialogue-editor__field-title">Гном</div>
              <select id="ed-create-character" class="dialogue-editor__select">${charOpts}</select>
            </label>`
          : ""
      }
      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">Акт</div>
        <select id="ed-create-act" class="dialogue-editor__select">${actOpts}</select>
      </label>
      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">Узел (nodeId)</div>
        <select id="ed-create-node" class="dialogue-editor__select"></select>
      </label>
      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">replyId</div>
        <input id="ed-create-replyid" class="dialogue-editor__input" placeholder="например sh_a1n1_r999" />
      </label>
      <button id="ed-create-btn" class="btn" type="button" style="margin-top:10px;">Создать пустую реплику</button>
      <div class="dialogue-editor__muted" style="margin-top:8px;">
        Реплика создаётся внутри выбранного nodeId. Потом кликаешь по ней и добавляешь варианты ответов.
      </div>
    `;

    const selChar = root.querySelector("#ed-create-character") as HTMLSelectElement | null;
    const selAct = root.querySelector("#ed-create-act") as HTMLSelectElement;
    const selNode = root.querySelector("#ed-create-node") as HTMLSelectElement;
    const inId = root.querySelector("#ed-create-replyid") as HTMLInputElement;
    const btn = root.querySelector("#ed-create-btn") as HTMLButtonElement;

    const fillNodes = () => {
      const character = selChar ? this._getCharacter(selChar.value) : activeCharacter;
      const actNum = Number(selAct.value);
      const localActs = (character.dialogueTree ?? []).slice().sort((a, b) => a.act - b.act);
      const act = localActs.find((a) => a.act === actNum) ?? localActs[0];
      const nodes = (act?.nodes ?? []).slice();
      selNode.innerHTML = nodes
        .map((n) => `<option value="${escapeAttr(n.nodeId)}">${escapeHtml(n.nodeType)} • ${escapeHtml(n.nodeId)}</option>`)
        .join("");
    };
    fillNodes();
    selAct.addEventListener("change", () => fillNodes());
    selChar?.addEventListener("change", () => fillNodes());

    btn.addEventListener("click", () => {
      const character = selChar ? this._getCharacter(selChar.value) : activeCharacter;
      const actNum = Number(selAct.value);
      const nodeId = selNode.value;
      const replyId = inId.value.trim();
      if (!replyId) {
        alert("replyId обязателен.");
        return;
      }
      const idx = buildCharacterIndex(character);
      if (idx.replyById.has(replyId)) {
        alert("Такой replyId уже существует.");
        return;
      }
      const act = character.dialogueTree.find((a) => a.act === actNum);
      if (!act) {
        alert("Акт не найден.");
        return;
      }
      const node = act.nodes.find((n) => n.nodeId === nodeId);
      if (!node) {
        alert("Узел (nodeId) не найден.");
        return;
      }
      const reply: DialogueReply = { id: replyId, text: "", narration: "", playerOptions: [] };
      node.replies.push(reply);
      const graphId = this._isAllMode() ? `${character.characterId}::${replyId}` : replyId;
      this._selected = { kind: "reply", characterId: character.characterId, replyId, graphId };
      this._render();
    });
  }

  private _renderReplyForm(
    reply: DialogueReply,
    ref: { act: number; nodeId: string; nodeType: string; actTitle: string }
  ): string {
    const narration = (reply.narration ?? "").toString();
    const text = (reply.text ?? "").toString();
    const grants = (reply.grantsKnowledge ?? []).join("\n");
    const opts = reply.playerOptions ?? [];
    const optionsHtml =
      opts.length === 0
        ? `<div class="dialogue-editor__muted">Вариантов ответа пока нет.</div>`
        : opts.map((o, i) => this._renderOptionInline(o, i)).join("");
    return `
      <div class="dialogue-editor__kv"><span>act</span><b>${ref.act}</b></div>
      <div class="dialogue-editor__kv"><span>actTitle</span><b>${escapeHtml(ref.actTitle)}</b></div>
      <div class="dialogue-editor__kv"><span>node</span><b>${ref.nodeType} • ${ref.nodeId}</b></div>
      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">replyId (переименование безопасно)</div>
        <div class="dialogue-editor__row" style="margin-top:0;">
          <input id="ed-reply-id" class="dialogue-editor__input" value="${escapeAttr(reply.id)}" />
          <button id="ed-reply-rename" class="btn" type="button">Переименовать</button>
        </div>
      </label>

      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">narration</div>
        <textarea id="ed-reply-narration" class="dialogue-editor__textarea" rows="5">${escapeHtml(
          narration
        )}</textarea>
      </label>

      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">text</div>
        <textarea id="ed-reply-text" class="dialogue-editor__textarea" rows="8">${escapeHtml(text)}</textarea>
      </label>

      <label class="dialogue-editor__field">
        <div class="dialogue-editor__field-title">grantsKnowledge (на реплике)</div>
        <textarea id="ed-reply-grants" class="dialogue-editor__textarea" rows="3">${escapeHtml(
          grants
        )}</textarea>
      </label>

      <div class="dialogue-editor__row">
        <label class="dialogue-editor__check">
          <input id="ed-reply-final" type="checkbox" ${reply.isFinal ? "checked" : ""} />
          isFinal
        </label>
        <label class="dialogue-editor__check">
          <input id="ed-reply-silent" type="checkbox" ${reply.isSilent ? "checked" : ""} />
          isSilent
        </label>
      </div>

      <div class="dialogue-editor__divider"></div>
      <div class="dialogue-editor__section-title">Варианты ответа</div>
      ${optionsHtml}

      <button id="ed-reply-add-option" class="btn" type="button" style="margin-top:10px;">+ Добавить вариант</button>

      <div class="dialogue-editor__divider"></div>
      <div class="dialogue-editor__section-title">Операции</div>
      <button id="ed-reply-add-child" class="btn" type="button">Новая реплика (дочерняя)</button>
      <button id="ed-reply-delete" class="btn" type="button" style="margin-top:8px;">Удалить реплику</button>
    `;
  }

  private _renderOptionInline(opt: DialoguePlayerOption, index: number): string {
    const uid = ensureOptionUid(opt);
    const required = (opt.requiredKnowledge ?? []).join("\n");
    const grants = (opt.grantsKnowledge ?? []).join("\n");
    const lockMode = opt.lockMode ?? "hide";
    const lockHint = opt.lockHint ?? "";
    const badge = _badge(opt);
    return `
      <div class="dialogue-editor__opt" data-opt="${escapeAttr(uid)}">
        <div class="dialogue-editor__opt-head">
          <div class="dialogue-editor__opt-badge ${badge.cls}">${badge.text}</div>
          <div class="dialogue-editor__opt-title">Вариант #${index + 1}</div>
          <button class="btn dialogue-editor__opt-del" type="button">Удалить</button>
        </div>

        <label class="dialogue-editor__field">
          <div class="dialogue-editor__field-title">Ответ (text)</div>
          <textarea class="dialogue-editor__textarea opt-text" rows="2">${escapeHtml(opt.text ?? "")}</textarea>
        </label>

        <label class="dialogue-editor__field">
          <div class="dialogue-editor__field-title">Куда ведёт (nextReplyId)</div>
          <div class="dialogue-editor__row" style="margin-top:0;">
            <select class="dialogue-editor__select opt-next"></select>
            <label class="dialogue-editor__check" style="margin-left:auto;">
              <input class="opt-end" type="checkbox" ${opt.nextReplyId === null ? "checked" : ""} />
              END акта
            </label>
          </div>
        </label>

        <label class="dialogue-editor__field">
          <div class="dialogue-editor__field-title">requiredKnowledge (замок)</div>
          <textarea class="dialogue-editor__textarea opt-required" rows="2">${escapeHtml(required)}</textarea>
        </label>

        <label class="dialogue-editor__field">
          <div class="dialogue-editor__field-title">lockMode / lockHint</div>
          <div class="dialogue-editor__row" style="margin-top:0;">
            <select class="dialogue-editor__select opt-lockmode">
              <option value="hide" ${lockMode === "hide" ? "selected" : ""}>hide</option>
              <option value="disable" ${lockMode === "disable" ? "selected" : ""}>disable</option>
            </select>
          </div>
          <textarea class="dialogue-editor__textarea opt-lockhint" rows="2">${escapeHtml(lockHint)}</textarea>
        </label>

        <label class="dialogue-editor__field">
          <div class="dialogue-editor__field-title">grantsKnowledge (ключ)</div>
          <textarea class="dialogue-editor__textarea opt-grants" rows="2">${escapeHtml(grants)}</textarea>
        </label>
      </div>
    `;
  }

  private _bindReplyForm(active: DialogueData, idx: ReturnType<typeof buildCharacterIndex>, ref: EditorReplyRef): void {
    const editEl = this._editEl;
    const reply = ref.reply;
    const inId = editEl.querySelector("#ed-reply-id") as HTMLInputElement;
    const btnRename = editEl.querySelector("#ed-reply-rename") as HTMLButtonElement;
    const taNarr = editEl.querySelector("#ed-reply-narration") as HTMLTextAreaElement;
    const taText = editEl.querySelector("#ed-reply-text") as HTMLTextAreaElement;
    const taGrants = editEl.querySelector("#ed-reply-grants") as HTMLTextAreaElement;
    const chFinal = editEl.querySelector("#ed-reply-final") as HTMLInputElement;
    const chSilent = editEl.querySelector("#ed-reply-silent") as HTMLInputElement;
    const btnAdd = editEl.querySelector("#ed-reply-add-option") as HTMLButtonElement;
    const btnAddChild = editEl.querySelector("#ed-reply-add-child") as HTMLButtonElement;
    const btnDelete = editEl.querySelector("#ed-reply-delete") as HTMLButtonElement;

    const fillAllNextSelects = () => {
      const freshIdx = buildCharacterIndex(active);
      const all = freshIdx.allReplyIds;
      const selects = editEl.querySelectorAll("select.opt-next");
      for (const s of selects) {
        const sel = s as HTMLSelectElement;
        const cur = sel.getAttribute("data-cur") ?? "";
        sel.innerHTML = `<option value="">(выбери реплику)</option>` + all.map((id) => {
          const selAttr = id === cur ? "selected" : "";
          return `<option value="${escapeAttr(id)}" ${selAttr}>${escapeHtml(id)}</option>`;
        }).join("");
      }
    };

    const commit = () => {
      reply.narration = taNarr.value || undefined;
      reply.text = taText.value || undefined;
      reply.grantsKnowledge = parseList(taGrants.value);
      reply.isFinal = chFinal.checked || undefined;
      reply.isSilent = chSilent.checked || undefined;

      this._updateReplyNode(active.characterId, reply);
    };

    for (const el of [taNarr, taText, taGrants]) el.addEventListener("input", () => commit());
    for (const el of [chFinal, chSilent]) el.addEventListener("change", () => commit());

    btnRename.addEventListener("click", () => {
      const nextId = inId.value.trim();
      if (!nextId) {
        alert("replyId не может быть пустым.");
        inId.value = reply.id;
        return;
      }
      if (nextId === reply.id) return;
      const freshIdx = buildCharacterIndex(active);
      if (freshIdx.replyById.has(nextId)) {
        alert("Такой replyId уже существует.");
        inId.value = reply.id;
        return;
      }

      const oldId = reply.id;
      reply.id = nextId;
      const newGraphId = this._isAllMode() ? `${active.characterId}::${nextId}` : nextId;

      // Обновляем все ссылки nextReplyId по всему диалогу персонажа.
      for (const r of freshIdx.replyById.values()) {
        const opts = r.reply.playerOptions ?? [];
        for (const o of opts) if (o.nextReplyId === oldId) o.nextReplyId = nextId;
      }

      this._selected = { kind: "reply", characterId: active.characterId, replyId: nextId, graphId: newGraphId };
      this._render();
    });

    // Options list bindings
    const optEls = editEl.querySelectorAll(".dialogue-editor__opt");
    for (const el of optEls) {
      const wrap = el as HTMLDivElement;
      const uid = wrap.getAttribute("data-opt") ?? "";
      const option = (reply.playerOptions ?? []).find((o) => ensureOptionUid(o) === uid);
      if (!option) continue;

      const taOptText = wrap.querySelector(".opt-text") as HTMLTextAreaElement;
      const selNext = wrap.querySelector(".opt-next") as HTMLSelectElement;
      const chEnd = wrap.querySelector(".opt-end") as HTMLInputElement;
      const taReq = wrap.querySelector(".opt-required") as HTMLTextAreaElement;
      const selMode = wrap.querySelector(".opt-lockmode") as HTMLSelectElement;
      const taHint = wrap.querySelector(".opt-lockhint") as HTMLTextAreaElement;
      const taGrant = wrap.querySelector(".opt-grants") as HTMLTextAreaElement;
      const btnDel = wrap.querySelector(".dialogue-editor__opt-del") as HTMLButtonElement;

      // Fill select options with current.
      selNext.setAttribute("data-cur", option.nextReplyId ?? "");
      fillAllNextSelects();
      if (option.nextReplyId) selNext.value = option.nextReplyId;

      const commitOpt = () => {
        option.text = taOptText.value;
        option.requiredKnowledge = parseList(taReq.value);
        option.lockMode = (selMode.value as "hide" | "disable") || undefined;
        option.lockHint = taHint.value || undefined;
        option.grantsKnowledge = parseList(taGrant.value);

        if (chEnd.checked) {
          option.nextReplyId = null;
        } else {
          option.nextReplyId = selNext.value ? selNext.value : null;
        }

        // Обновляем edge без полного перерендера (чтобы не сбрасывать фокус при наборе).
        const cy = this._cy;
        if (cy) {
          const edgeId = `e_${uid}`;
          const edge = cy.getElementById(edgeId);
          if (edge && !edge.empty()) {
            const reqCount = option.requiredKnowledge?.length ?? 0;
            const grantCount = option.grantsKnowledge?.length ?? 0;
            edge.data("label", _optionLabel(option.text, reqCount, grantCount));
            edge.data("requiredCount", reqCount);
            edge.data("grantsCount", grantCount);
            const target = option.nextReplyId
              ? (this._isAllMode() ? `${active.characterId}::${option.nextReplyId}` : option.nextReplyId)
              : this._isAllMode()
                ? `${active.characterId}::end_${ref.act}`
                : `end_${ref.act}`;
            if (edge.target().id() !== target) {
              // move() может бросить если target не существует (например фильтр по акту).
              try {
                edge.move({ target });
              } catch {
                // fallback: full rerender
                this._render();
                return;
              }
            }
          }
        }
        // Badge update in UI
        const b = wrap.querySelector(".dialogue-editor__opt-badge") as HTMLDivElement | null;
        if (b) {
          const bb = _badge(option);
          b.textContent = bb.text;
          b.className = `dialogue-editor__opt-badge ${bb.cls}`;
        }
      };

      for (const t of [taOptText, taReq, taHint, taGrant]) t.addEventListener("input", () => commitOpt());
      for (const s of [selNext, selMode]) s.addEventListener("change", () => commitOpt());
      chEnd.addEventListener("change", () => commitOpt());

      btnDel.addEventListener("click", () => {
        if (!confirm("Удалить этот вариант ответа?")) return;
        const list = reply.playerOptions ?? [];
        const i = list.indexOf(option);
        if (i >= 0) list.splice(i, 1);
        this._render();
      });
    }

    btnAdd.addEventListener("click", () => {
      const cy = this._cy;
      if (!cy) return;

      // Создаём новый option с END по умолчанию (внутри текущего акта).
      const opt: DialoguePlayerOption = { text: "(новый вариант)", nextReplyId: null };
      (reply.playerOptions ??= []).push(opt);
      // rebuild graph to show new edge + option form
      this._render();
    });

    btnAddChild.addEventListener("click", () => {
      // Новая реплика в том же DialogueNode (act/node), + создаём переход из текущей реплики.
      const baseId = reply.id.replace(/_r\d+$/, "");
      const suggested = `${baseId}_r${Date.now().toString().slice(-5)}`;
      const newId = (prompt("ID новой реплики (уникальный):", suggested) || "").trim();
      if (!newId) return;
      if (idx.replyById.has(newId)) {
        alert("Такой replyId уже существует.");
        return;
      }

      const newReply: DialogueReply = { id: newId, text: "(новая реплика)", playerOptions: [] };
      (ref.node.replies ??= []).push(newReply);

      const opt: DialoguePlayerOption = { text: "(перейти)", nextReplyId: newId };
      (reply.playerOptions ??= []).push(opt);

      const graphId = this._isAllMode() ? `${active.characterId}::${newId}` : newId;
      this._selected = { kind: "reply", characterId: active.characterId, replyId: newId, graphId };
      this._render();
    });

    btnDelete.addEventListener("click", () => {
      if (!confirm(`Удалить реплику ${reply.id}? Все переходы на неё будут заменены на END.`)) return;

      // 1) Удаляем реплику из node.replies
      const list = ref.node.replies ?? [];
      const i = list.indexOf(reply);
      if (i >= 0) list.splice(i, 1);

      // 2) Чистим ссылки nextReplyId на неё во всём диалоге персонажа
      for (const r of idx.replyById.values()) {
        const opts = r.reply.playerOptions ?? [];
        for (const o of opts) {
          if (o.nextReplyId === reply.id) o.nextReplyId = null;
        }
      }

      this._selected = { kind: "none" };
      this._render();
    });
  }

  private _updateReplyNode(characterId: string, reply: DialogueReply): void {
    const cy = this._cy;
    if (!cy) return;
    const graphId = this._isAllMode() ? `${characterId}::${reply.id}` : reply.id;
    const n = cy.getElementById(graphId);
    if (!n || n.empty()) return;
    const text = this._replyPreviewText(reply);
    const cut = text.length > 44 ? `${text.slice(0, 44)}…` : text;
    const flags = [reply.isFinal ? "FINAL" : "", reply.isSilent ? "SILENT" : ""].filter(Boolean).join(" ");
    const label = flags ? `${reply.id}\n${flags}\n${cut}` : `${reply.id}\n${cut}`;
    n.data("label", label);
  }

  private _replyPreviewText(reply: DialogueReply): string {
    if (reply.parts && reply.parts.length > 0) {
      return reply.parts
        .map((part) => part.text.trim())
        .filter((part) => part.length > 0)
        .join(" ")
        .replace(/\s+/g, " ");
    }

    return [reply.narration ?? "", reply.text ?? ""]
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
  }

  private _layout(): void {
    const cy = this._cy;
    if (!cy) return;
    const isAll = this._isAllMode();
    cy.layout({ name: "dagre", rankDir: isAll ? "TB" : "LR", nodeSep: 40, rankSep: 90, padding: 80, spacingFactor: 1.1 } as any).run();
    if (isAll) requestAnimationFrame(() => this._fit());
    this._maybeAutoFit();
  }

  // Сохранение/загрузка через localStorage отключены намеренно.

  private _exportActive(): void {
    const active = this._getActive();
    const json = JSON.stringify(active, null, 2);
    const blob = new Blob([json + "\n"], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.characterId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private _exportAll(): void {
    // Браузеры могут ограничивать множественные скачивания — но для 3 файлов обычно ок.
    for (const d of this._all) {
      const json = JSON.stringify(d, null, 2);
      const blob = new Blob([json + "\n"], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${d.characterId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function _badge(opt: DialoguePlayerOption): { text: string; cls: string } {
  const req = opt.requiredKnowledge?.length ?? 0;
  const grant = opt.grantsKnowledge?.length ?? 0;
  if (req > 0 && grant > 0) return { text: `LOCK+KEY`, cls: "dialogue-editor__opt-badge--both" };
  if (req > 0) return { text: `LOCK`, cls: "dialogue-editor__opt-badge--lock" };
  if (grant > 0) return { text: `KEY`, cls: "dialogue-editor__opt-badge--key" };
  return { text: `OPEN`, cls: "dialogue-editor__opt-badge--open" };
}

function _optionLabel(text: string, requiredCount: number, grantsCount: number): string {
  const t = (text ?? "").trim();
  const meta: string[] = [];
  if (requiredCount > 0) meta.push(`req:${requiredCount}`);
  if (grantsCount > 0) meta.push(`grant:${grantsCount}`);
  return meta.length > 0 ? `${t}\n[${meta.join(" ")}]` : t;
}

