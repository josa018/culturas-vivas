import { describe, it, expect, vi } from "vitest";
import { SfxId, SFX_MANIFEST } from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import { SfxPlayer } from "../../src/experience/audio/sfx-player";
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
} from "../../src/experience/audio/audio-types";
import { RoomId } from "../../src/shared/room-catalog";

function createParam(initial = 0): AudioParamLike {
  return {
    value: initial,
    setTargetAtTime: vi.fn(),
  };
}

function createMockAudioCtx() {
  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((d: AudioNodeLike) => d),
    disconnect: vi.fn(),
  });
  const createdSources: Array<{
    buffer: AudioBuffer | null;
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  }> = [];

  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 0,
    destination: makeNode("destination"),
    listener: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    createGain: vi.fn(() => ({ ...makeNode("gain"), gain: createParam(1) })),
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
      const src = {
        ...makeNode("bufSource"),
        buffer: null as AudioBuffer | null,
        start: vi.fn(),
      };
      createdSources.push(src);
      return src;
    }),
    decodeAudioData: vi.fn(async (buf: ArrayBuffer) => ({ byteLength: buf.byteLength }) as unknown as AudioBuffer),
  };
  return { ctx, createdSources };
}

describe("SfxPlayer Preloading & Effects Gating", () => {
  it("fetches and decodes each SFX_MANIFEST entry at most once and gates BufferSource creation on effectsAudible", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mock = createMockAudioCtx();
    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
    });
    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.LOBBY);

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    })) as unknown as typeof fetch;

    const sfx = new SfxPlayer({
      audioEngine: engine,
      fetchImpl: fetchSpy,
    });

    await sfx.preloadAll();
    await sfx.preloadAll();

    const manifestCount = Object.keys(SFX_MANIFEST).length;
    expect(manifestCount).toBe(9);
    expect(fetchSpy).toHaveBeenCalledTimes(manifestCount);
    expect(mock.ctx.decodeAudioData).toHaveBeenCalledTimes(manifestCount);

    // Master is OFF -> effectsAudible=false -> zero buffer sources created
    expect(sfx.play(SfxId.STAND_OPEN)).toBe(false);
    expect(mock.createdSources).toHaveLength(0);

    // Master ON + Effects ON -> plays through sfxGain
    prefs.activateSound();
    expect(sfx.play(SfxId.STAND_OPEN)).toBe(true);
    expect(mock.createdSources).toHaveLength(1);
    expect(mock.createdSources[0].connect).toHaveBeenCalledWith(
      engine.getSfxBus()!.inputNode,
    );
    expect(mock.createdSources[0].start).toHaveBeenCalledTimes(1);

    // Effects slider 0 -> muted again
    prefs.setEffectsVolume(0);
    expect(sfx.play(SfxId.PORTAL_WHOOSH)).toBe(false);
    expect(mock.createdSources).toHaveLength(1);
  });
});
