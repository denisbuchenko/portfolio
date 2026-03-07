import { SUNDUC_CONFIG } from "../config";
import type { SunducAnimationCatalog } from "../types";
import { normalizeSunducName } from "../utils/normalizeSunducName";

export function buildSunducAnimationCatalog(clipNames: string[]): SunducAnimationCatalog {
  const stoneClipNames = clipNames
    .filter((clipName) => matchesStoneClip(clipName))
    .sort((left, right) => left.localeCompare(right, "ru", { sensitivity: "base" }));

  const closeClip = _findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.close);
  const duduClip = _findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.dudu);
  const keyClip = _findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.key);
  const openClip = _findClipByAliases(clipNames, SUNDUC_CONFIG.animationAliases.open);

  const sequenceClipNames = [closeClip, duduClip, keyClip, openClip].filter(
    (clipName): clipName is string => Boolean(clipName)
  );

  const normalizedStones = stoneClipNames.length > 0 ? stoneClipNames.join(", ") : "не найдены";
  const normalizedSequence = sequenceClipNames.length > 0 ? sequenceClipNames.join(" → ") : "не собран";

  return {
    stoneClipNames,
    sequenceClipNames,
    summary:
      `Камни: ${normalizedStones}. Остальные клипы: ${normalizedSequence}. ` +
      "Каждый тумблер включает клип с первого keyframe и выключает его возвратом в начало."
  };
}

export function matchesStoneClip(clipName: string): boolean {
  const normalizedClipName = normalizeSunducName(clipName);
  return SUNDUC_CONFIG.animationAliases.stoneSearch.some((alias) =>
    normalizedClipName.includes(normalizeSunducName(alias))
  );
}

export function matchesKeyClip(clipName: string): boolean {
  return _findClipByAliases([clipName], SUNDUC_CONFIG.animationAliases.key) !== null;
}

export function shouldToggleSunducClipVisibility(clipName: string): boolean {
  return matchesStoneClip(clipName) || matchesKeyClip(clipName);
}

function _findClipByAliases(clipNames: string[], aliases: readonly string[]): string | null {
  const normalizedAliases = aliases.map(normalizeSunducName);

  for (const clipName of clipNames) {
    const normalizedClipName = normalizeSunducName(clipName);
    if (normalizedAliases.includes(normalizedClipName)) return clipName;
  }

  return null;
}
