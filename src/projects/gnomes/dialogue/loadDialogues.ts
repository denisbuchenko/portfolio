import type { DialogueData } from "./types";

import shoragranAct1 from "../text/shoragran_act1.json";
import shoragranAct2 from "../text/shoragran_act2.json";
import shoragranAct3 from "../text/shoragran_act3.json";

import fyfchikAct1 from "../text/fyfchik_act1.json";
import fyfchikAct2 from "../text/fyfchik_act2.json";
import fyfchikAct3 from "../text/fyfchik_act3.json";

import pipiserAct1 from "../text/pipiser_act1.json";
import pipiserAct2 from "../text/pipiser_act2.json";
import pipiserAct3 from "../text/pipiser_act3.json";

export function loadAllDialogues(): DialogueData[] {
  // JSON лежит в src, Vite/TS загрузит как объект.
  // Мы храним текст по актам в отдельных файлах для удобства чтения,
  // но в runtime склеиваем обратно в 3 персонажа.
  const parts = [
    shoragranAct1,
    shoragranAct2,
    shoragranAct3,
    fyfchikAct1,
    fyfchikAct2,
    fyfchikAct3,
    pipiserAct1,
    pipiserAct2,
    pipiserAct3,
  ] as unknown as DialogueData[];

  const byCharacter = new Map<string, DialogueData[]>();
  for (const part of parts) {
    const list = byCharacter.get(part.characterId) ?? [];
    list.push(part);
    byCharacter.set(part.characterId, list);
  }

  const merged: DialogueData[] = [];
  for (const [characterId, list] of byCharacter) {
    // Берём characterInfo из первого файла, акты сортируем по номеру.
    const characterInfo = list[0]?.characterInfo;
    const dialogueTree = list
      .flatMap((p) => p.dialogueTree ?? [])
      .slice()
      .sort((a, b) => (a.act ?? 0) - (b.act ?? 0));

    merged.push({
      characterId,
      characterInfo,
      dialogueTree,
    } as DialogueData);
  }

  // Стабильный порядок для UI/меню (если где-то важно).
  merged.sort((a, b) => a.characterId.localeCompare(b.characterId));
  return merged;
}

