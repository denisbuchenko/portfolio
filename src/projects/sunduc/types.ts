export interface SunducProjectOptions {
  host: HTMLElement;
  embedded?: boolean;
  onMenu?: () => void;
  onRestoreKeyRequest?: () => void;
}

export type SunducStoneItemId = "stone1" | "stone2" | "stone3" | "stone4";
export type SunducInventoryItemId = SunducStoneItemId | "key" | "flute";

export type SunducAnimationCatalog = {
  stoneClipNames: string[];
  stoneClipNamesByItemId: Partial<Record<SunducStoneItemId, string>>;
  open1ClipName: string | null;
  duduClipName: string | null;
  keyClipName: string | null;
  open2ClipName: string | null;
  sequenceClipNames: string[];
  summary: string;
};
