import type { DialogueData } from "./types";

import horogran from "../text/horogran.json";
import fyfchik from "../text/fyfchik.json";
import pipiser from "../text/pipiser.json";

export function loadAllDialogues(): DialogueData[] {
  // JSON лежит в src, Vite/TS загрузит как объект.
  // Новая структура: 1 файл = 1 персонаж. Никаких "актов" и склеек.
  return [horogran, fyfchik, pipiser] as unknown as DialogueData[];
}

