import { describe, it, expect, vi } from "vitest";
import {
  AMBIENT_MANIFEST,
  AUDIO_TOKENS,
} from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import {
  AmbiencePlayer,
  type AmbientAudioElementLike,
} from "../../src/experience/audio/ambience-player";
import type {
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

function createMockCtx() {
  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((d: AudioNodeLike) => d),
    disconnect: vi.fn(),
  });
  const gains: Array<
    ReturnType<typeof makeNode> & { gain: ReturnType<typeof createParam> }
  > = [];

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
    createBufferSource: vi.fn(() => ({
      ...makeNode("buf"),
      buffer: null,
      start: vi.fn(),
    })),
    decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
  };
  return { ctx, gains };
}

function createMockAudioElements() {
  const elements: Array<
    AmbientAudioElementLike & {
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
    }
  > = [];
  const createAudioElement = () => {
    const el: AmbientAudioElementLike & {
      play: ReturnType<typeof vi.fn>;
      pause: ReturnType<typeof vi.fn>;
    } = {
      src: "",
      loop: false,
      crossOrigin: null,
      preload: "auto",
      volume: 1,
      paused: true,
      play: vi.fn(async () => {
        el.paused = false;
      }),
      pause: vi.fn(() => {
        el.paused = true;
      }),
    };
    elements.push(el);
    return el;
  };
  return { elements, createAudioElement };
}

describe("AmbiencePlayer Per-Biome Soundscapes & Crossfade", () => {
  it("crossfades per-biome ambient loops through sfxGain and pauses when Effects or Master toggle OFF", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mockCtx = createMockCtx();
    const audioEls = createMockAudioElements();

    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mockCtx.ctx,
    });
    const ambience = new AmbiencePlayer({
      audioEngine: engine,
      createAudioElement: audioEls.createAudioElement,
    });
    engine.setAmbiencePlayer(ambience);

    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.LOBBY);

    // Master is OFF -> stays silent
    expect(audioEls.elements).toHaveLength(0);

    // Master ON + Effects ON -> starts LOBBY ambience
    prefs.activateSound();
    expect(audioEls.elements).toHaveLength(1);
    const lobbyEl = audioEls.elements[0];
    expect(lobbyEl.src).toBe(AMBIENT_MANIFEST[RoomEnvironmentId.LOBBY]);
    expect(lobbyEl.loop).toBe(true);
    expect(lobbyEl.crossOrigin).toBe("anonymous");
    expect(lobbyEl.play).toHaveBeenCalledTimes(1);

    // Crossfade to WIXARIKA biome
    ambience.transitionToEnvironment(RoomEnvironmentId.WIXARIKA);
    expect(audioEls.elements).toHaveLength(2);
    const wixarikaEl = audioEls.elements[1];
    expect(wixarikaEl.src).toBe(AMBIENT_MANIFEST[RoomEnvironmentId.WIXARIKA]);
    expect(wixarikaEl.play).toHaveBeenCalledTimes(1);

    const expectedTau =
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS /
      AUDIO_TOKENS.MS_PER_SECOND /
      AUDIO_TOKENS.DUCK_TAU_SETTLE_DIVISOR;
    // Outgoing LOBBY slot gain ramps to 0; incoming WIXARIKA slot gain ramps to AMBIENCE_GAIN
    const lobbySlotGain = mockCtx.gains[4];
    const wixarikaSlotGain = mockCtx.gains[5];
    expect(lobbySlotGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      0,
      mockCtx.ctx.currentTime,
      expectedTau,
    );
    expect(wixarikaSlotGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      AUDIO_TOKENS.AMBIENCE_GAIN,
      mockCtx.ctx.currentTime,
      expectedTau,
    );

    // Effects slider 0 -> pauses active loop; slider > 0 -> resumes WIXARIKA loop
    prefs.setEffectsVolume(0);
    expect(wixarikaEl.pause).toHaveBeenCalledTimes(1);

    prefs.setEffectsVolume(0.9);
    expect(wixarikaEl.play).toHaveBeenCalledTimes(2);

    // Leaving experience stops active loops
    engine.deactivateExperience();
    expect(wixarikaEl.pause).toHaveBeenCalledTimes(2);
  });
});
