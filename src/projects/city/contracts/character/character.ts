import type { CharacterId, Result, Transform, Vec3 } from "../core/types";
import type { ColliderRef } from "../physics/collision";

export type CharacterArchetype = Readonly<{
  /** Например: "hero", "mage", "debug". */
  kind: string;
}>;

export interface Character {
  readonly id: CharacterId;

  /** Текущий transform персонажа в мире. */
  getTransform(): Transform;
  /** Мгновенно задать transform (например, spawn/телепорт). */
  setTransform(t: Transform): void;

  /** Коллайдер “тела” персонажа (для движения/столкновений). */
  getBodyCollider(): ColliderRef;

  /** Точка, на которую удобно целиться камерой/взаимодействием (например, голова/центр). */
  getFocusPoint(): Vec3;
}

export type CharacterBuild = Readonly<{
  character: Character;
}>;

export interface CharacterFactory {
  create(params: Readonly<{ archetype: CharacterArchetype; spawnTransform: Transform }>): Result<CharacterBuild>;
}

