import type { TimeStep } from "../core/lifecycle";
import type { Vec3 } from "../core/types";
import type { MovementIntent } from "../character/movement";
import type { Npc } from "./npc";

/**
 * Мозг NPC: выдаёт “намерение” движения и/или высокоуровневые команды.
 * Это может быть FSM/BT/GOAP/скрипт — контракт это не фиксирует.
 */
export interface NpcBrain {
  /**
   * Цель/желание NPC на тик: куда и как двигаться.
   * При желании можно вернуть `null`, чтобы NPC “ничего не делал”.
   */
  think(params: Readonly<{ npc: Npc; step: TimeStep; playerPosition?: Vec3 }>): MovementIntent | null;
}

