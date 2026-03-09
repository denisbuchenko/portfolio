export type MelodyTrackerState = {
  readonly completedSequenceCount: number;
  readonly totalSequenceCount: number;
  readonly currentSequenceIndex: number;
  readonly currentNoteIndex: number;
  readonly isCompleted: boolean;
  readonly isLocked: boolean;
};

type MelodySequenceTrackerOptions<TNote extends string> = {
  readonly pauseResetMs: number;
  readonly sequences: readonly (readonly TNote[])[];
  readonly onStateChange?: (state: MelodyTrackerState) => void;
};

export class MelodySequenceTracker<TNote extends string> {
  private readonly _pauseResetMs: number;
  private readonly _sequences: readonly (readonly TNote[])[];
  private readonly _onStateChange: ((state: MelodyTrackerState) => void) | null;

  private _sequenceIndex = 0;
  private _noteIndex = 0;
  private _resetTimer = 0;
  private _lastInputAt = 0;
  private _locked = false;

  constructor(options: MelodySequenceTrackerOptions<TNote>) {
    this._pauseResetMs = options.pauseResetMs;
    this._sequences = options.sequences;
    this._onStateChange = options.onStateChange ?? null;
    this._emitState();
  }

  dispose(): void {
    this._clearResetTimer();
  }

  getState(): MelodyTrackerState {
    return {
      completedSequenceCount: this._sequenceIndex,
      totalSequenceCount: this._sequences.length,
      currentSequenceIndex: this._sequenceIndex,
      currentNoteIndex: this._noteIndex,
      isCompleted: this._sequenceIndex >= this._sequences.length,
      isLocked: this._locked
    };
  }

  notePlayed(note: TNote): MelodyTrackerState {
    if (this._locked) return this.getState();

    const now = Date.now();

    if (this._shouldResetByPause(now)) {
      this._resetInternal();
    }

    if (this._sequences.length === 0) {
      this._emitState();
      return this.getState();
    }

    if (this._sequenceIndex >= this._sequences.length) {
      this._resetInternal();
    }

    const currentSequence = this._sequences[this._sequenceIndex];
    const expectedNote = currentSequence[this._noteIndex];

    if (note !== expectedNote) {
      this._resetInternal();

      if (!this._tryStartFromFirstSequence(note)) {
        this._lastInputAt = 0;
        this._emitState();
        return this.getState();
      }
    } else {
      this._noteIndex += 1;
      if (this._noteIndex >= currentSequence.length) {
        this._sequenceIndex += 1;
        this._noteIndex = 0;
        if (this._sequenceIndex >= this._sequences.length) {
          this._locked = true;
          this._clearResetTimer();
          this._lastInputAt = 0;
        }
      }
    }

    if (!this._locked) {
      this._lastInputAt = now;
      this._restartResetTimer();
    }
    this._emitState();
    return this.getState();
  }

  reset(): MelodyTrackerState {
    this._resetInternal();
    this._emitState();
    return this.getState();
  }

  private _tryStartFromFirstSequence(note: TNote): boolean {
    const firstSequence = this._sequences[0];
    if (!firstSequence || firstSequence[0] !== note) return false;

    this._sequenceIndex = 0;
    this._noteIndex = 1;
    return true;
  }

  private _shouldResetByPause(now: number): boolean {
    if (this._lastInputAt === 0) return false;
    return now - this._lastInputAt > this._pauseResetMs;
  }

  private _restartResetTimer(): void {
    this._clearResetTimer();
    this._resetTimer = window.setTimeout(() => {
      this._resetInternal();
      this._emitState();
    }, this._pauseResetMs);
  }

  private _clearResetTimer(): void {
    if (!this._resetTimer) return;
    window.clearTimeout(this._resetTimer);
    this._resetTimer = 0;
  }

  private _resetInternal(): void {
    this._clearResetTimer();
    this._sequenceIndex = 0;
    this._noteIndex = 0;
    this._lastInputAt = 0;
    this._locked = false;
  }

  private _emitState(): void {
    this._onStateChange?.(this.getState());
  }
}
