import { describe, it, expect, vi } from "vitest";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import { SpatialMediaAudio } from "../../src/experience/audio/spatial-media-audio";
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
} from "../../src/experience/audio/audio-types";
import {
  SharedVideoController,
  type VideoElementLike,
} from "../../src/experience/shared-video-controller";

function createParam(initial = 0): AudioParamLike & {
  setTargetAtTime: ReturnType<typeof vi.fn>;
} {
  const param = {
    value: initial,
    setTargetAtTime: vi.fn((target: number) => {
      param.value = target;
    }),
    setValueAtTime: vi.fn((value: number) => {
      param.value = value;
    }),
  };
  return param;
}

function createMockSpatialContext() {
  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((dest: AudioNodeLike) => dest),
    disconnect: vi.fn(),
  });
  const panner = {
    ...makeNode("panner"),
    panningModel: "equalpower" as PanningModelType,
    distanceModel: "inverse" as DistanceModelType,
    refDistance: 1,
    rolloffFactor: 1,
    positionX: createParam(0),
    positionY: createParam(0),
    positionZ: createParam(0),
  };
  const filter = {
    ...makeNode("filter"),
    type: "lowpass" as BiquadFilterType,
    frequency: createParam(20000),
  };
  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 2.0,
    destination: makeNode("destination"),
    listener: {
      positionX: createParam(0),
      positionY: createParam(0),
      positionZ: createParam(0),
      forwardX: createParam(0),
      forwardY: createParam(0),
      forwardZ: createParam(-1),
      upX: createParam(0),
      upY: createParam(1),
      upZ: createParam(0),
    },
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    createGain: vi.fn(() => ({ ...makeNode("gain"), gain: createParam(1) })),
    createDynamicsCompressor: vi.fn(() => ({
      ...makeNode("compressor"),
      threshold: createParam(0),
      knee: createParam(0),
      ratio: createParam(1),
      attack: createParam(0),
      release: createParam(0),
    })),
    createBiquadFilter: vi.fn(() => filter),
    createPanner: vi.fn(() => panner),
    createMediaElementSource: vi.fn(() => makeNode("mediaSource")),
    createBufferSource: vi.fn(() => ({
      ...makeNode("bufSource"),
      buffer: null,
      start: vi.fn(),
      stop: vi.fn(),
    })),
    decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
  };
  return { ctx, panner, filter };
}

function createMockVideo(): VideoElementLike {
  return {
    id: "",
    src: "",
    muted: false,
    paused: true,
    loop: false,
    playsInline: true,
    crossOrigin: null,
    preload: "metadata",
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    load: vi.fn(),
  };
}

describe("SpatialMediaAudio & SharedVideoController Mute Sync", () => {
  it("attaches MediaElementAudioSourceNode at most once per video element and positions HRTF PannerNode at active stand coordinates", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mock = createMockSpatialContext();
    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
    });
    await engine.unlockFromUserGesture();

    const spatial = new SpatialMediaAudio({ audioEngine: engine });
    const video = createMockVideo();

    spatial.attachVideoElement(video);
    spatial.attachVideoElement(video);

    expect(mock.ctx.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(mock.panner.panningModel).toBe("HRTF");
    expect(mock.panner.rolloffFactor).toBe(0);

    spatial.setStandWorldPosition({ x: -3.2, y: 1.76, z: 0 });
    expect(mock.panner.positionX.value).toBe(-3.2);
    expect(mock.panner.positionY.value).toBe(1.76);
    expect(mock.panner.positionZ.value).toBe(0);
  });

  it("synchronizes SharedVideoController mute state with AudioPreferencesStore (last user action wins across slides and Master OFF)", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mock = createMockSpatialContext();
    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
    });
    const spatial = new SpatialMediaAudio({ audioEngine: engine });
    const video = createMockVideo();

    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: () => ({ needsUpdate: true, dispose: vi.fn() }),
      preferencesStore: prefs,
      audioEngine: engine,
      spatialMediaAudio: spatial,
    });

    // Default fresh session: muted=true
    expect(controller.isMuted()).toBe(true);
    await controller.playVideo("https://cdn.example.com/stand-a.mp4");
    expect(video.muted).toBe(true);

    // Stand unmute while Master is OFF -> mediaMuted flips to false and stays false for next video
    expect(controller.toggleMute()).toBe(false);
    expect(prefs.getPreferences().masterEnabled).toBe(false);
    expect(prefs.getPreferences().mediaMuted).toBe(false);
    expect(video.muted).toBe(false);

    await controller.playVideo("https://cdn.example.com/stand-b.mp4");
    expect(controller.isMuted()).toBe(false);
    expect(video.muted).toBe(false);

    // Master ON -> OFF resets mediaMuted back to true
    prefs.toggleMaster(); // ON
    expect(controller.isMuted()).toBe(false);
    prefs.toggleMaster(); // OFF -> last action wins
    expect(controller.isMuted()).toBe(true);
    expect(video.muted).toBe(true);
  });
});
