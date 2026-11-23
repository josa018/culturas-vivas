import type { RoomId } from "../../shared/room-catalog";
import { AUDIO_PLAYLIST_CONSTANTS } from "./audio-constants";
import type { PlaylistPlaybackMode } from "./music-playlist-queue";

export interface RoomAudioTrack {
  readonly id: string;
  readonly roomId: RoomId;
  readonly title: string;
  readonly artistCredit: string;
  readonly licenseNote: string;
  readonly mediaKey: string;
  readonly mediaUrl: string;
  readonly mimeType: "audio/mpeg" | "audio/mp4" | string;
  readonly fileSizeBytes: number;
  readonly durationMs: number | null;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RoomPlaylistPayload {
  readonly roomId: RoomId;
  readonly resolvedFromRoomId: RoomId;
  readonly playbackMode: PlaylistPlaybackMode;
  readonly tracks: readonly RoomAudioTrack[];
}

export interface RoomPlaylistClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
}

function createEmptyFallback(roomId: RoomId): RoomPlaylistPayload {
  return {
    roomId,
    resolvedFromRoomId: roomId,
    playbackMode: "SEQUENTIAL",
    tracks: [],
  };
}

function normalizeMode(raw: unknown): PlaylistPlaybackMode {
  return raw === "SHUFFLE" ? "SHUFFLE" : "SEQUENTIAL";
}

/**
 * Fetches per-room playlist configuration from /api/audio with a 3000 ms timeout
 * and graceful silent fallback.
 */
export class RoomPlaylistClient {
  private readonly fetchImpl: typeof fetch | null;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: RoomPlaylistClientOptions = {}) {
    this.fetchImpl =
      options.fetchImpl ??
      (typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null);
    this.endpoint =
      options.endpoint ?? AUDIO_PLAYLIST_CONSTANTS.PUBLIC_AUDIO_ENDPOINT;
    this.timeoutMs =
      options.timeoutMs ?? AUDIO_PLAYLIST_CONSTANTS.FETCH_TIMEOUT_MS;
  }

  public async fetchRoomPlaylist(roomId: RoomId): Promise<RoomPlaylistPayload> {
    if (!this.fetchImpl) {
      return createEmptyFallback(roomId);
    }

    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutHandle =
      controller && this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

    try {
      const response = await this.fetchImpl(
        `${this.endpoint}?roomId=${encodeURIComponent(roomId)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          ...(controller ? { signal: controller.signal } : {}),
        },
      );
      if (!response.ok) {
        return createEmptyFallback(roomId);
      }

      const data = (await response.json()) as Partial<RoomPlaylistPayload>;
      const tracks = Array.isArray(data.tracks)
        ? data.tracks.filter(
            (t): t is RoomAudioTrack =>
              Boolean(t) &&
              typeof t.id === "string" &&
              typeof t.mediaUrl === "string" &&
              t.mediaUrl.length > 0,
          )
        : [];

      return {
        roomId,
        resolvedFromRoomId: data.resolvedFromRoomId ?? roomId,
        playbackMode: normalizeMode(data.playbackMode),
        tracks,
      };
    } catch {
      return createEmptyFallback(roomId);
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}

let sharedRoomPlaylistClient: RoomPlaylistClient | null = null;

export function getSharedRoomPlaylistClient(): RoomPlaylistClient {
  if (!sharedRoomPlaylistClient) {
    sharedRoomPlaylistClient = new RoomPlaylistClient();
  }
  return sharedRoomPlaylistClient;
}
