import { ROOM_ENVIRONMENT_IDS, type RoomId } from "../../shared/room-catalog";
import { AUDIO_TOKENS } from "./audio-constants";
import {
  AudioPreferencesStore,
  getSharedAudioPreferencesStore,
} from "./audio-preferences-store";
import {
  noopAmbiencePlayerPort,
  noopMusicPlayerPort,
  type AmbiencePlayerPort,
  type AudioBusTarget,
  type AudioContextLike,
  type DynamicsCompressorNodeLike,
  type GainNodeLike,
  type MusicPlayerPort,
} from "./audio-types";

export interface DocumentLifecycleTarget {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface AudioSessionNavigatorTarget {
  audioSession?: { type: string };
}

export interface AudioEngineOptions {
  readonly preferencesStore?: AudioPreferencesStore;
  readonly createAudioContext?: () => AudioContextLike | null;
  readonly musicPlayer?: MusicPlayerPort;
  readonly ambiencePlayer?: AmbiencePlayerPort;
  readonly documentRef?: DocumentLifecycleTarget | null;
  readonly navigatorRef?: AudioSessionNavigatorTarget | null;
}

function defaultCreateAudioContext(): AudioContextLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!ctor) {
    return null;
  }
  return new ctor() as unknown as AudioContextLike;
}

/**
 * Coordinates the single Web Audio graph and experience-scoped bus gains.
 */
export class AudioEngine {
  private readonly preferencesStore: AudioPreferencesStore;
  private readonly createAudioContext: () => AudioContextLike | null;
  private musicPlayer: MusicPlayerPort;
  private ambiencePlayer: AmbiencePlayerPort;

  private context: AudioContextLike | null = null;
  private musicGain: GainNodeLike | null = null;
  private sfxGain: GainNodeLike | null = null;
  private ambientMasterGain: GainNodeLike | null = null;
  private mediaGain: GainNodeLike | null = null;
  private compressor: DynamicsCompressorNodeLike | null = null;

  private unlocked = false;
  private experienceActive = false;
  private mediaPlaybackActive = false;
  private suspendedByVisibility = false;
  private musicBusConnected = false;
  private unsubscribePrefs: (() => void) | null = null;
  private readonly unlockListeners = new Set<() => void>();
  private readonly documentRef: DocumentLifecycleTarget | null;
  private readonly navigatorRef: AudioSessionNavigatorTarget | null;
  private visibilityHandler: (() => void) | null = null;

  constructor(options: AudioEngineOptions = {}) {
    this.preferencesStore =
      options.preferencesStore ?? getSharedAudioPreferencesStore();
    this.createAudioContext =
      options.createAudioContext ?? defaultCreateAudioContext;
    this.musicPlayer = options.musicPlayer ?? noopMusicPlayerPort;
    this.ambiencePlayer = options.ambiencePlayer ?? noopAmbiencePlayerPort;
    this.documentRef =
      options.documentRef !== undefined
        ? options.documentRef
        : typeof document !== "undefined"
          ? document
          : null;
    this.navigatorRef =
      options.navigatorRef !== undefined
        ? options.navigatorRef
        : typeof navigator !== "undefined"
          ? (navigator as unknown as AudioSessionNavigatorTarget)
          : null;

    this.initLifecycle();
    this.unsubscribePrefs = this.preferencesStore.subscribe(() => {
      this.syncBuses();
    });
  }

  private initLifecycle(): void {
    try {
      if (this.navigatorRef?.audioSession) {
        this.navigatorRef.audioSession.type =
          AUDIO_TOKENS.IOS_AUDIO_SESSION_TYPE;
      }
    } catch {
      // Ignore read-only audioSession implementations
    }

    if (
      this.documentRef &&
      typeof this.documentRef.addEventListener === "function" &&
      !this.visibilityHandler
    ) {
      this.visibilityHandler = () => {
        this.handleVisibilityChange();
      };
      this.documentRef.addEventListener(
        "visibilitychange",
        this.visibilityHandler,
      );
    }
  }

  private handleVisibilityChange(): void {
    if (!this.documentRef) {
      return;
    }
    if (this.documentRef.visibilityState === "hidden") {
      this.suspendedByVisibility = true;
      this.syncBuses();
      if (this.context && this.context.state === "running") {
        void this.context.suspend().catch(() => {});
      }
      return;
    }

    if (this.documentRef.visibilityState === "visible") {
      this.suspendedByVisibility = false;
      if (this.context && this.unlocked && this.context.state === "suspended") {
        void this.context
          .resume()
          .then(() => {
            this.syncBuses();
          })
          .catch(() => {});
      }
      this.syncBuses();
    }
  }

  public getPreferencesStore(): AudioPreferencesStore {
    return this.preferencesStore;
  }

  public isContextUnlocked(): boolean {
    return this.unlocked && this.context?.state === "running";
  }

  public isExperienceActive(): boolean {
    return this.experienceActive;
  }

  public isEffectsAudible(): boolean {
    return (
      this.experienceActive &&
      !this.suspendedByVisibility &&
      this.preferencesStore.getDerivedChannels().effectsAudible
    );
  }

  public isMusicAudible(): boolean {
    return (
      this.experienceActive &&
      !this.suspendedByVisibility &&
      this.preferencesStore.getDerivedChannels().musicAudible
    );
  }

  public getAudioContext(): AudioContextLike | null {
    return this.context;
  }

  public getMusicBus(): AudioBusTarget | null {
    if (!this.context || !this.musicGain) {
      return null;
    }
    return { context: this.context, inputNode: this.musicGain };
  }

  public getSfxBus(): AudioBusTarget | null {
    if (!this.context || !this.sfxGain) {
      return null;
    }
    return { context: this.context, inputNode: this.sfxGain };
  }

  public getMediaBus(): AudioBusTarget | null {
    if (!this.context || !this.mediaGain) {
      return null;
    }
    return { context: this.context, inputNode: this.mediaGain };
  }

  public setMusicPlayer(player: MusicPlayerPort): void {
    this.musicPlayer = player;
    this.musicBusConnected = false;
    this.ensureMusicBusConnected();
    this.syncBuses();
  }

  public setAmbiencePlayer(player: AmbiencePlayerPort): void {
    this.ambiencePlayer = player;
    this.syncBuses();
  }

  public onUnlock(listener: () => void): () => void {
    this.unlockListeners.add(listener);
    return () => {
      this.unlockListeners.delete(listener);
    };
  }

  public async unlockFromUserGesture(): Promise<boolean> {
    const ctx = this.ensureGraph();
    if (!ctx) {
      return false;
    }
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      this.unlocked = ctx.state === "running";
      this.syncBuses();
      if (this.unlocked) {
        for (const listener of this.unlockListeners) {
          listener();
        }
      }
      return this.unlocked;
    } catch {
      return false;
    }
  }

  public activateExperience(roomId: RoomId): void {
    this.experienceActive = true;
    this.ensureMusicBusConnected();
    this.musicPlayer.setActiveRoom(roomId);
    this.ambiencePlayer.transitionToEnvironment(ROOM_ENVIRONMENT_IDS[roomId]);
    this.syncBuses();
  }

  public notifyCurtainFadeOut(): void {
    this.musicPlayer.onCurtainFadeOut();
  }

  public notifyCurtainFadeIn(targetRoomId: RoomId): void {
    this.musicPlayer.setActiveRoom(targetRoomId);
    this.musicPlayer.onCurtainFadeIn();
    this.ambiencePlayer.transitionToEnvironment(
      ROOM_ENVIRONMENT_IDS[targetRoomId],
    );
  }

  public deactivateExperience(): void {
    this.experienceActive = false;
    this.mediaPlaybackActive = false;
    this.musicPlayer.setAudible(false);
    this.musicPlayer.stopAll();
    this.ambiencePlayer.setAudible(false);
    this.ambiencePlayer.stopAll();
    this.syncBuses();
  }

  public setMediaPlaybackActive(active: boolean): void {
    this.mediaPlaybackActive = active;
    this.syncBuses();
  }

  public dispose(): void {
    this.deactivateExperience();
    this.unsubscribePrefs?.();
    this.unsubscribePrefs = null;
    if (
      this.documentRef &&
      this.visibilityHandler &&
      typeof this.documentRef.removeEventListener === "function"
    ) {
      this.documentRef.removeEventListener(
        "visibilitychange",
        this.visibilityHandler,
      );
      this.visibilityHandler = null;
    }
  }

  private ensureGraph(): AudioContextLike | null {
    if (this.context) {
      return this.context;
    }
    const ctx = this.createAudioContext();
    if (!ctx) {
      return null;
    }

    const musicGain = ctx.createGain();
    const sfxGain = ctx.createGain();
    const ambientMasterGain = ctx.createGain();
    const mediaGain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    compressor.threshold.value = AUDIO_TOKENS.COMPRESSOR_THRESHOLD_DB;
    compressor.knee.value = AUDIO_TOKENS.COMPRESSOR_KNEE_DB;
    compressor.ratio.value = AUDIO_TOKENS.COMPRESSOR_RATIO;
    compressor.attack.value = AUDIO_TOKENS.COMPRESSOR_ATTACK_S;
    compressor.release.value = AUDIO_TOKENS.COMPRESSOR_RELEASE_S;

    musicGain.connect(ambientMasterGain);
    sfxGain.connect(ambientMasterGain);
    ambientMasterGain.connect(compressor);
    mediaGain.connect(compressor);
    compressor.connect(ctx.destination);

    this.context = ctx;
    this.musicGain = musicGain;
    this.sfxGain = sfxGain;
    this.ambientMasterGain = ambientMasterGain;
    this.mediaGain = mediaGain;
    this.compressor = compressor;

    this.ensureMusicBusConnected();
    this.syncBuses();
    return ctx;
  }

  private ensureMusicBusConnected(): void {
    if (this.musicBusConnected) {
      return;
    }
    const musicBus = this.getMusicBus();
    if (musicBus) {
      this.musicPlayer.connectBus(musicBus);
      this.musicBusConnected = true;
    }
  }

  private syncBuses(): void {
    const prefs = this.preferencesStore.getPreferences();
    const channels = this.preferencesStore.getDerivedChannels();
    const musicAudible =
      this.experienceActive &&
      !this.suspendedByVisibility &&
      channels.musicAudible;
    const effectsAudible =
      this.experienceActive &&
      !this.suspendedByVisibility &&
      channels.effectsAudible;

    this.musicPlayer.setAudible(musicAudible);
    this.ambiencePlayer.setAudible(effectsAudible);

    if (!this.context || !this.musicGain || !this.sfxGain || !this.mediaGain) {
      return;
    }

    const now = this.context.currentTime;
    const isDucked = this.mediaPlaybackActive && !channels.mediaMuted;
    const musicCeiling = isDucked
      ? AUDIO_TOKENS.MUSIC_DUCK_GAIN
      : AUDIO_TOKENS.MUSIC_DEFAULT_GAIN;
    const targetMusicGain = !musicAudible ? 0 : prefs.musicVolume * musicCeiling;
    const targetSfxGain = !effectsAudible
      ? 0
      : prefs.effectsVolume * AUDIO_TOKENS.SFX_GAIN;

    const musicTau = isDucked
      ? AUDIO_TOKENS.DUCK_RAMP_MS /
        AUDIO_TOKENS.MS_PER_SECOND /
        AUDIO_TOKENS.DUCK_TAU_SETTLE_DIVISOR
      : AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S;

    this.musicGain.gain.setTargetAtTime(targetMusicGain, now, musicTau);
    this.sfxGain.gain.setTargetAtTime(
      targetSfxGain,
      now,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );
    this.mediaGain.gain.setTargetAtTime(
      channels.mediaMuted ? 0 : 1,
      now,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );
  }
}

let sharedAudioEngine = new AudioEngine();

export function getSharedAudioEngine(): AudioEngine {
  return sharedAudioEngine;
}

export function setSharedAudioEngine(engine: AudioEngine | null): void {
  sharedAudioEngine = engine ?? new AudioEngine();
}
