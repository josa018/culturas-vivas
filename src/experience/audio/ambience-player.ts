import type { RoomEnvironmentId } from "../../shared/room-catalog";
import { AMBIENT_MANIFEST, AUDIO_TOKENS } from "./audio-constants";
import { AudioEngine, getSharedAudioEngine } from "./audio-engine";
import type {
  AmbiencePlayerPort,
  AudioBufferSourceNodeLike,
  GainNodeLike,
} from "./audio-types";

export interface AmbientAudioElementLike {
  src: string;
  loop: boolean;
  crossOrigin: string | null;
  preload: string;
  volume: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

export interface GaplessLoopBounds {
  readonly loopStartSec: number;
  readonly loopEndSec: number;
}

/**
 * Trims MP3 encoder priming and trailing padding so AudioBufferSourceNode wraps seamlessly.
 */
export function computeGaplessLoopBounds(
  durationSec: number,
  trimStartSec: number = AUDIO_TOKENS.AMBIENT_LOOP_TRIM_START_S,
  trimEndSec: number = AUDIO_TOKENS.AMBIENT_LOOP_TRIM_END_S,
): GaplessLoopBounds {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { loopStartSec: 0, loopEndSec: 0 };
  }
  const safeStart = Math.max(0, trimStartSec);
  const safeEnd = Math.max(0, trimEndSec);
  if (durationSec <= safeStart + safeEnd) {
    return {
      loopStartSec: 0,
      loopEndSec: Number(durationSec.toFixed(6)),
    };
  }
  return {
    loopStartSec: Number(safeStart.toFixed(6)),
    loopEndSec: Number((durationSec - safeEnd).toFixed(6)),
  };
}

export interface AmbiencePlayerOptions {
  readonly audioEngine?: AudioEngine;
  readonly fetchImpl?: typeof fetch;
  readonly scheduleTimeout?: (
    cb: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  readonly clearScheduledTimeout?: (id: ReturnType<typeof setTimeout>) => void;
  readonly manifest?: Readonly<Record<RoomEnvironmentId, string>>;
}

interface ActiveAmbientPlayback {
  readonly environmentId: RoomEnvironmentId;
  readonly sourceNode: AudioBufferSourceNodeLike;
  readonly gainNode: GainNodeLike;
  stopped: boolean;
  stopTimerId: ReturnType<typeof setTimeout> | null;
}

/**
 * Plays seamless CC0 biome ambient loops via decoded AudioBuffers routed through sfxGain.
 */
export class AmbiencePlayer implements AmbiencePlayerPort {
  private readonly audioEngine: AudioEngine;
  private readonly fetchImpl: typeof fetch | null;
  private readonly scheduleTimeout: (
    cb: () => void,
    ms: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearScheduledTimeout: (
    id: ReturnType<typeof setTimeout>,
  ) => void;
  private readonly manifest: Readonly<Record<RoomEnvironmentId, string>>;

  private readonly buffers = new Map<RoomEnvironmentId, AudioBuffer>();
  private readonly loadingByEnv = new Map<
    RoomEnvironmentId,
    Promise<AudioBuffer | null>
  >();
  private readonly fadingOut = new Set<ActiveAmbientPlayback>();
  private activePlayback: ActiveAmbientPlayback | null = null;
  private currentEnvironment: RoomEnvironmentId | null = null;
  private audible = false;
  private playbackEpoch = 0;
  private unsubscribeUnlock: (() => void) | null = null;

  constructor(options: AmbiencePlayerOptions = {}) {
    this.audioEngine = options.audioEngine ?? getSharedAudioEngine();
    this.fetchImpl =
      options.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
    this.scheduleTimeout =
      options.scheduleTimeout ??
      ((cb, ms) => globalThis.setTimeout(cb, ms));
    this.clearScheduledTimeout =
      options.clearScheduledTimeout ??
      ((id) => globalThis.clearTimeout(id));
    this.manifest = options.manifest ?? AMBIENT_MANIFEST;

    this.unsubscribeUnlock =
      this.audioEngine.onUnlock?.(() => {
        if (this.audible && this.currentEnvironment && !this.activePlayback) {
          void this.startEnvironmentBuffer(this.currentEnvironment);
        }
      }) ?? null;
  }

  public transitionToEnvironment(environmentId: RoomEnvironmentId): void {
    const previousEnv = this.currentEnvironment;
    this.currentEnvironment = environmentId;

    if (!this.audible) {
      return;
    }

    if (
      previousEnv === environmentId &&
      this.activePlayback?.environmentId === environmentId &&
      !this.activePlayback.stopped
    ) {
      return;
    }

    void this.startEnvironmentBuffer(environmentId);
  }

  public setAudible(audible: boolean): void {
    if (this.audible === audible) {
      if (audible && this.currentEnvironment && !this.activePlayback) {
        void this.startEnvironmentBuffer(this.currentEnvironment);
      }
      return;
    }
    this.audible = audible;
    if (!audible) {
      this.playbackEpoch += 1;
      this.fadeOutActivePlayback();
      return;
    }
    if (this.currentEnvironment) {
      void this.startEnvironmentBuffer(this.currentEnvironment);
    }
  }

  public stopAll(): void {
    this.audible = false;
    this.playbackEpoch += 1;
    this.fadeOutActivePlayback();
  }

  public dispose(): void {
    this.stopAll();
    this.unsubscribeUnlock?.();
    this.unsubscribeUnlock = null;
    for (const playback of this.fadingOut) {
      this.finalizeStop(playback);
    }
    this.fadingOut.clear();
    this.buffers.clear();
    this.loadingByEnv.clear();
  }

  private async startEnvironmentBuffer(
    environmentId: RoomEnvironmentId,
  ): Promise<void> {
    const epoch = ++this.playbackEpoch;
    const buffer = await this.loadBuffer(environmentId);
    if (
      !buffer ||
      !this.audible ||
      epoch !== this.playbackEpoch ||
      this.currentEnvironment !== environmentId
    ) {
      return;
    }

    const sfxBus = this.audioEngine.getSfxBus();
    if (!sfxBus) {
      return;
    }

    this.fadeOutActivePlayback();

    const gainNode = sfxBus.context.createGain();
    gainNode.gain.value = 0;

    const sourceNode = sfxBus.context.createBufferSource();
    const bounds = computeGaplessLoopBounds(buffer.duration);
    sourceNode.buffer = buffer;
    sourceNode.loop = true;
    sourceNode.loopStart = bounds.loopStartSec;
    sourceNode.loopEnd = bounds.loopEndSec;

    sourceNode.connect(gainNode);
    gainNode.connect(sfxBus.inputNode);

    const playback: ActiveAmbientPlayback = {
      environmentId,
      sourceNode,
      gainNode,
      stopped: false,
      stopTimerId: null,
    };
    this.activePlayback = playback;

    this.rampGain(gainNode, AUDIO_TOKENS.AMBIENCE_GAIN);
    try {
      sourceNode.start(0, bounds.loopStartSec);
    } catch {
      this.finalizeStop(playback);
      this.activePlayback = null;
    }
  }

  private async loadBuffer(
    environmentId: RoomEnvironmentId,
  ): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(environmentId);
    if (cached) {
      return cached;
    }
    const pending = this.loadingByEnv.get(environmentId);
    if (pending) {
      return pending;
    }
    const ctx = this.audioEngine.getAudioContext();
    const url = this.manifest[environmentId];
    if (!ctx || !this.fetchImpl || !url) {
      return null;
    }

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await this.fetchImpl!(url);
        if (!res.ok) {
          return null;
        }
        const raw = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(raw);
        this.buffers.set(environmentId, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingByEnv.delete(environmentId);
      }
    })();

    this.loadingByEnv.set(environmentId, promise);
    return promise;
  }

  private fadeOutActivePlayback(): void {
    const outgoing = this.activePlayback;
    if (!outgoing) {
      return;
    }
    this.activePlayback = null;
    this.rampGain(outgoing.gainNode, 0);
    this.fadingOut.add(outgoing);
    const delayMs =
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS + AUDIO_TOKENS.AMBIENT_STOP_BUFFER_MS;
    outgoing.stopTimerId = this.scheduleTimeout(() => {
      outgoing.stopTimerId = null;
      this.finalizeStop(outgoing);
      this.fadingOut.delete(outgoing);
    }, delayMs);
  }

  private finalizeStop(playback: ActiveAmbientPlayback): void {
    if (playback.stopTimerId !== null) {
      this.clearScheduledTimeout(playback.stopTimerId);
      playback.stopTimerId = null;
    }
    if (playback.stopped) {
      return;
    }
    playback.stopped = true;
    try {
      playback.sourceNode.stop?.();
    } catch {
      // Ignore already-stopped source errors
    }
    try {
      playback.sourceNode.disconnect?.();
      playback.gainNode.disconnect?.();
    } catch {
      // Ignore disconnect errors on mocked nodes
    }
  }

  private rampGain(gainNode: GainNodeLike, targetGain: number): void {
    const ctx = this.audioEngine.getAudioContext();
    if (!ctx) {
      gainNode.gain.value = targetGain;
      return;
    }
    const tau =
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS /
      AUDIO_TOKENS.MS_PER_SECOND /
      AUDIO_TOKENS.DUCK_TAU_SETTLE_DIVISOR;
    gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, tau);
  }
}

let sharedAmbiencePlayer: AmbiencePlayer | null = null;

export function getSharedAmbiencePlayer(): AmbiencePlayer {
  if (!sharedAmbiencePlayer) {
    sharedAmbiencePlayer = new AmbiencePlayer();
    getSharedAudioEngine().setAmbiencePlayer(sharedAmbiencePlayer);
  }
  return sharedAmbiencePlayer;
}

export function setSharedAmbiencePlayer(player: AmbiencePlayer | null): void {
  sharedAmbiencePlayer = player;
}
