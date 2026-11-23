import type { RoomId } from "../../shared/room-catalog";
import type { AmbientAudioElementLike } from "./ambience-player";
import { AUDIO_PLAYLIST_CONSTANTS } from "./audio-constants";
import { getSharedAudioEngine } from "./audio-engine";
import type {
  AudioBusTarget,
  AudioNodeLike,
  MusicPlayerPort,
} from "./audio-types";
import { MusicPlaylistQueue } from "./music-playlist-queue";
import {
  getSharedRoomPlaylistClient,
  type RoomAudioTrack,
  type RoomPlaylistClient,
  type RoomPlaylistPayload,
} from "./room-playlist-client";

export interface MusicAudioElementLike extends AmbientAudioElementLike {
  currentTime: number;
  addEventListener(type: "ended" | "error", listener: () => void): void;
  removeEventListener(type: "ended" | "error", listener: () => void): void;
}

export interface MusicPlayerOptions {
  readonly playlistClient?: RoomPlaylistClient;
  readonly createAudioElement?: () => MusicAudioElementLike | null;
  readonly random?: () => number;
}

interface PlaylistSignature {
  readonly resolvedFromRoomId: RoomId;
  readonly trackIds: readonly string[];
}

function defaultCreateMusicAudio(): MusicAudioElementLike | null {
  if (typeof document === "undefined") {
    return null;
  }
  const el = document.createElement("audio");
  return el as unknown as MusicAudioElementLike;
}

function signaturesMatch(
  a: PlaylistSignature | null,
  b: PlaylistSignature,
): boolean {
  if (!a || a.resolvedFromRoomId !== b.resolvedFromRoomId) {
    return false;
  }
  if (a.trackIds.length !== b.trackIds.length) {
    return false;
  }
  return a.trackIds.every((id, idx) => b.trackIds[idx] === id);
}

/**
 * Plays room-scoped background music playlists routed into AudioEngine.musicGain,
 * advancing tracks seamlessly and preserving continuity across Lobby fallbacks.
 */
export class MusicPlayer implements MusicPlayerPort {
  private readonly playlistClient: RoomPlaylistClient;
  private readonly createAudioElement: () => MusicAudioElementLike | null;
  private readonly random: () => number;

  private audioElement: MusicAudioElementLike | null = null;
  private sourceNode: AudioNodeLike | null = null;
  private busTarget: AudioBusTarget | null = null;

  private audible = false;
  private curtainTransitioning = false;
  private latestRequestedRoomId: RoomId | null = null;
  private loadedSignature: PlaylistSignature | null = null;
  private loadedTracks: readonly RoomAudioTrack[] = [];
  private queue: MusicPlaylistQueue | null = null;
  private loadedTrackIndex: number | null = null;
  private consecutiveErrors = 0;

  private readonly handleEnded = (): void => {
    this.consecutiveErrors = 0;
    this.advanceTrack();
  };

  private readonly handleError = (): void => {
    this.consecutiveErrors += 1;
    const maxRetries = Math.min(
      this.loadedTracks.length,
      AUDIO_PLAYLIST_CONSTANTS.MAX_CONSECUTIVE_TRACK_ERRORS,
    );
    if (this.loadedTracks.length > 1 && this.consecutiveErrors < maxRetries) {
      this.advanceTrack();
      return;
    }
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }
  };

  constructor(options: MusicPlayerOptions = {}) {
    this.playlistClient =
      options.playlistClient ?? getSharedRoomPlaylistClient();
    this.createAudioElement =
      options.createAudioElement ?? defaultCreateMusicAudio;
    this.random = options.random ?? Math.random;
  }

  public connectBus(bus: AudioBusTarget | null): void {
    this.busTarget = bus;
    this.ensureGraphConnected();
  }

  public setActiveRoom(roomId: RoomId): void {
    this.latestRequestedRoomId = roomId;
    void this.loadRoomPlaylist(roomId);
  }

  public isAudible(): boolean {
    return this.audible;
  }

  public setAudible(audible: boolean): void {
    if (this.audible === audible) {
      return;
    }
    this.audible = audible;
    if (!audible) {
      if (this.audioElement && !this.audioElement.paused) {
        this.audioElement.pause();
      }
      return;
    }
    if (!this.curtainTransitioning) {
      this.startOrResumeCurrentTrack();
    }
  }

  public onCurtainFadeOut(): void {
    this.curtainTransitioning = true;
  }

  public onCurtainFadeIn(): void {
    this.curtainTransitioning = false;
    if (this.audible) {
      this.startOrResumeCurrentTrack();
    }
  }

  public stopAll(): void {
    this.audible = false;
    this.latestRequestedRoomId = null;
    this.loadedSignature = null;
    this.loadedTracks = [];
    this.queue = null;
    this.loadedTrackIndex = null;
    this.consecutiveErrors = 0;
    this.curtainTransitioning = false;

    if (this.audioElement) {
      if (!this.audioElement.paused) {
        this.audioElement.pause();
      }
      try {
        this.audioElement.currentTime = 0;
      } catch {
        // Ignore read-only currentTime in minimal mocks
      }
    }
  }

  private async loadRoomPlaylist(roomId: RoomId): Promise<void> {
    const payload = await this.playlistClient.fetchRoomPlaylist(roomId);
    if (this.latestRequestedRoomId !== roomId) {
      return;
    }
    this.applyPlaylist(payload);
  }

  private applyPlaylist(payload: RoomPlaylistPayload): void {
    const incomingSignature: PlaylistSignature = {
      resolvedFromRoomId: payload.resolvedFromRoomId,
      trackIds: payload.tracks.map((t) => t.id),
    };

    if (
      signaturesMatch(this.loadedSignature, incomingSignature) &&
      this.queue !== null
    ) {
      if (
        this.audible &&
        !this.curtainTransitioning &&
        this.audioElement?.paused
      ) {
        this.startOrResumeCurrentTrack();
      }
      return;
    }

    this.loadedSignature = incomingSignature;
    this.loadedTracks = payload.tracks;
    this.consecutiveErrors = 0;
    this.queue = new MusicPlaylistQueue(
      payload.tracks.length,
      payload.playbackMode,
      this.random,
    );

    const firstIndex = this.queue.current();
    this.loadedTrackIndex = firstIndex;

    if (firstIndex === null || !payload.tracks[firstIndex]) {
      if (this.audioElement && !this.audioElement.paused) {
        this.audioElement.pause();
      }
      return;
    }

    this.loadTrackSource(payload.tracks[firstIndex]!);
    if (this.audible && !this.curtainTransitioning) {
      this.playCurrentElement();
    }
  }

  private advanceTrack(): void {
    if (!this.queue || this.loadedTracks.length === 0) {
      return;
    }
    const nextIndex = this.queue.next();
    if (nextIndex === null) {
      return;
    }
    const nextTrack = this.loadedTracks[nextIndex];
    if (!nextTrack) {
      return;
    }
    this.loadedTrackIndex = nextIndex;
    this.loadTrackSource(nextTrack);
    if (this.audible && !this.curtainTransitioning) {
      this.playCurrentElement();
    }
  }

  private loadTrackSource(track: RoomAudioTrack): void {
    const el = this.ensureAudioElement();
    if (!el) {
      return;
    }
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.loop = false;
    el.src = track.mediaUrl;
    try {
      el.currentTime = 0;
    } catch {
      // Ignore unsettable currentTime before metadata
    }
  }

  private startOrResumeCurrentTrack(): void {
    if (this.loadedTracks.length === 0 || this.loadedTrackIndex === null) {
      return;
    }
    const track = this.loadedTracks[this.loadedTrackIndex];
    if (!track) {
      return;
    }
    const el = this.ensureAudioElement();
    if (!el) {
      return;
    }
    if (el.src !== track.mediaUrl) {
      this.loadTrackSource(track);
    }
    if (el.paused) {
      this.playCurrentElement();
    }
  }

  private playCurrentElement(): void {
    const el = this.ensureAudioElement();
    if (!el) {
      return;
    }
    this.ensureGraphConnected();
    void el.play().catch(() => {
      // Ignore autoplay rejection until unlocked by user gesture
    });
  }

  private ensureAudioElement(): MusicAudioElementLike | null {
    if (this.audioElement) {
      return this.audioElement;
    }
    const created = this.createAudioElement();
    if (!created) {
      return null;
    }
    created.addEventListener("ended", this.handleEnded);
    created.addEventListener("error", this.handleError);
    this.audioElement = created;
    this.ensureGraphConnected();
    return created;
  }

  private ensureGraphConnected(): void {
    if (!this.busTarget || !this.audioElement || this.sourceNode) {
      return;
    }
    try {
      const source = this.busTarget.context.createMediaElementSource(
        this.audioElement,
      );
      source.connect(this.busTarget.inputNode);
      this.sourceNode = source;
    } catch {
      // Ignore if MediaElementSource already attached or unsupported in mock
    }
  }
}

let sharedMusicPlayer: MusicPlayer | null = null;

export function getSharedMusicPlayer(): MusicPlayer {
  if (!sharedMusicPlayer) {
    sharedMusicPlayer = new MusicPlayer();
    getSharedAudioEngine().setMusicPlayer(sharedMusicPlayer);
  }
  return sharedMusicPlayer;
}

export function setSharedMusicPlayer(player: MusicPlayer | null): void {
  sharedMusicPlayer = player;
}
