export interface SunducProjectOptions {
  host: HTMLElement;
  embedded?: boolean;
  onMenu?: () => void;
}

export type SunducAnimationCatalog = {
  stoneClipNames: string[];
  sequenceClipNames: string[];
  summary: string;
};
