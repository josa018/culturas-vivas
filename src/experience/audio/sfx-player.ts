import { AUDIO_TOKENS, SFX_MANIFEST, type SfxId } from "./audio-constants";
import { AudioEngine, getSharedAudioEngine } from "./audio-engine";
import { normalizeAudioBufferInPlace } from "./buffer-normalizer";

export interface SfxPlayerOptions {
  readonly audioEngine?: AudioEngine;
  readonly fetchImpl?: typeof fetch;
  readonly manifest?: Readonly<Record<SfxId, string>>;
}

/**
 * Decodes and caches CC0 interaction sound effects once and plays them through sfxGain.
 */
export class SfxPlayer {
  private readonly audioEngine: AudioEngine;
  private readonly fetchImpl: typeof fetch | null;
  private readonly manifest: Readonly<Record<SfxId, string>>;
  private readonly buffers = new Map<SfxId, AudioBuffer>();
  private readonly loadingById = new Map<SfxId, Promise<void>>();
  private preloadPromise: Promise<void> | null = null;
  private unsubscribeUnlock: (() => void) | null = null;

  constructor(options: SfxPlayerOptions = {}) {
    this.audioEngine = options.audioEngine ?? getSharedAudioEngine();
    this.fetchImpl =
      options.fetchImpl ??
      (typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null);
    this.manifest = options.manifest ?? SFX_MANIFEST;

    this.unsubscribeUnlock =
      this.audioEngine.onUnlock?.(() => {
        void this.preloadAll();
      }) ?? null;
  }

  public async preloadAll(): Promise<void> {
    if (!this.audioEngine.getAudioContext() || !this.fetchImpl) {
      return;
    }
    if (this.preloadPromise) {
      return this.preloadPromise;
    }
    const entries = Object.entries(this.manifest) as Array<[SfxId, string]>;
    this.preloadPromise = Promise.all(
      entries.map(([id]) => this.loadSingle(id)),
    ).then(() => undefined);
    return this.preloadPromise;
  }

  public hasBuffer(id: SfxId): boolean {
    return this.buffers.has(id);
  }

  public play(id: SfxId): boolean {
    if (!this.audioEngine.isEffectsAudible()) {
      return false;
    }
    const sfxBus = this.audioEngine.getSfxBus();
    if (!sfxBus) {
      return false;
    }
    const buffer = this.buffers.get(id);
    if (!buffer) {
      void this.loadSingle(id);
      return false;
    }
    try {
      const source = sfxBus.context.createBufferSource();
      source.buffer = buffer;
      source.connect(sfxBus.inputNode);
      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  public dispose(): void {
    this.unsubscribeUnlock?.();
    this.unsubscribeUnlock = null;
    this.buffers.clear();
    this.loadingById.clear();
    this.preloadPromise = null;
  }

  private async loadSingle(id: SfxId): Promise<void> {
    if (this.buffers.has(id)) {
      return;
    }
    const existing = this.loadingById.get(id);
    if (existing) {
      return existing;
    }
    const ctx = this.audioEngine.getAudioContext();
    const url = this.manifest[id];
    if (!ctx || !this.fetchImpl || !url) {
      return;
    }

    const promise = (async () => {
      try {
        const res = await this.fetchImpl!(url);
        if (!res.ok) {
          return;
        }
        const rawBuffer = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(rawBuffer);
        normalizeAudioBufferInPlace(
          decoded,
          AUDIO_TOKENS.SFX_TARGET_PEAK,
          AUDIO_TOKENS.MAX_NORMALIZE_GAIN,
        );
        this.buffers.set(id, decoded);
      } catch {
        // Non-blocking fallback when audio asset fails to fetch/decode
      } finally {
        this.loadingById.delete(id);
      }
    })();

    this.loadingById.set(id, promise);
    return promise;
  }
}

let sharedSfxPlayer = new SfxPlayer();

export function getSharedSfxPlayer(): SfxPlayer {
  return sharedSfxPlayer;
}

export function setSharedSfxPlayer(player: SfxPlayer | null): void {
  sharedSfxPlayer = player ?? new SfxPlayer();
}
