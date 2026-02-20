import type { DialogueData } from "../dialogue/types";

const STORAGE_PREFIX = "gnomes_dialogue_editor_draft_v1";
const LAYOUT_PREFIX = "gnomes_dialogue_editor_layout_v1";

function _key(characterId: string): string {
  return `${STORAGE_PREFIX}:${characterId}`;
}

function _layoutKey(characterId: string): string {
  return `${LAYOUT_PREFIX}:${characterId}`;
}

export function loadDraft(characterId: string): DialogueData | null {
  try {
    const raw = localStorage.getItem(_key(characterId));
    if (!raw) return null;
    return JSON.parse(raw) as DialogueData;
  } catch {
    return null;
  }
}

export function saveDraft(characterId: string, data: DialogueData): void {
  try {
    localStorage.setItem(_key(characterId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function clearDraft(characterId: string): void {
  try {
    localStorage.removeItem(_key(characterId));
  } catch {
    // ignore
  }
}

export type EditorLayoutState = {
  positions: Record<string, { x: number; y: number }>;
  pan?: { x: number; y: number };
  zoom?: number;
};

export function loadLayout(characterId: string): EditorLayoutState | null {
  try {
    const raw = localStorage.getItem(_layoutKey(characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Partial<EditorLayoutState>;
    const positions = obj.positions && typeof obj.positions === "object" ? (obj.positions as EditorLayoutState["positions"]) : {};
    const pan = obj.pan && typeof obj.pan === "object" ? (obj.pan as EditorLayoutState["pan"]) : undefined;
    const zoom = typeof obj.zoom === "number" ? obj.zoom : undefined;
    return { positions, pan, zoom };
  } catch {
    return null;
  }
}

export function saveLayout(characterId: string, state: EditorLayoutState): void {
  try {
    localStorage.setItem(_layoutKey(characterId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearLayout(characterId: string): void {
  try {
    localStorage.removeItem(_layoutKey(characterId));
  } catch {
    // ignore
  }
}

