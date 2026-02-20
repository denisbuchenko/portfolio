/** Брендированный ID, чтобы не путать разные идентификаторы между собой. */
export type BrandedId<TName extends string> = string & { readonly __brand: TName };

export type EntityId = BrandedId<"EntityId">;
export type WorldObjectId = BrandedId<"WorldObjectId">;
export type CharacterId = BrandedId<"CharacterId">;
export type NpcId = BrandedId<"NpcId">;

export type Vec2 = Readonly<{ x: number; y: number }>;
export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

/** Кватернион (x,y,z,w). */
export type Quat = Readonly<{ x: number; y: number; z: number; w: number }>;

export type Transform = Readonly<{
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}>;

export type Aabb = Readonly<{
  min: Vec3;
  max: Vec3;
}>;

export type Ray = Readonly<{
  origin: Vec3;
  direction: Vec3; // предполагается нормализованным, но контракт это не навязывает
}>;

export type Tagged<TTag extends string> = Readonly<{ tag: TTag }>;

/**
 * Утилитарный результат “успех/ошибка” для фабрик/загрузок.
 * Никакого стека ошибок не предполагается — только контракт.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

