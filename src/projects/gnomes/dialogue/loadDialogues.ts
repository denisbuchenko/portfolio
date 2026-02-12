import type { DialogueData } from "./types";

import gnome1 from "../text/gnome1.json";
import gnome2 from "../text/gnome2.json";
import gnome3 from "../text/gnome3.json";

export function loadAllDialogues(): DialogueData[] {
  // JSON лежит в src, Vite/TS загрузит как объект.
  return [gnome1, gnome2, gnome3] as unknown as DialogueData[];
}

