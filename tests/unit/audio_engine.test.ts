import { describe, it, expect, vi } from "vitest";
import { AUDIO_TOKENS } from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  MusicPlayerPort,
} from "../../src/experience/audio/audio-types";
import type { StorageAdapter } from "../../src/navigation/session-store";
import { RoomId } from "../../src/shared/room-catalog";

class InMemoryStorage implements StorageAdapter {
  private readonly map = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  public removeItem(key: string): void {
    this.map.delete(key);
  }
}

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

function createMockAudioContext(initialState: AudioContextState = "suspended") {
  const connections: Array<{ from: string; to: string }> = [];
  let gainIndex = 0;

  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((dest: AudioNodeLike & { label?: string }) => {
      connections.push({ from: label, to: dest.label ?? "unknown" });
      return dest;
    }),
    disconnect: vi.fn(),
  });

  const destination = makeNode("destination");
  const gains: Array<
    ReturnType<typeof makeNode> & { gain: ReturnType<typeof createParam> }
  > = [];

  const compressor = {
    ...makeNode("compressor"),
    threshold: createParam(0),
    knee: createParam(0),
    ratio: createParam(1),
    attack: createParam(0),
    release: createParam(0),
  };

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
    ...makeNode("biquadFilter"),
    type: "lowpass" as BiquadFilterType,
    frequency: createParam(20000),
  };

  const ctx: AudioContextLike = {
    state: initialState,
    currentTime: 1.5,
    destination,
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
    resume: vi.fn(async () => {
      (ctx as { state: AudioContextState }).state = "running";
    }),
    suspend: vi.fn(async () => {
      (ctx as { state: AudioContextState }).state = "suspended";
    }),
    createGain: vi.fn(() => {
      const node = {
        ...makeNode(`gain_${gainIndex++}`),
        gain: createParam(1),
      };
      gains.push(node);
      return node;
    }),
    createDynamicsCompressor: vi.fn(() => compressor),
    createBiquadFilter: vi.fn(() => filter),
    createPanner: vi.fn(() => panner),
    createMediaElementSource: vi.fn(() => makeNode("mediaElementSource")),
    createBufferSource: vi.fn(() => ({
      ...makeNode("bufferSource"),
      buffer: null,
      start: vi.fn(),
      stop: vi.fn(),
    })),
    decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
  };

  return { ctx, connections, gains, compressor };
}

describe("AudioEngine Core Graph & Experience Lifecycle", () => {
  it("creates a single AudioContext lazily on unlockFromUserGesture and wires buses into compressor -> destination", async () => {
    const storage = new InMemoryStorage();
    const prefs = new AudioPreferencesStore(storage);
    const mock = createMockAudioContext("suspended");
    const createContext = vi.fn(() => mock.ctx);

    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: createContext,
    });

    // Lazy: zero AudioContext instances before first gesture
    expect(createContext).not.toHaveBeenCalled();
    expect(engine.isContextUnlocked()).toBe(false);

    await engine.unlockFromUserGesture();
    await engine.unlockFromUserGesture();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
    expect(engine.isContextUnlocked()).toBe(true);

    // Compressor routes to destination
    expect(mock.connections).toContainEqual({
      from: "compressor",
      to: "destination",
    });

    // musicGain (gain_0) + sfxGain (gain_1) -> ambientMasterGain (gain_2) -> compressor
    expect(mock.connections).toContainEqual({ from: "gain_0", to: "gain_2" });
    expect(mock.connections).toContainEqual({ from: "gain_1", to: "gain_2" });
    expect(mock.connections).toContainEqual({
      from: "gain_2",
      to: "compressor",
    });

    // mediaGain (gain_3) -> compressor
    expect(mock.connections).toContainEqual({
      from: "gain_3",
      to: "compressor",
    });
  });

  it("scales musicGain and sfxGain proportionally to slider volumes and silences sfxGain at 0", async () => {
    const storage = new InMemoryStorage();
    const prefs = new AudioPreferencesStore(storage);
    const mock = createMockAudioContext("running");

    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
    });

    await engine.unlockFromUserGesture();
    engine.activateExperience(RoomId.LOBBY);

    prefs.toggleMaster(); // master=true, defaults musicVolume & effectsVolume
    prefs.setMusicVolume(0.5);
    prefs.setEffectsVolume(0);

    const musicGain = mock.gains[0];
    const sfxGain = mock.gains[1];
    expect(musicGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0.5 * AUDIO_TOKENS.MUSIC_DEFAULT_GAIN,
      mock.ctx.currentTime,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );
    expect(sfxGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      mock.ctx.currentTime,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );

    prefs.setEffectsVolume(1);
    expect(sfxGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      AUDIO_TOKENS.SFX_GAIN,
      mock.ctx.currentTime,
      AUDIO_TOKENS.GAIN_RAMP_TIME_CONSTANT_S,
    );
  });

  it("gates MusicPlayerPort and experience playback strictly to active ScreenId.EXPERIENCE_3D", async () => {
    const storage = new InMemoryStorage();
    const prefs = new AudioPreferencesStore(storage);
    const mock = createMockAudioContext("running");

    const musicPlayer: MusicPlayerPort = {
      connectBus: vi.fn(),
      setActiveRoom: vi.fn(),
      setAudible: vi.fn(),
      onCurtainFadeOut: vi.fn(),
      onCurtainFadeIn: vi.fn(),
      stopAll: vi.fn(),
    };

    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
      musicPlayer,
    });

    await engine.unlockFromUserGesture();
    prefs.activateSound();

    // Outside experience, MusicPlayerPort remains non-audible
    expect(musicPlayer.setAudible).toHaveBeenLastCalledWith(false);

    engine.activateExperience(RoomId.WIXARIKA);
    expect(musicPlayer.connectBus).toHaveBeenCalledTimes(1);
    expect(musicPlayer.setActiveRoom).toHaveBeenCalledWith(RoomId.WIXARIKA);
    expect(musicPlayer.setAudible).toHaveBeenLastCalledWith(true);

    engine.deactivateExperience();
    expect(musicPlayer.setAudible).toHaveBeenLastCalledWith(false);
    expect(musicPlayer.stopAll).toHaveBeenCalledTimes(1);
    // Saved session preferences remain intact after leaving experience
    expect(prefs.getPreferences().masterEnabled).toBe(true);
  });
});
