import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AMBIENT_MANIFEST,
  AUDIO_TOKENS,
} from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import {
  AmbiencePlayer,
  computeGaplessLoopBounds,
} from "../../src/experience/audio/ambience-player";
import type {
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
} from "../../src/experience/audio/audio-types";
import { RoomEnvironmentId, RoomId } from "../../src/shared/room-catalog";

function createParam(initial = 0): AudioParamLike & {
  setTargetAtTime: ReturnType<typeof vi.fn>;
} {
  const param = {
    value: initial,
    setTargetAtTime: vi.fn((target: number) => {
      param.value = target;
    }),
  };
  return param;
}

interface MockBufferSource extends AudioBufferSourceNodeLike {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function createMockCtx(bufferDuration = 8.0) {
  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((d: AudioNodeLike) => d),
    disconnect: vi.fn(),
  });
  const gains: Array<
    ReturnType<typeof makeNode> & { gain: ReturnType<typeof createParam> }
  > = [];
  const sources: MockBufferSource[] = [];

  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 5.0,
    destination: makeNode("destination"),
    listener: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    createGain: vi.fn(() => {
      const g = { ...makeNode("gain"), gain: createParam(1) };
      gains.push(g);
      return g;
    }),
    createDynamicsCompressor: vi.fn(() => ({
      ...makeNode("comp"),
      threshold: createParam(0),
      knee: createParam(0),
      ratio: createParam(1),
      attack: createParam(0),
      release: createParam(0),
    })),
    createBiquadFilter: vi.fn(() => ({
      ...makeNode("filter"),
      type: "lowpass" as BiquadFilterType,
      frequency: createParam(20000),
    })),
    createPanner: vi.fn(() => ({
      ...makeNode("panner"),
      panningModel: "HRTF" as PanningModelType,
      distanceModel: "inverse" as DistanceModelType,
      refDistance: 1,
      rolloffFactor: 0,
    })),
    createMediaElementSource: vi.fn(() => makeNode("mediaSource")),
    createBufferSource: vi.fn(() => {
      const src: MockBufferSource = {
        ...makeNode("buf"),
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(src);
      return src;
    }),
    decodeAudioData: vi.fn(
      async () => ({ duration: bufferDuration }) as unknown as AudioBuffer,
    ),
  };
  return { ctx, gains, sources };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("computeGaplessLoopBounds", () => {
  it("trims leading and trailing MP3 padding for standard ambient buffers and clamps short durations", () => {
    expect(computeGaplessLoopBounds(8.0)).toEqual({
      loopStartSec: 0.03,
      loopEndSec: 7.97,
    });
    expect(computeGaplessLoopBounds(0.05)).toEqual({
      loopStartSec: 0,
      loopEndSec: 0.05,
    });
    expect(computeGaplessLoopBounds(0)).toEqual({
      loopStartSec: 0,
      loopEndSec: 0,
    });
  });
});

describe("AmbiencePlayer Per-Biome Soundscapes & Gapless Crossfade", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("decodes each ambient MP3 once, plays gapless looping AudioBufferSourceNodes, and defers stop until crossfade completes", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mockCtx = createMockCtx(8.0);
    const fetchSpy = vi.fn(async (url: string | URL | Request) => ({
      ok: true,
      url: String(url),
      arrayBuffer: async () => new ArrayBuffer(16),
    })) as unknown as typeof fetch;

    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mockCtx.ctx,
    });
    const ambience = new AmbiencePlayer({
      audioEngine: engine,
      fetchImpl: fetchSpy,
    });
    engine.setAmbiencePlayer(ambience);

    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.LOBBY);
    await flushMicrotasks();

    // Master is OFF -> stays silent without fetching or starting sources
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCtx.sources).toHaveLength(0);

    // Master ON + Effects ON -> fetches/decodes LOBBY once and starts gapless loop
    prefs.activateSound();
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      AMBIENT_MANIFEST[RoomEnvironmentId.LOBBY],
    );
    expect(mockCtx.sources).toHaveLength(1);
    const lobbySource = mockCtx.sources[0];
    expect(lobbySource.loop).toBe(true);
    expect(lobbySource.loopStart).toBeCloseTo(
      AUDIO_TOKENS.AMBIENT_LOOP_TRIM_START_S,
      4,
    );
    expect(lobbySource.loopEnd).toBeCloseTo(
      8.0 - AUDIO_TOKENS.AMBIENT_LOOP_TRIM_END_S,
      4,
    );
    expect(lobbySource.start).toHaveBeenCalledTimes(1);

    // Crossfade to WIXARIKA biome -> outgoing LOBBY ramps to 0 but is NOT stopped immediately
    ambience.transitionToEnvironment(RoomEnvironmentId.WIXARIKA);
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(
      AMBIENT_MANIFEST[RoomEnvironmentId.WIXARIKA],
    );
    expect(mockCtx.sources).toHaveLength(2);
    const wixarikaSource = mockCtx.sources[1];
    expect(wixarikaSource.loop).toBe(true);
    expect(wixarikaSource.start).toHaveBeenCalledTimes(1);
    expect(lobbySource.stop).not.toHaveBeenCalled();

    const expectedTau =
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS /
      AUDIO_TOKENS.MS_PER_SECOND /
      AUDIO_TOKENS.DUCK_TAU_SETTLE_DIVISOR;
    const lobbyGain = mockCtx.gains[4];
    const wixarikaGain = mockCtx.gains[5];
    expect(lobbyGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      mockCtx.ctx.currentTime,
      expectedTau,
    );
    expect(wixarikaGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      AUDIO_TOKENS.AMBIENCE_GAIN,
      mockCtx.ctx.currentTime,
      expectedTau,
    );

    // Outgoing source stops only after crossfade + buffer elapses
    vi.advanceTimersByTime(
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS + AUDIO_TOKENS.AMBIENT_STOP_BUFFER_MS,
    );
    expect(lobbySource.stop).toHaveBeenCalledTimes(1);

    // Effects slider 0 -> stops active loop; slider > 0 -> restarts WIXARIKA from cached buffer (no extra fetch)
    prefs.setEffectsVolume(0);
    vi.advanceTimersByTime(
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS + AUDIO_TOKENS.AMBIENT_STOP_BUFFER_MS,
    );
    expect(wixarikaSource.stop).toHaveBeenCalledTimes(1);

    prefs.setEffectsVolume(0.9);
    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockCtx.sources).toHaveLength(3);
    const restartedWixarika = mockCtx.sources[2];
    expect(restartedWixarika.start).toHaveBeenCalledTimes(1);

    // Leaving experience stops active loops
    engine.deactivateExperience();
    vi.advanceTimersByTime(
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS + AUDIO_TOKENS.AMBIENT_STOP_BUFFER_MS,
    );
    expect(restartedWixarika.stop).toHaveBeenCalledTimes(1);
  });

  it("binds globalThis.fetch to avoid Illegal invocation and normalizes quiet decoded ambient buffers", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });

    const channelSamples = new Float32Array([0.0025, -0.005, 0.0025]);
    const mockCtx = createMockCtx(8.0);
    mockCtx.ctx.decodeAudioData = vi.fn(
      async () =>
        ({
          duration: 8.0,
          numberOfChannels: 1,
          getChannelData: () => channelSamples,
        }) as unknown as AudioBuffer,
    );

    const originalFetch = globalThis.fetch;
    const strictFetch = function (
      this: unknown,
      url: string | URL | Request,
    ) {
      if (this !== globalThis) {
        return Promise.reject(
          new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation"),
        );
      }
      return Promise.resolve({
        ok: true,
        url: String(url),
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response);
    } as typeof fetch;

    globalThis.fetch = strictFetch;
    try {
      const engine = new AudioEngine({
        preferencesStore: prefs,
        createAudioContext: () => mockCtx.ctx,
      });
      const ambience = new AmbiencePlayer({ audioEngine: engine });
      engine.setAmbiencePlayer(ambience);

      await engine.unlockFromUserGesture();
      engine.activateExperience(RoomId.WIXARIKA);
      prefs.activateSound();
      await flushMicrotasks();

      expect(mockCtx.sources).toHaveLength(1);
      // Peak 0.005 boosted cleanly up to AMBIENT_TARGET_PEAK
      expect(Math.max(...Array.from(channelSamples).map(Math.abs))).toBeCloseTo(
        0.65,
        2,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
