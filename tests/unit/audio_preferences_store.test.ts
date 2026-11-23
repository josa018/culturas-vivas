import { describe, it, expect, vi } from "vitest";
import {
  AUDIO_STORAGE_KEYS,
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
  it("initializes fresh session with default-off Master and mediaMuted while keeping Music/Effects sub-flags enabled", () => {
    const store = new AudioPreferencesStore(new InMemoryStorageAdapter());
    const prefs = store.getPreferences();

    expect(prefs).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(prefs).toEqual({
      masterEnabled: false,
      musicEnabled: true,
      effectsEnabled: true,
      mediaMuted: true,
    });

    expect(deriveAudioChannelState(prefs)).toEqual({
      musicAudible: false,
      effectsAudible: false,
      mediaMuted: true,
    });
  });

  it("enforces last-user-action-wins between Master and stand media mute across consecutive transitions", () => {
    let state: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };

    // 1. User unmutes stand while Master is OFF -> only mediaMuted flips to false
    state = reduceAudioMixerState(state, { type: "STAND_MEDIA_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: false,
      musicEnabled: true,
      effectsEnabled: true,
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
      musicEnabled: true,
      effectsEnabled: true,
      mediaMuted: false,
    });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: true,
      effectsAudible: true,
      mediaMuted: false,
    });

    // 3. User turns Master OFF -> resets mediaMuted to true (last action wins)
    state = reduceAudioMixerState(state, { type: "MASTER_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: false,
      musicEnabled: true,
      effectsEnabled: true,
      mediaMuted: true,
    });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: false,
      effectsAudible: false,
      mediaMuted: true,
    });

    // 4. Toggling Music OFF preserves Effects & mediaMuted independently
    state = reduceAudioMixerState(state, { type: "MUSIC_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: false,
      musicEnabled: false,
      effectsEnabled: true,
      mediaMuted: true,
    });

    // 5. Turning Master ON restores Effects without overwriting Music=false
    state = reduceAudioMixerState(state, { type: "MASTER_TOGGLED" });
    expect(deriveAudioChannelState(state)).toEqual({
      musicAudible: false,
      effectsAudible: true,
      mediaMuted: false,
    });

    // 6. Toggling Effects OFF leaves Music & mediaMuted untouched
    state = reduceAudioMixerState(state, { type: "EFFECTS_TOGGLED" });
    expect(state).toEqual({
      masterEnabled: true,
      musicEnabled: false,
      effectsEnabled: false,
      mediaMuted: false,
    });
  });

  it("supports ACTIVATE_SOUND and SYNC_MEDIA_MUTED actions", () => {
    let state: AudioPreferences = {
      masterEnabled: false,
      musicEnabled: true,
      effectsEnabled: false,
      mediaMuted: true,
    };

    const activateAction: AudioMixerAction = { type: "ACTIVATE_SOUND" };
    state = reduceAudioMixerState(state, activateAction);
    expect(state).toEqual({
      masterEnabled: true,
      musicEnabled: true,
      effectsEnabled: false,
      mediaMuted: false,
    });

    state = reduceAudioMixerState(state, {
      type: "SYNC_MEDIA_MUTED",
      muted: true,
    });
    expect(state).toEqual({
      masterEnabled: true,
      musicEnabled: true,
      effectsEnabled: false,
      mediaMuted: true,
    });
  });

  it("persists preferences to injected StorageAdapter, restores across instances, and notifies subscribers", () => {
    const storage = new InMemoryStorageAdapter();
    storage.setItem(
      AUDIO_STORAGE_KEYS.PREFERENCES,
      JSON.stringify({
        masterEnabled: true,
        musicEnabled: true,
        effectsEnabled: false,
        mediaMuted: false,
      }),
    );

    const store = new AudioPreferencesStore(storage);
    expect(store.getPreferences()).toEqual({
      masterEnabled: true,
      musicEnabled: true,
      effectsEnabled: false,
      mediaMuted: false,
    });

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    store.toggleStandMedia();
    expect(store.getPreferences().mediaMuted).toBe(true);
    expect(
      JSON.parse(storage.getItem(AUDIO_STORAGE_KEYS.PREFERENCES) ?? "{}"),
    ).toMatchObject({
      masterEnabled: true,
      effectsEnabled: false,
      mediaMuted: true,
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
