import { describe, it, expect, vi } from "vitest";
import { AUDIO_TOKENS } from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import {
  AudioEngine,
  type AudioSessionNavigatorTarget,
  type DocumentLifecycleTarget,
} from "../../src/experience/audio/audio-engine";
import type {
  AmbiencePlayerPort,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  MusicPlayerPort,
} from "../../src/experience/audio/audio-types";
import { RoomId } from "../../src/shared/room-catalog";

function createParam(initial = 0): AudioParamLike {
  return {
    value: initial,
    setTargetAtTime: vi.fn(),
  };
}

function createMockCtx() {
  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((d: AudioNodeLike) => d),
    disconnect: vi.fn(),
  });
  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 1,
    destination: makeNode("destination"),
    listener: {},
    resume: vi.fn(async () => {
      (ctx as { state: AudioContextState }).state = "running";
    }),
    suspend: vi.fn(async () => {
      (ctx as { state: AudioContextState }).state = "suspended";
    }),
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
    createBufferSource: vi.fn(() => ({
      ...makeNode("buf"),
      buffer: null,
      start: vi.fn(),
    })),
    decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
  };
  return ctx;
}

describe("AudioEngine Document Visibility & iOS AudioSession Lifecycle", () => {
  it("configures navigator.audioSession.type='playback' and suspends/resumes audio on visibilitychange", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });

    let visibilityState: DocumentVisibilityState = "visible";
    const listeners = new Set<() => void>();
    const docRef: DocumentLifecycleTarget = {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (_type, fn) => {
        listeners.add(fn);
      },
      removeEventListener: (_type, fn) => {
        listeners.delete(fn);
      },
    };
    const navRef: AudioSessionNavigatorTarget = {
      audioSession: { type: "auto" },
    };

    const mockCtx = createMockCtx();
    const musicPlayer: MusicPlayerPort = {
      connectBus: vi.fn(),
      setActiveRoom: vi.fn(),
      setAudible: vi.fn(),
      onCurtainFadeOut: vi.fn(),
      onCurtainFadeIn: vi.fn(),
      stopAll: vi.fn(),
    };
    const ambiencePlayer: AmbiencePlayerPort = {
      transitionToEnvironment: vi.fn(),
      setAudible: vi.fn(),
      stopAll: vi.fn(),
    };

    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mockCtx,
      musicPlayer,
      ambiencePlayer,
      documentRef: docRef,
      navigatorRef: navRef,
    });

    expect(navRef.audioSession?.type).toBe(AUDIO_TOKENS.IOS_AUDIO_SESSION_TYPE);

    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.LOBBY);
    prefs.activateSound();

    expect(musicPlayer.setAudible).toHaveBeenLastCalledWith(true);
    expect(ambiencePlayer.setAudible).toHaveBeenLastCalledWith(true);

    // Tab hidden -> suspend AudioContext + silence channels
    visibilityState = "hidden";
    for (const fn of listeners) fn();

    expect(mockCtx.suspend).toHaveBeenCalledTimes(1);
    expect(musicPlayer.setAudible).toHaveBeenLastCalledWith(false);
    expect(ambiencePlayer.setAudible).toHaveBeenLastCalledWith(false);

    // Tab visible -> resume AudioContext + restore active channels
    visibilityState = "visible";
    for (const fn of listeners) fn();

    expect(mockCtx.resume).toHaveBeenCalledTimes(1);
    expect(musicPlayer.setAudible).toHaveBeenLastCalledWith(true);
    expect(ambiencePlayer.setAudible).toHaveBeenLastCalledWith(true);

    engine.dispose();
    expect(listeners.size).toBe(0);
  });
});
