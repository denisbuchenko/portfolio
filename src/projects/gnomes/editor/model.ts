import type { DialogueAct, DialogueData, DialogueNode, DialoguePlayerOption, DialogueReply } from "../dialogue/types";

export type EditorReplyRef = {
  characterId: string;
  act: number;
  actTitle: string;
  actObj: DialogueAct;
  nodeId: string;
  nodeType: string;
  node: DialogueNode;
  reply: DialogueReply;
};

export type EditorOptionRef = {
  characterId: string;
  act: number;
  fromReplyId: string;
  option: DialoguePlayerOption;
};

const OPT_UID = Symbol("gnomes_editor_opt_uid");

function _clone<T>(x: T): T {
  // structuredClone поддерживается в современных браузерах; иначе — JSON fallback.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return typeof structuredClone === "function" ? structuredClone(x) : (JSON.parse(JSON.stringify(x)) as T);
}

let _uidCounter = 1;
export function ensureOptionUid(opt: DialoguePlayerOption): string {
  const anyOpt = opt as unknown as Record<symbol, unknown>;
  const existing = anyOpt[OPT_UID];
  if (typeof existing === "string" && existing.length > 0) return existing;
  const uid = `opt_${_uidCounter++}`;
  Object.defineProperty(opt, OPT_UID, { value: uid, enumerable: false });
  return uid;
}

export function cloneDialogueData(data: DialogueData): DialogueData {
  return _clone(data);
}

export function buildCharacterIndex(data: DialogueData): {
  replyById: Map<string, EditorReplyRef>;
  optionByUid: Map<string, EditorOptionRef>;
  allReplyIds: string[];
  actsByNumber: Map<number, DialogueAct>;
  nodeById: Map<string, DialogueNode>;
} {
  const replyById = new Map<string, EditorReplyRef>();
  const optionByUid = new Map<string, EditorOptionRef>();
  const actsByNumber = new Map<number, DialogueAct>();
  const nodeById = new Map<string, DialogueNode>();

  for (const act of data.dialogueTree ?? []) {
    actsByNumber.set(act.act, act);
    for (const node of act.nodes ?? []) {
      nodeById.set(node.nodeId, node);
      for (const reply of node.replies ?? []) {
        replyById.set(reply.id, {
          characterId: data.characterId,
          act: act.act,
          actTitle: act.actTitle,
          actObj: act,
          nodeId: node.nodeId,
          nodeType: node.nodeType,
          node,
          reply,
        });
        const opts = reply.playerOptions ?? [];
        for (const opt of opts) {
          const uid = ensureOptionUid(opt);
          optionByUid.set(uid, { characterId: data.characterId, act: act.act, fromReplyId: reply.id, option: opt });
        }
      }
    }
  }

  const allReplyIds = Array.from(replyById.keys()).sort((a, b) => a.localeCompare(b));
  return { replyById, optionByUid, allReplyIds, actsByNumber, nodeById };
}

export type CytoscapeNodeEl = {
  data: {
    id: string;
    label?: string;
    kind: "character" | "act" | "node" | "reply" | "end";
    characterId?: string;
    act?: number;
    nodeId?: string;
    replyId?: string;
    parent?: string;
  };
  position?: { x: number; y: number };
  locked?: boolean;
  selectable?: boolean;
  grabbable?: boolean;
};

export type CytoscapeEdgeEl = {
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    kind: "option";
    optionUid: string;
    characterId?: string;
    requiredCount: number;
    grantsCount: number;
  };
};

export type GraphBuildOpts = {
  includeActs?: number[];
  positions?: Record<string, { x: number; y: number }>;
  /** Prefix for graph element ids (used to namespace per character in all-gnomes mode) */
  idPrefix?: string;
  /** Parent compound node id for all created act nodes */
  parentId?: string;
  /** Override characterId stored in graph element data */
  characterId?: string;
};

export function buildGraphElements(
  data: DialogueData,
  idx: ReturnType<typeof buildCharacterIndex>,
  opts?: GraphBuildOpts
): { nodes: CytoscapeNodeEl[]; edges: CytoscapeEdgeEl[] } {
  const includeActs = new Set<number>(opts?.includeActs ?? data.dialogueTree.map((a) => a.act));
  const positions = opts?.positions ?? {};
  const idPrefix = opts?.idPrefix ?? "";
  const parentId = opts?.parentId;
  const characterId = opts?.characterId ?? data.characterId;

  const nodes: CytoscapeNodeEl[] = [];
  const edges: CytoscapeEdgeEl[] = [];

  for (const act of data.dialogueTree ?? []) {
    if (!includeActs.has(act.act)) continue;

    const actId = `${idPrefix}act_${act.act}`;
    nodes.push({
      data: {
        id: actId,
        kind: "act",
        characterId,
        act: act.act,
        label: `Акт ${act.act}: ${act.actTitle}`,
        parent: parentId,
      },
      selectable: true,
      grabbable: true,
    });

    const endId = `${idPrefix}end_${act.act}`;
    nodes.push({
      data: { id: endId, kind: "end", characterId, act: act.act, label: "END", parent: actId },
      selectable: true,
      grabbable: false,
    });

    for (const node of act.nodes ?? []) {
      const nodeCompoundId = `${idPrefix}node_${node.nodeId}`;
      nodes.push({
        data: {
          id: nodeCompoundId,
          kind: "node",
          characterId,
          act: act.act,
          nodeId: node.nodeId,
          parent: actId,
          label: `${node.nodeType} • ${node.nodeId}`,
        },
        selectable: true,
        grabbable: true,
      });

      for (const reply of node.replies ?? []) {
        const replyGraphId = `${idPrefix}${reply.id}`;
        nodes.push({
          data: {
            id: replyGraphId,
            kind: "reply",
            characterId,
            act: act.act,
            nodeId: node.nodeId,
            replyId: reply.id,
            parent: nodeCompoundId,
            label: _replyLabel(reply),
          },
          position: positions[replyGraphId],
          selectable: true,
          grabbable: true,
        });

        const replyOpts = reply.playerOptions ?? [];
        for (const opt of replyOpts) {
          const optionUid = ensureOptionUid(opt);
          const target = opt.nextReplyId ? `${idPrefix}${opt.nextReplyId}` : endId;
          const edgeId = `e_${optionUid}`;
          const required = opt.requiredKnowledge ?? [];
          const grants = opt.grantsKnowledge ?? [];
          const label = _optionLabel(opt.text, required.length, grants.length);
          edges.push({
            data: {
              id: edgeId,
              kind: "option",
              characterId,
              source: replyGraphId,
              target,
              optionUid,
              label,
              requiredCount: required.length,
              grantsCount: grants.length,
            },
          });
        }
      }
    }
  }

  // Фильтруем рёбра, которые ведут на reply вне выбранных актов (оставим, но цель заменим на END своей ветки).
  const knownNodeIds = new Set(nodes.map((n) => n.data.id));
  for (const e of edges) {
    if (knownNodeIds.has(e.data.target)) continue;
    // если целевой reply не в выбранном подграфе — отведём в END акта источника
    const srcReply = idx.replyById.get((e.data.source as string).replace(idPrefix, ""));
    const fallback = srcReply ? `${idPrefix}end_${srcReply.act}` : `${idPrefix}end_1`;
    e.data.target = knownNodeIds.has(fallback) ? fallback : e.data.source;
  }

  return { nodes, edges };
}

export function buildAllGraphElements(
  all: DialogueData[],
  opts?: { includeActs?: number[]; positions?: Record<string, { x: number; y: number }> }
): { nodes: CytoscapeNodeEl[]; edges: CytoscapeEdgeEl[] } {
  const nodes: CytoscapeNodeEl[] = [];
  const edges: CytoscapeEdgeEl[] = [];
  const positions = opts?.positions ?? {};

  for (const d of all) {
    const charId = d.characterId;
    const charNodeId = `char_${charId}`;
    nodes.push({
      data: {
        id: charNodeId,
        kind: "character",
        characterId: charId,
        label: d.characterInfo?.name ? `${d.characterInfo.name} (${charId})` : charId,
      },
      selectable: true,
      grabbable: true,
    });

    const idx = buildCharacterIndex(d);
    const prefix = `${charId}::`;
    const built = buildGraphElements(d, idx, {
      includeActs: opts?.includeActs,
      positions,
      idPrefix: prefix,
      parentId: charNodeId,
      characterId: charId,
    });
    nodes.push(...built.nodes);
    edges.push(...built.edges);
  }

  return { nodes, edges };
}

function _replyLabel(r: DialogueReply): string {
  const text = (r.text ?? "").trim().replace(/\s+/g, " ");
  const cut = text.length > 44 ? `${text.slice(0, 44)}…` : text;
  const flags = [r.isFinal ? "FINAL" : "", r.isSilent ? "SILENT" : ""].filter(Boolean).join(" ");
  return flags ? `${r.id}\n${flags}\n${cut}` : `${r.id}\n${cut}`;
}

function _optionLabel(text: string, requiredCount: number, grantsCount: number): string {
  const t = (text ?? "").trim();
  const meta: string[] = [];
  if (requiredCount > 0) meta.push(`req:${requiredCount}`);
  if (grantsCount > 0) meta.push(`grant:${grantsCount}`);
  return meta.length > 0 ? `${t}\n[${meta.join(" ")}]` : t;
}

export function parseList(raw: string): string[] | undefined {
  const parts = raw
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

