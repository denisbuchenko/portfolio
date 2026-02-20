import type { Result } from "../core/types";
import type { ClipName } from "../animation/clip";

/**
 * Манифест под `public/city/Chel.gltf`.
 *
 * В файле мы видим клипы:
 * - pedal: `pedal`, `pedalL`, `pedalR`, `legR`, `lelL`
 * - turn right: `right`, `right armR`, `right armL`
 * - turn left: `left`, `left armR`, `left armL`
 */
export type ChelClipId =
  | "pedal"
  | "pedalL"
  | "pedalR"
  | "legR"
  | "lelL"
  | "turnRightBody"
  | "turnRightArmR"
  | "turnRightArmL"
  | "turnLeftBody"
  | "turnLeftArmR"
  | "turnLeftArmL";

export type ChelRigManifest = Readonly<{
  /** Логический id клипа → имя клипа в glTF. */
  clips: Readonly<Record<ChelClipId, ClipName | null>>;
}>;

/**
 * Дефолтная раскладка клипов под текущий `Chel.gltf`.
 * По умолчанию мапим `turnLeftBody` на `"left"`.
 */
export const CHEL_DEFAULT_MANIFEST: ChelRigManifest = {
  clips: {
    pedal: "pedal" as ClipName,
    pedalL: "pedalL" as ClipName,
    pedalR: "pedalR" as ClipName,
    legR: "legR" as ClipName,
    lelL: "lelL" as ClipName,

    turnRightBody: "right" as ClipName,
    turnRightArmR: "right armR" as ClipName,
    turnRightArmL: "right armL" as ClipName,

    turnLeftBody: "left" as ClipName,
    turnLeftArmR: "left armR" as ClipName,
    turnLeftArmL: "left armL" as ClipName
  }
};

export interface ChelRigManifestProvider {
  /**
   * Построить/вернуть манифест клипов по реальному ассету.
   * Возвращаем `null` для клипов, которых нет в файле (например, “левый корпус”).
   */
  getManifest(): Result<ChelRigManifest>;
}

