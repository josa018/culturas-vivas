import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_PLAYLIST_CONSTANTS } from "../../src/experience/audio/audio-constants";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import {
  MusicPlayer,
  type MusicAudioElementLike,
} from "../../src/experience/audio/music-player";
import type {
  AudioBusTarget,
  AudioContextLike,
  AudioNodeLike,
} from "../../src/experience/audio/audio-types";
import {
  RoomPlaylistClient,
  type RoomPlaylistPayload,
} from "../../src/experience/audio/room-playlist-client";
import { RoomId } from "../../src/shared/room-catalog";

function createFakeAudioElement(): MusicAudioElementLike & {
  emit(type: "ended" | "error"): void;
  playCount: number;
  pauseCount: number;
} {
  const listeners: Record<"ended" | "error", Set<() => void>> = {
    ended: new Set(),
    error: new Set(),
  };
  return {
    src: "",
    loop: false,
    crossOrigin: null,
    preload: "none",
    volume: 1,
    paused: true,
    currentTime: 0,
    playCount: 0,
    pauseCount: 0,
    async play() {
      this.paused = false;
      this.playCount += 1;
    },
    pause() {
      this.paused = true;
      this.pauseCount += 1;
    },
    addEventListener(type, listener) {
      listeners[type].add(listener);
    },
    removeEventListener(type, listener) {
      listeners[type].delete(listener);
    },
    emit(type) {
      for (const listener of [...listeners[type]]) {
        listener();
      }
    },
  };
}

function createFakeBus(): {
  bus: AudioBusTarget;
  createMediaElementSource: ReturnType<typeof vi.fn>;
  connectSpy: ReturnType<typeof vi.fn>;
} {
  const connectSpy = vi.fn((dest: AudioNodeLike) => dest);
  const createMediaElementSource = vi.fn(() => ({
    connect: connectSpy,
    disconnect: vi.fn(),
  }));

  const param = () => ({
    value: 1,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
  });
  const makeNode = () => ({
    connect: vi.fn((dest: AudioNodeLike) => dest),
    disconnect: vi.fn(),
  });

  const context: AudioContextLike = {
    state: "running",
    currentTime: 0,
    destination: makeNode(),
    listener: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    createGain: () => ({ ...makeNode(), gain: param() }),
    createDynamicsCompressor: () => ({
      ...makeNode(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }),
    createBiquadFilter: () => ({
      ...makeNode(),
      type: "lowpass",
      frequency: param(),
    }),
    createPanner: () => ({
      ...makeNode(),
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 1,
      rolloffFactor: 0,
    }),
    createMediaElementSource,
    createBufferSource: () => ({
      ...makeNode(),
      buffer: null,
      start: vi.fn(),
    }),
    decodeAudioData: vi.fn(),
  };

  return {
    bus: { context, inputNode: makeNode() },
    createMediaElementSource,
    connectSpy,
  };
}

describe("RoomPlaylistClient & MusicPlayer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("RoomPlaylistClient enforces 3000ms timeout and returns empty SEQUENTIAL fallback on error", async () => {
    vi.useFakeTimers();

    const stalledFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const client = new RoomPlaylistClient({
      fetchImpl: stalledFetch as unknown as typeof fetch,
    });
    const pending = client.fetchRoomPlaylist(RoomId.WIXARIKA);

    await vi.advanceTimersByTimeAsync(AUDIO_PLAYLIST_CONSTANTS.FETCH_TIMEOUT_MS + 10);
    const timedOut = await pending;

    expect(timedOut).toEqual({
      roomId: RoomId.WIXARIKA,
      resolvedFromRoomId: RoomId.WIXARIKA,
      playbackMode: "SEQUENTIAL",
      tracks: [],
    });

    const okClient = new RoomPlaylistClient({
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({
          roomId: RoomId.ODAM,
          resolvedFromRoomId: RoomId.LOBBY,
          playbackMode: "SHUFFLE",
          tracks: [
            {
              id: "lob-1",
              roomId: RoomId.LOBBY,
              title: "Atrio",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-1.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-1.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      })) as unknown as typeof fetch,
    });

    const fetched = await okClient.fetchRoomPlaylist(RoomId.ODAM);
    expect(fetched.resolvedFromRoomId).toBe(RoomId.LOBBY);
    expect(fetched.playbackMode).toBe("SHUFFLE");
    expect(fetched.tracks).toHaveLength(1);
  });

  it("MusicPlayer advances on ended, skips errored tracks, preserves fallback continuity, and swaps cleanly on room-specific playlists", async () => {
    const playlists = new Map<RoomId, RoomPlaylistPayload>([
      [
        RoomId.LOBBY,
        {
          roomId: RoomId.LOBBY,
          resolvedFromRoomId: RoomId.LOBBY,
          playbackMode: "SEQUENTIAL",
          tracks: [
            {
              id: "lob-1",
              roomId: RoomId.LOBBY,
              title: "Lobby 1",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-1.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-1.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 0,
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "lob-2",
              roomId: RoomId.LOBBY,
              title: "Lobby 2",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-2.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-2.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 1,
              createdAt: 2,
              updatedAt: 2,
            },
            {
              id: "lob-3",
              roomId: RoomId.LOBBY,
              title: "Lobby 3",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-3.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-3.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 2,
              createdAt: 3,
              updatedAt: 3,
            },
          ],
        },
      ],
      [
        RoomId.ODAM,
        {
          roomId: RoomId.ODAM,
          resolvedFromRoomId: RoomId.LOBBY,
          playbackMode: "SEQUENTIAL",
          tracks: [
            {
              id: "lob-1",
              roomId: RoomId.LOBBY,
              title: "Lobby 1",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-1.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-1.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 0,
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "lob-2",
              roomId: RoomId.LOBBY,
              title: "Lobby 2",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-2.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-2.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 1,
              createdAt: 2,
              updatedAt: 2,
            },
            {
              id: "lob-3",
              roomId: RoomId.LOBBY,
              title: "Lobby 3",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/lobby/lob-3.m4a",
              mediaUrl: "https://cdn.example/audio/lobby/lob-3.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 2,
              createdAt: 3,
              updatedAt: 3,
            },
          ],
        },
      ],
      [
        RoomId.WIXARIKA,
        {
          roomId: RoomId.WIXARIKA,
          resolvedFromRoomId: RoomId.WIXARIKA,
          playbackMode: "SEQUENTIAL",
          tracks: [
            {
              id: "wix-1",
              roomId: RoomId.WIXARIKA,
              title: "Wixárika 1",
              artistCredit: "",
              licenseNote: "",
              mediaKey: "audio/wixarika/wix-1.m4a",
              mediaUrl: "https://cdn.example/audio/wixarika/wix-1.m4a",
              mimeType: "audio/mp4",
              fileSizeBytes: 1000,
              durationMs: 60_000,
              sortOrder: 0,
              createdAt: 4,
              updatedAt: 4,
            },
          ],
        },
      ],
    ]);

    const fakeEl = createFakeAudioElement();
    const { bus, createMediaElementSource } = createFakeBus();

    const player = new MusicPlayer({
      playlistClient: {
        fetchRoomPlaylist: async (roomId) => playlists.get(roomId)!,
      } as unknown as RoomPlaylistClient,
      createAudioElement: () => fakeEl,
    });

    const prefs = new AudioPreferencesStore();
    prefs.activateSound();
    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => bus.context,
      musicPlayer: player,
    });

    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.LOBBY);

    await vi.waitFor(() => {
      expect(fakeEl.src).toBe("https://cdn.example/audio/lobby/lob-1.m4a");
    });
    expect(fakeEl.playCount).toBe(1);
    expect(createMediaElementSource).toHaveBeenCalledTimes(1);

    // ended advances cleanly to lob-2
    fakeEl.emit("ended");
    expect(fakeEl.src).toBe("https://cdn.example/audio/lobby/lob-2.m4a");
    expect(fakeEl.playCount).toBe(2);

    // error skips corrupted lob-2 and advances to lob-3
    fakeEl.emit("error");
    expect(fakeEl.src).toBe("https://cdn.example/audio/lobby/lob-3.m4a");

    // Transition to ODAM (fallback from LOBBY): matches { resolvedFromRoomId: LOBBY, trackIds } -> uninterrupted continuity!
    const playCountBeforeFallbackTransition = fakeEl.playCount;
    const pauseCountBeforeFallbackTransition = fakeEl.pauseCount;
    engine.notifyCurtainFadeOut();
    engine.notifyCurtainFadeIn(RoomId.ODAM);
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeEl.src).toBe("https://cdn.example/audio/lobby/lob-3.m4a");
    expect(fakeEl.pauseCount).toBe(pauseCountBeforeFallbackTransition);
    expect(fakeEl.playCount).toBe(playCountBeforeFallbackTransition);

    // Transition to WIXARIKA (has room-specific tracks): swaps track on curtain fade-in
    engine.notifyCurtainFadeOut();
    engine.notifyCurtainFadeIn(RoomId.WIXARIKA);
    await vi.waitFor(() => {
      expect(fakeEl.src).toBe("https://cdn.example/audio/wixarika/wix-1.m4a");
    });

    // Deactivating experience stops music without duplicating MediaElementSourceNode
    engine.deactivateExperience();
    expect(fakeEl.paused).toBe(true);
    engine.activateExperience(RoomId.WIXARIKA);
    await Promise.resolve();
    expect(createMediaElementSource).toHaveBeenCalledTimes(1);
  });

  it("MusicPlayer.stopAll() resets audible state to false and prevents curtain resume until re-enabled", () => {
    const fakeEl = createFakeAudioElement();
    const player = new MusicPlayer({
      playlistClient: {
        fetchRoomPlaylist: async () => ({
          roomId: RoomId.LOBBY,
          resolvedFromRoomId: RoomId.LOBBY,
          playbackMode: "SEQUENTIAL",
          tracks: [],
        }),
      } as unknown as RoomPlaylistClient,
      createAudioElement: () => fakeEl,
    });

    player.setAudible(true);
    expect(player.isAudible()).toBe(true);

    player.stopAll();
    expect(player.isAudible()).toBe(false);
  });
});
