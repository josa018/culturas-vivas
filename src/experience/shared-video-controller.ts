import { RENDERER_QUALITY_TOKENS, SHARED_VIDEO_ELEMENT_ID } from "./constants";
import {
  AudioPreferencesStore,
  getSharedAudioPreferencesStore,
} from "./audio/audio-preferences-store";
import { AudioEngine, getSharedAudioEngine } from "./audio/audio-engine";
import {
  SpatialMediaAudio,
  getSharedSpatialMediaAudio,
} from "./audio/spatial-media-audio";

export interface VideoElementLike {
  id: string;
  src: string;
  muted: boolean;
  paused: boolean;
  loop: boolean;
  playsInline: boolean;
  crossOrigin: string | null;
  preload: string;
  style: {
    display?: string;
    position?: string;
    width?: string;
    height?: string;
    opacity?: string;
    pointerEvents?: string;
  };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

export interface DisposableVideoTexture {
  colorSpace?: string;
  minFilter?: number;
  magFilter?: number;
  generateMipmaps?: boolean;
  anisotropy?: number;
  needsUpdate: boolean;
  dispose(): void;
}

export interface SharedVideoControllerOptions {
  readonly createVideoElement?: () => VideoElementLike | null;
  readonly createVideoTexture?: (video: VideoElementLike) => DisposableVideoTexture | null;
  readonly onStateChange?: () => void;
  readonly preferencesStore?: AudioPreferencesStore;
  readonly audioEngine?: AudioEngine;
  readonly spatialMediaAudio?: SpatialMediaAudio;
  readonly isExperienceActive?: () => boolean;
}

const NOT_ALLOWED_ERROR_NAME = "NotAllowedError";

function isNotAllowedError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  return (err as { name?: unknown }).name === NOT_ALLOWED_ERROR_NAME;
}

function defaultCreateVideoElement(): VideoElementLike | null {
  if (typeof document === "undefined") {
    return null;
  }
  const existing = document.getElementById(SHARED_VIDEO_ELEMENT_ID);
  if (existing && "play" in existing) {
    return existing as unknown as VideoElementLike;
  }
  const el = document.createElement("video");
  if (document.body) {
    document.body.appendChild(el);
  }
  return el as unknown as VideoElementLike;
}

function defaultCreateVideoTexture(
  video: VideoElementLike,
): DisposableVideoTexture | null {
  const aframeGlobal = (
    globalThis as {
      AFRAME?: {
        THREE?: {
          SRGBColorSpace?: string;
          LinearMipmapLinearFilter?: number;
          LinearFilter?: number;
          VideoTexture?: new (el: VideoElementLike) => DisposableVideoTexture;
        };
      };
    }
  ).AFRAME;
  const VideoTextureCtor = aframeGlobal?.THREE?.VideoTexture;
  if (!VideoTextureCtor) {
    return null;
  }
  const texture = new VideoTextureCtor(video);
  // Restore A-Frame's trilinear mipmap defaults bypassed by direct VideoTexture binding.
  texture.minFilter =
    aframeGlobal?.THREE?.LinearMipmapLinearFilter ??
    RENDERER_QUALITY_TOKENS.DEFAULT_LINEAR_MIPMAP_LINEAR_FILTER;
  texture.magFilter =
    aframeGlobal?.THREE?.LinearFilter ??
    RENDERER_QUALITY_TOKENS.DEFAULT_LINEAR_FILTER;
  texture.generateMipmaps = true;
  texture.anisotropy = RENDERER_QUALITY_TOKENS.TEXTURE_ANISOTROPY;
  const srgbColorSpace = aframeGlobal?.THREE?.SRGBColorSpace;
  if (srgbColorSpace) {
    texture.colorSpace = srgbColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

/**
 * Manages a single reusable HTML5 video decoder across all 3D cultural stands.
 */
export class SharedVideoController {
  private readonly createVideoElement: () => VideoElementLike | null;
  private readonly createVideoTexture: (
    video: VideoElementLike,
  ) => DisposableVideoTexture | null;
  private readonly onStateChange?: () => void;
  private readonly preferencesStore: AudioPreferencesStore;
  private readonly audioEngine: AudioEngine;
  private readonly spatialMediaAudio: SpatialMediaAudio;
  private readonly isExperienceActiveGuard?: () => boolean;
  private readonly stateListeners = new Set<() => void>();

  private video: VideoElementLike | null = null;
  private texture: DisposableVideoTexture | null = null;
  private unlocked = false;
  private playing = false;
  private muted: boolean;
  private currentUrl: string | null = null;
  private playSequenceId = 0;
  private unsubscribePrefs: (() => void) | null = null;

  constructor(options: SharedVideoControllerOptions = {}) {
    this.createVideoElement = options.createVideoElement ?? defaultCreateVideoElement;
    this.createVideoTexture = options.createVideoTexture ?? defaultCreateVideoTexture;
    this.onStateChange = options.onStateChange;
    this.preferencesStore =
      options.preferencesStore ?? getSharedAudioPreferencesStore();
    this.audioEngine = options.audioEngine ?? getSharedAudioEngine();
    this.spatialMediaAudio =
      options.spatialMediaAudio ?? getSharedSpatialMediaAudio();
    this.isExperienceActiveGuard = options.isExperienceActive;
    this.muted = this.preferencesStore.getPreferences().mediaMuted;

    this.unsubscribePrefs = this.preferencesStore.subscribe((prefs) => {
      if (this.muted !== prefs.mediaMuted) {
        this.muted = prefs.mediaMuted;
        if (this.video) {
          this.video.muted = this.muted;
        }
        this.emitStateChange();
      }
    });
  }

  public subscribeStateChange(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private emitStateChange(): void {
    this.onStateChange?.();
    for (const listener of this.stateListeners) {
      listener();
    }
  }

  public ensureVideoElement(): VideoElementLike | null {
    if (this.video) {
      return this.video;
    }
    const created = this.createVideoElement();
    if (!created) {
      return null;
    }
    created.id = SHARED_VIDEO_ELEMENT_ID;
    created.playsInline = true;
    created.crossOrigin = "anonymous";
    created.preload = "metadata";
    created.loop = false;
    created.style.position = "fixed";
    created.style.width = "1px";
    created.style.height = "1px";
    created.style.opacity = "0";
    created.style.pointerEvents = "none";
    created.setAttribute("playsinline", "");
    created.setAttribute("webkit-playsinline", "");
    created.setAttribute("crossorigin", "anonymous");
    this.video = created;
    return created;
  }

  public getVideoElement(): VideoElementLike | null {
    return this.video;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  public getTexture(): DisposableVideoTexture | null {
    return this.texture;
  }

  /**
   * Primes media playback synchronously inside a DOM user-gesture stack for Safari/iOS WebKit.
   */
  public async unlockFromUserGesture(): Promise<void> {
    const video = this.ensureVideoElement();
    this.unlocked = true;
    if (!video || this.playing) {
      return;
    }
    const prevMuted = video.muted;
    video.muted = true;
    try {
      await video.play();
      video.pause();
    } catch {
      // Browsers without a bound media src may reject; gesture unlock registration succeeded.
    } finally {
      video.muted = this.muted || prevMuted;
    }
  }

  public async playVideo(
    url: string,
    options?: { readonly muted?: boolean },
  ): Promise<DisposableVideoTexture | null> {
    if (this.isExperienceActiveGuard && !this.isExperienceActiveGuard()) {
      return null;
    }
    const video = this.ensureVideoElement();
    if (!video) {
      return null;
    }

    const seq = ++this.playSequenceId;
    this.disposeTexture();

    if (options?.muted !== undefined) {
      this.preferencesStore.syncMediaMuted(options.muted);
    }
    this.muted = this.preferencesStore.getPreferences().mediaMuted;

    video.muted = this.muted;
    this.spatialMediaAudio.attachVideoElement(video);
    video.src = url;
    video.load();
    this.currentUrl = url;

    const started = await this.attemptPlayWithMutedFallback(video, seq);
    if (seq !== this.playSequenceId) {
      return null;
    }

    this.playing = started;
    if (started) {
      this.texture = this.createVideoTexture(video);
    }
    this.audioEngine.setMediaPlaybackActive(started);
    this.emitStateChange();
    return this.texture;
  }

  public async togglePause(): Promise<boolean> {
    if (!this.video || !this.currentUrl) {
      return false;
    }
    if (this.playing) {
      this.video.pause();
      this.playing = false;
      this.audioEngine.setMediaPlaybackActive(false);
      this.emitStateChange();
      return false;
    }
    if (this.isExperienceActiveGuard && !this.isExperienceActiveGuard()) {
      return false;
    }
    const seq = ++this.playSequenceId;
    const resumed = await this.attemptPlayWithMutedFallback(this.video, seq);
    if (seq !== this.playSequenceId) {
      return false;
    }
    this.playing = resumed;
    this.audioEngine.setMediaPlaybackActive(resumed);
    this.emitStateChange();
    return this.playing;
  }

  public setMuted(muted: boolean): boolean {
    this.muted = muted;
    if (this.video) {
      this.video.muted = muted;
    }
    this.preferencesStore.syncMediaMuted(muted);
    this.emitStateChange();
    return this.muted;
  }

  public toggleMute(): boolean {
    void this.audioEngine.unlockFromUserGesture().then((ok) => {
      if (ok) {
        this.spatialMediaAudio.ensureConnected();
      }
    });
    const nextPrefs = this.preferencesStore.toggleStandMedia();
    this.muted = nextPrefs.mediaMuted;
    if (this.video) {
      this.video.muted = this.muted;
    }
    this.emitStateChange();
    return this.muted;
  }

  /**
   * Pauses active playback without clearing src or disposing textures so tour resumption stays seamless.
   */
  public pauseIfPlaying(): boolean {
    if (!this.video || !this.playing) {
      return false;
    }
    this.playSequenceId += 1;
    this.video.pause();
    this.playing = false;
    this.audioEngine.setMediaPlaybackActive(false);
    this.emitStateChange();
    return true;
  }

  /**
   * Halts playback, clears src + invokes load() to free hardware decoder slots, and disposes texture.
   */
  public stopAndRelease(): void {
    this.playSequenceId += 1;
    this.disposeTexture();
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.src = "";
      this.video.load();
    }
    this.playing = false;
    this.currentUrl = null;
    this.audioEngine.setMediaPlaybackActive(false);
    this.emitStateChange();
  }

  public dispose(): void {
    this.stopAndRelease();
    this.unsubscribePrefs?.();
    this.unsubscribePrefs = null;
    this.stateListeners.clear();
  }

  private disposeTexture(): void {
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
  }

  private async attemptPlayWithMutedFallback(
    video: VideoElementLike,
    seq: number,
  ): Promise<boolean> {
    try {
      await video.play();
      return seq === this.playSequenceId;
    } catch (error) {
      if (seq !== this.playSequenceId) {
        return false;
      }
      if (isNotAllowedError(error) && !video.muted) {
        this.muted = true;
        video.muted = true;
        this.preferencesStore.syncMediaMuted(true);
        try {
          await video.play();
          return seq === this.playSequenceId;
        } catch {
          return false;
        }
      }
      return false;
    }
  }
}

let sharedVideoController = new SharedVideoController({
  isExperienceActive: () => getSharedAudioEngine().isExperienceActive(),
});

export function getSharedVideoController(): SharedVideoController {
  return sharedVideoController;
}

export function setSharedVideoController(controller: SharedVideoController): void {
  sharedVideoController = controller;
}
