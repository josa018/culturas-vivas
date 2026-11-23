import { describe, it, expect, vi } from "vitest";
import { AUDIO_TOKENS } from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
} from "../../src/experience/audio/audio-types";
import { RoomId } from "../../src/shared/room-catalog";

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
    currentTime: 4.0,
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
      ...makeNode("compressor"),
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

describe("Automatic Music Bus Ducking", () => {
  it("ducks musicGain to MUSIC_DUCK_GAIN while unmuted stand video is playing and restores MUSIC_DEFAULT_GAIN on mute or stop", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mock = createMockCtx();
    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
    });

    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.WIXARIKA);
    prefs.activateSound();
    prefs.setMusicVolume(0.5);

    const musicGain = mock.gains[0];
    expect(musicGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5 * AUDIO_TOKENS.MUSIC_DEFAULT_GAIN,
      mock.ctx.currentTime,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );

    // Unmuted video starts playing -> duck music proportionally to slider volume
    engine.setMediaPlaybackActive(true);
    const expectedTau =
      AUDIO_TOKENS.DUCK_RAMP_MS /
      AUDIO_TOKENS.MS_PER_SECOND /
      AUDIO_TOKENS.DUCK_TAU_SETTLE_DIVISOR;
    expect(musicGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5 * AUDIO_TOKENS.MUSIC_DUCK_GAIN,
      mock.ctx.currentTime,
      expectedTau,
    );

    // Muting stand video restores scaled music gain
    prefs.toggleStandMedia();
    expect(musicGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5 * AUDIO_TOKENS.MUSIC_DEFAULT_GAIN,
      mock.ctx.currentTime,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );

    // Unmuting stand video re-ducks, stopping video restores
    prefs.toggleStandMedia();
    expect(musicGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5 * AUDIO_TOKENS.MUSIC_DUCK_GAIN,
      mock.ctx.currentTime,
      expectedTau,
    );

    engine.setMediaPlaybackActive(false);
    expect(musicGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5 * AUDIO_TOKENS.MUSIC_DEFAULT_GAIN,
      mock.ctx.currentTime,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );
  });
});
