import type { TimeStep } from "../core/lifecycle";
import type { Transform } from "../core/types";
import type { MovementState } from "../character/movement";
import type { Npc } from "./npc";

export interface NpcAnimationController {
  /**
   * Обновить анимацию NPC.
   * Возвращает “предлагаемый” визуальный transform (если нужен).
   */
  update(params: Readonly<{ npc: Npc; movement: MovementState; step: TimeStep }>): Transform | null;
}

