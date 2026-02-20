import type { NpcId, Result, Transform, Vec3 } from "../core/types";
import type { ColliderRef } from "../physics/collision";

export type NpcArchetype = Readonly<{
  kind: string;
}>;

export interface Npc {
  readonly id: NpcId;

  getTransform(): Transform;
  setTransform(t: Transform): void;

  getBodyCollider(): ColliderRef;
  getFocusPoint(): Vec3;
}

export type NpcBuild = Readonly<{
  npc: Npc;
}>;

export interface NpcFactory {
  create(params: Readonly<{ archetype: NpcArchetype; spawnTransform: Transform }>): Result<NpcBuild>;
}

