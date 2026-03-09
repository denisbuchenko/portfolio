import { OSMINOG_DUDU_CONFIG } from "./config";

export type DuduKeyName = keyof typeof OSMINOG_DUDU_CONFIG.audio.notesByKey;

export type DuduAudio = {
  ensureStarted(): Promise<void>;
  playKey(keyName: DuduKeyName): Promise<void>;
  stopKey(keyName?: DuduKeyName): void;
  stopAll(): void;
  dispose(): void;
};

export async function createDuduAudio(): Promise<DuduAudio> {
  const Tone = await import("tone");

  const filter = new Tone.Filter(OSMINOG_DUDU_CONFIG.audio.lowpassHz, "lowpass");
  const compressor = new Tone.Compressor(
    OSMINOG_DUDU_CONFIG.audio.compressorThresholdDb,
    OSMINOG_DUDU_CONFIG.audio.compressorRatio
  );
  const reverb = new Tone.Reverb({
    decay: OSMINOG_DUDU_CONFIG.audio.reverbDecaySec,
    wet: OSMINOG_DUDU_CONFIG.audio.reverbWet
  });
  const gain = new Tone.Gain(OSMINOG_DUDU_CONFIG.audio.outputGain);
  const sampler = new Tone.Sampler({
    urls: OSMINOG_DUDU_CONFIG.audio.sampleUrls,
    baseUrl: OSMINOG_DUDU_CONFIG.audio.baseUrl,
    attack: OSMINOG_DUDU_CONFIG.audio.attackSec,
    release: OSMINOG_DUDU_CONFIG.audio.releaseSec
  });

  sampler.chain(filter, compressor, reverb, gain, Tone.Destination);

  await Tone.loaded();

  let _activeKey: DuduKeyName | null = null;
  let _activeNote: string | null = null;
  let _ready = true;

  const _ensureStarted = async (): Promise<void> => {
    if (Tone.context.state !== "running") await Tone.start();
  };

  const _stopActiveNote = (): void => {
    if (!_activeNote) return;
    sampler.triggerRelease(_activeNote);
    _activeKey = null;
    _activeNote = null;
  };

  return {
    ensureStarted: _ensureStarted,
    async playKey(keyName: DuduKeyName): Promise<void> {
      const note = OSMINOG_DUDU_CONFIG.audio.notesByKey[keyName];
      if (!note) return;

      await _ensureStarted();
      if (!_ready) return;

      if (_activeKey === keyName) return;
      if (_activeNote) sampler.triggerRelease(_activeNote);

      _activeKey = keyName;
      _activeNote = note;
      try {
        sampler.triggerAttack(note);
      } catch (error) {
        _activeKey = null;
        _activeNote = null;
        _ready = false;
        // eslint-disable-next-line no-console
        console.error(`[dudu-audio] Не удалось проиграть ноту ${note}`, error);
      }
    },
    stopKey(keyName?: DuduKeyName): void {
      if (!_activeKey || !_activeNote) return;
      if (keyName && keyName !== _activeKey) return;
      _stopActiveNote();
    },
    stopAll(): void {
      _stopActiveNote();
      sampler.releaseAll();
    },
    dispose(): void {
      _stopActiveNote();
      sampler.releaseAll();
      sampler.dispose();
      gain.dispose();
      reverb.dispose();
      compressor.dispose();
      filter.dispose();
    }
  };
}
