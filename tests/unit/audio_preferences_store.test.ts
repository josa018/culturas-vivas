import { describe, it, expect, vi } from "vitest";
import {
  AUDIO_STORAGE_KEYS,
  AUDIO_TOKENS,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferences,
} from "../../src/experience/audio/audio-constants";
import {
  AudioPreferencesStore,
  deriveAudioChannelState,
  reduceAudioMixerState,
  type AudioMixerAction,
} from "../../src/experience/audio/audio-preferences-store";
import type { StorageAdapter } from "../../src/navigation/session-store";

class InMemoryStorageAdapter implements StorageAdapter {
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

describe("AudioPreferencesStore & Mixer State Reducer", () => {
  it("initializes fresh session with default-off Master and mediaMuted while keeping default Music/Effects volumes", () => {
    const store = new AudioPreferencesStore(new InMemoryStorageAdapter());
    const prefs = store.getPreferences();

    expect(prefs).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(prefs).toEqual({
      masterEnabled: false,
      musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: true,
    });

    expect(deriveAudioChannelState(prefs)).toEqual({
      musicAudible: false,
      effectsAudible: false,
      mediaMuted: true,
    });
  });

  it("enforces last-user-action-wins between Master and stand media mute and clamps Music/Effects volume sliders", () => {
    let state: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };

    // 1. User unmutes stand while Master is OFF -> only mediaMuted flips to false
    state = reduceAudioMixerState(state, { type: "STAND_MEDIA_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: false,
      musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: false,
    });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: false,
      effectsAudible: false,
      mediaMuted: false,
    });

    // 2. User turns Master ON -> music & effects become audible, mediaMuted stays false
    state = reduceAudioMixerState(state, { type: "MASTER_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: true,
      musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: false,
    });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: true,
      effectsAudible: true,
      mediaMuted: false,
    });

    // 3. User turns Master OFF -> resets mediaMuted to true (last action wins) and preserves volumes
    state = reduceAudioMixerState(state, { type: "MASTER_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: false,
      musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: true,
    });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: false,
      effectsAudible: false,
      mediaMuted: true,
    });

    // 4. Setting Music volume to 0 preserves Effects volume & mediaMuted independently
    state = reduceAudioMixerState(state, { type: "SET_MUSIC_VOLUME", volume: 0 });
    expect(state).toEqual({
      masterEnabled: false,
      musicVolume: 0,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: true,
    });

    // 5. Turning Master ON restores Effects without raising Music=0
    state = reduceAudioMixerState(state, { type: "MASTER_TOGGLED" });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: false,
      effectsAudible: true,
      mediaMuted: false,
    });

    // 6. Clamps volume sliders to [0, 1] and mutes effects when lowered to 0
    state = reduceAudioMixerState(state, { type: "SET_MUSIC_VOLUME", volume: 1.5 });
    state = reduceAudioMixerState(state, { type: "SET_EFFECTS_VOLUME", volume: -0.4 });
    expect(state).toEqual({
      masterEnabled: true,
      musicVolume: 1,
      effectsVolume: 0,
      mediaMuted: false,
    });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: true,
      effectsAudible: false,
      mediaMuted: false,
    });
  });

  it("supports ACTIVATE_SOUND and SYNC_MEDIA_MUTED actions", () => {
    let state: AudioPreferences = {
      masterEnabled: false,
      musicVolume: 0.75,
      effectsVolume: 0,
      mediaMuted: true,
    };

    const activateAction: AudioMixerAction = { type: "ACTIVATE_SOUND" };
    state = reduceAudioMixerState(state, activateAction);
    expect(state).toEqual({
      masterEnabled: true,
      musicVolume: 0.75,
      effectsVolume: 0,
      mediaMuted: false,
    });

    state = reduceAudioMixerState(state, {
      type: "SYNC_MEDIA_MUTED",
      muted: true,
    });
    expect(state).toEqual({
      masterEnabled: true,
      musicVolume: 0.75,
      effectsVolume: 0,
      mediaMuted: true,
    });
  });

  it("persists slider preferences to injected StorageAdapter, restores across instances, and notifies subscribers", () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(
      AUDIO_STORAGE_KEYS.PREFERENCES,
      JSON.stringify({
        masterEnabled: true,
        musicVolume: 0.6,
        effectsVolume: 0,
        mediaMuted: false,
      }),
    );

    const store = new AudioPreferencesStore(storage);
    expect(store.getPreferences()).toEqual({
      masterEnabled: true,
      musicVolume: 0.6,
      effectsVolume: 0,
      mediaMuted: false,
    });

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    store.setEffectsVolume(0.95);
    expect(store.getPreferences().effectsVolume).toBe(0.95);
    expect(
      JSON.parse(storage.getItem(AUDIO_STORAGE_KEYS.PREFERENCES) ?? "{}"),
    ).toMatchObject({
      masterEnabled: true,
      musicVolume: 0.6,
      effectsVolume: 0.95,
      mediaMuted: false,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.toggleMaster();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("recovers cleanly to DEFAULT_AUDIO_PREFERENCES when stored JSON is malformed", () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(AUDIO_STORAGE_KEYS.PREFERENCES, "{not-valid-json");

    const store = new AudioPreferencesStore(storage);
    expect(store.getPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });
});
