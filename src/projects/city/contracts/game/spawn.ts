import type { Result, Transform, Vec3 } from "../core/types";
import type { CollisionSystem } from "../physics/collision";
import type { World } from "../world/world";

export type SpawnRequest = Readonly<{
  /** Желаемая точка (например, “центр карты”). */
  preferredPosition: Vec3;
  /** Радиус проверки “не внутри дома”. */
  clearanceRadius: number;
  /** Сколько попыток/итераций мы готовы сделать, чтобы найти безопасную точку рядом. */
  maxAttempts: number;
}>;

export type SpawnResult = Readonly<{
  spawnTransform: Transform;
  usedPosition: Vec3;
}>;

/**
 * Планировщик спавна: выбрать позицию так, чтобы велосипедист не оказался внутри дома.
 * Реализация может:
 * - проверять World.queryAabb + collision.raycast/sweep
 * - использовать предрассчитанные “свободные” клетки
 */
export interface SpawnPlanner {
  findSpawn(params: Readonly<{ world: World; collision: CollisionSystem; req: SpawnRequest }>): Result<SpawnResult>;
}

