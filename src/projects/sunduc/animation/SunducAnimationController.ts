import * as THREE from "three";
import { shouldToggleSunducClipVisibility } from "./SunducAnimationCatalog";

type _ClipRange = {
  start: number;
  end: number;
};

type _ClipBinding = {
  target: THREE.Object3D;
  property: "position" | "quaternion" | "scale";
  startValue: number[];
  endValue: number[];
};

type SunducAnimationControllerOptions = {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  onStatusChange?: (text: string) => void;
  onClipStateChange?: (clipName: string, active: boolean) => void;
};

export class SunducAnimationController {
  private readonly _root: THREE.Object3D;
  private readonly _mixer: THREE.AnimationMixer;
  private readonly _onStatusChange: (text: string) => void;
  private readonly _onClipStateChange?: (clipName: string, active: boolean) => void;

  private readonly _actionsByName = new Map<string, THREE.AnimationAction>();
  private readonly _clipBindings = new Map<string, _ClipBinding[]>();
  private readonly _clipPinnedAtEnd = new Map<string, boolean>();
  private readonly _clipRanges = new Map<string, _ClipRange>();
  private readonly _clipStates = new Map<string, boolean>();
  private readonly _clipVisibilityTargets = new Map<string, THREE.Object3D[]>();
  private readonly _clipNamesByAction = new WeakMap<THREE.AnimationAction, string>();
  private readonly _finishWaiters = new Map<string, Array<() => void>>();

  constructor(options: SunducAnimationControllerOptions) {
    this._root = options.root;
    this._mixer = new THREE.AnimationMixer(options.root);
    this._onStatusChange = options.onStatusChange ?? (() => undefined);
    this._onClipStateChange = options.onClipStateChange;

    for (const clip of options.animations) {
      this._clipRanges.set(clip.name, this._getClipRange(clip));
      this._clipBindings.set(clip.name, this._buildClipBindings(clip, options.root));
      this._clipVisibilityTargets.set(clip.name, this._collectClipTargets(clip, options.root));

      const action = this._mixer.clipAction(clip);
      action.clampWhenFinished = true;
      action.loop = THREE.LoopOnce;
      action.enabled = true;
      action.paused = true;

      this._actionsByName.set(clip.name, action);
      this._clipNamesByAction.set(action, clip.name);
    }

    this._mixer.addEventListener("finished", this._onMixerFinished);
  }

  dispose(): void {
    this._mixer.removeEventListener("finished", this._onMixerFinished);
    this._mixer.stopAllAction();
    for (const waiters of this._finishWaiters.values()) {
      for (const resolve of waiters) resolve();
    }
    this._actionsByName.clear();
    this._clipBindings.clear();
    this._clipPinnedAtEnd.clear();
    this._clipRanges.clear();
    this._clipStates.clear();
    this._clipVisibilityTargets.clear();
    this._finishWaiters.clear();
  }

  getClipNames(): string[] {
    return [...this._actionsByName.keys()];
  }

  initializeClips(clipNames: string[]): void {
    for (const clipName of clipNames) {
      this._setClipActiveInternal(clipName, false, {
        emitStateChange: false,
        emitStatus: false
      });
      this._syncClipVisibility(clipName);
    }
  }

  update(deltaSeconds: number): void {
    this._mixer.update(deltaSeconds);
    this._applyPinnedClipPoses();
  }

  toggleClip(clipName: string): void {
    const nextState = !this._clipStates.get(clipName);
    this.setClipActive(clipName, nextState);
  }

  resetClips(clipNames: string[]): void {
    for (const clipName of clipNames) {
      this._setClipActiveInternal(clipName, false, {
        emitStateChange: true,
        emitStatus: false
      });
    }

    this._onStatusChange("Все тогглы возвращены в начальное состояние.");
  }

  setClipActive(clipName: string, active: boolean): void {
    this._setClipActiveInternal(clipName, active, {
      emitStateChange: true,
      emitStatus: true
    });
  }

  playClip(clipName: string): Promise<void> {
    if (!this._actionsByName.has(clipName)) return Promise.resolve();

    return new Promise((resolve) => {
      const waiters = this._finishWaiters.get(clipName) ?? [];
      waiters.push(resolve);
      this._finishWaiters.set(clipName, waiters);
      this._setClipActiveInternal(clipName, true, {
        emitStateChange: true,
        emitStatus: true
      });
    });
  }

  pinClipAtEnd(clipName: string): void {
    const action = this._actionsByName.get(clipName);
    if (!action) return;

    const range = this._clipRanges.get(clipName);
    if (!range) return;

    this._clipStates.set(clipName, true);
    this._clipPinnedAtEnd.set(clipName, true);
    action.stop();
    action.enabled = false;
    action.paused = true;
    action.time = range.end;
    this._syncClipVisibility(clipName, true);
    this._applyClipPose(clipName, "end");
    this._onClipStateChange?.(clipName, true);
  }

  private _setClipActiveInternal(
    clipName: string,
    active: boolean,
    options: {
      emitStateChange: boolean;
      emitStatus: boolean;
    }
  ): void {
    const action = this._actionsByName.get(clipName);
    if (!action) return;

    const range = this._clipRanges.get(clipName);
    if (!range) return;

    this._clipStates.set(clipName, active);
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;

    if (active) {
      this._clipPinnedAtEnd.set(clipName, false);
      this._syncClipVisibility(clipName, true);
      action.stop();
      action.reset();
      action.time = range.start;
      action.paused = false;
      action.play();
      this._applyClipPose(clipName, "start");
      if (options.emitStatus) {
        this._onStatusChange(`Воспроизводится: ${clipName}`);
      }
    } else {
      this._clipPinnedAtEnd.set(clipName, false);
      action.stop();
      action.enabled = false;
      action.paused = true;
      action.time = range.start;
      this._applyClipPose(clipName, "start");
      this._syncClipVisibility(clipName, false);
      this._applyPinnedClipPoses();
      if (options.emitStatus) {
        this._onStatusChange(`Сброшено в начало: ${clipName}`);
      }
    }

    if (options.emitStateChange) {
      this._onClipStateChange?.(clipName, active);
    }
  }

  private _onMixerFinished = (event: THREE.Event): void => {
    const mixerEvent = event as THREE.Event & { action?: THREE.AnimationAction };
    const action = mixerEvent.action;
    if (!action) return;

    const clipName = this._clipNamesByAction.get(action);
    if (!clipName) return;

    const range = this._clipRanges.get(clipName);
    if (!range) return;
    if (!this._clipStates.get(clipName)) return;

    action.stop();
    action.enabled = false;
    this._clipPinnedAtEnd.set(clipName, true);
    this._syncClipVisibility(clipName, true);
    this._applyClipPose(clipName, "end");
    action.time = range.end;

    this._onClipStateChange?.(clipName, true);
    this._onStatusChange(`Зафиксировано на последнем keyframe: ${clipName}`);
    const waiters = this._finishWaiters.get(clipName);
    if (!waiters) return;
    this._finishWaiters.delete(clipName);
    for (const resolve of waiters) resolve();
  };

  private _getClipRange(clip: THREE.AnimationClip): _ClipRange {
    let start = Number.POSITIVE_INFINITY;
    let end = 0;

    for (const track of clip.tracks) {
      if (track.times.length === 0) continue;
      start = Math.min(start, track.times[0]);
      end = Math.max(end, track.times[track.times.length - 1]);
    }

    if (!Number.isFinite(start)) start = 0;
    if (end < start) end = clip.duration;

    return { start, end };
  }

  private _buildClipBindings(clip: THREE.AnimationClip, root: THREE.Object3D): _ClipBinding[] {
    const bindings: _ClipBinding[] = [];

    for (const track of clip.tracks) {
      const splitIndex = track.name.lastIndexOf(".");
      if (splitIndex <= 0) continue;

      const nodeName = track.name.slice(0, splitIndex);
      const property = track.name.slice(splitIndex + 1);
      if (property !== "position" && property !== "quaternion" && property !== "scale") continue;

      const target = root.getObjectByName(nodeName);
      if (!target) continue;

      const valueSize = track.getValueSize();
      const startValue = Array.from(track.values.slice(0, valueSize), (value) => Number(value));
      const endValue = Array.from(track.values.slice(track.values.length - valueSize), (value) => Number(value));

      bindings.push({
        target,
        property,
        startValue,
        endValue
      });
    }

    return bindings;
  }

  private _collectClipTargets(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.Object3D[] {
    const targets = new Map<string, THREE.Object3D>();

    for (const track of clip.tracks) {
      const splitIndex = track.name.lastIndexOf(".");
      if (splitIndex <= 0) continue;

      const nodeName = track.name.slice(0, splitIndex);
      const target = root.getObjectByName(nodeName);
      if (!target) continue;

      targets.set(target.uuid, target);
    }

    return [...targets.values()];
  }

  private _applyPinnedClipPoses(): void {
    for (const [clipName, pinned] of this._clipPinnedAtEnd) {
      if (!pinned || !this._clipStates.get(clipName)) continue;
      this._applyClipPose(clipName, "end");
    }
  }

  private _applyClipPose(clipName: string, pose: "start" | "end"): void {
    const bindings = this._clipBindings.get(clipName);
    if (!bindings) return;

    for (const binding of bindings) {
      const value = pose === "end" ? binding.endValue : binding.startValue;

      switch (binding.property) {
        case "position":
          binding.target.position.fromArray(value);
          binding.target.updateMatrix();
          break;
        case "scale":
          binding.target.scale.fromArray(value);
          binding.target.updateMatrix();
          break;
        case "quaternion":
          binding.target.quaternion.fromArray(value).normalize();
          binding.target.updateMatrix();
          break;
      }
    }

    this._root.updateMatrixWorld(true);
  }

  private _syncClipVisibility(clipName: string, forcedState?: boolean): void {
    if (!shouldToggleSunducClipVisibility(clipName)) return;

    const visible = forcedState ?? Boolean(this._clipStates.get(clipName));
    const targets = this._clipVisibilityTargets.get(clipName);
    if (!targets) return;

    for (const target of targets) {
      target.visible = visible;
    }
  }
}
