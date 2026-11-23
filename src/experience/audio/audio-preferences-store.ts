import type { StorageAdapter } from "../../navigation/session-store";
import {
  AUDIO_STORAGE_KEYS,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferences,
} from "./audio-constants";

export type AudioMixerAction =
  | { readonly type: "MASTER_TOGGLED" }
  | { readonly type: "MUSIC_TOGGLED" }
  | { readonly type: "EFFECTS_TOGGLED" }
  | { readonly type: "STAND_MEDIA_TOGGLED" }
  | { readonly type: "ACTIVATE_SOUND" }
  | { readonly type: "SYNC_MEDIA_MUTED"; readonly muted: boolean };

export interface DerivedAudioChannelState {
  readonly musicAudible: boolean;
  readonly effectsAudible: boolean;
  readonly mediaMuted: boolean;
}

export type AudioPreferencesListener = (
  prefs: AudioPreferences,
  channels: DerivedAudioChannelState,
) => void;

class InMemoryAudioStorage implements StorageAdapter {
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

function resolveDefaultSessionStorage(): StorageAdapter {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const probeKey = "__cv_audio_storage_probe__";
      window.sessionStorage.setItem(probeKey, "1");
      window.sessionStorage.removeItem(probeKey);
      return window.sessionStorage;
    }
  } catch {
    // Fallback to memory storage when sessionStorage is blocked
  }
  return new InMemoryAudioStorage();
}

/**
 * Pure reducer implementing last-user-action-wins semantics between Master and stand media mute.
 */
export function reduceAudioMixerState(
  state: AudioPreferences,
  action: AudioMixerAction,
): AudioPreferences {
  switch (action.type) {
    case "MASTER_TOGGLED": {
      const nextMaster = !state.masterEnabled;
      return {
        ...state,
        masterEnabled: nextMaster,
        mediaMuted: !nextMaster,
      };
    }
    case "MUSIC_TOGGLED":
      return {
        ...state,
        musicEnabled: !state.musicEnabled,
      };
    case "EFFECTS_TOGGLED":
      return {
        ...state,
        effectsEnabled: !state.effectsEnabled,
      };
    case "STAND_MEDIA_TOGGLED":
      return {
        ...state,
        mediaMuted: !state.mediaMuted,
      };
    case "ACTIVATE_SOUND":
      return {
        ...state,
        masterEnabled: true,
        mediaMuted: false,
      };
    case "SYNC_MEDIA_MUTED":
      return {
        ...state,
        mediaMuted: action.muted,
      };
  }
}

export function deriveAudioChannelState(
  prefs: AudioPreferences,
): DerivedAudioChannelState {
  return {
    musicAudible: prefs.masterEnabled && prefs.musicEnabled,
    effectsAudible: prefs.masterEnabled && prefs.effectsEnabled,
    mediaMuted: prefs.mediaMuted,
  };
}

function parsePersistedPreferences(raw: string | null): AudioPreferences {
  if (!raw) {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      masterEnabled:
        typeof parsed.masterEnabled === "boolean"
          ? parsed.masterEnabled
          : DEFAULT_AUDIO_PREFERENCES.masterEnabled,
      musicEnabled:
        typeof parsed.musicEnabled === "boolean"
          ? parsed.musicEnabled
          : DEFAULT_AUDIO_PREFERENCES.musicEnabled,
      effectsEnabled:
        typeof parsed.effectsEnabled === "boolean"
          ? parsed.effectsEnabled
          : DEFAULT_AUDIO_PREFERENCES.effectsEnabled,
      mediaMuted:
        typeof parsed.mediaMuted === "boolean"
          ? parsed.mediaMuted
          : DEFAULT_AUDIO_PREFERENCES.mediaMuted,
    };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

/**
 * Session-scoped store managing visitor audio preferences over an injected StorageAdapter.
 */
export class AudioPreferencesStore {
  private readonly storage: StorageAdapter;
  private readonly listeners = new Set<AudioPreferencesListener>();
  private preferences: AudioPreferences;

  constructor(storageAdapter?: StorageAdapter) {
    this.storage = storageAdapter ?? resolveDefaultSessionStorage();
    this.preferences = parsePersistedPreferences(
      this.storage.getItem(AUDIO_STORAGE_KEYS.PREFERENCES),
    );
  }

  public getPreferences(): AudioPreferences {
    return this.preferences;
  }

  public getDerivedChannels(): DerivedAudioChannelState {
    return deriveAudioChannelState(this.preferences);
  }

  public dispatch(action: AudioMixerAction): AudioPreferences {
    const next = reduceAudioMixerState(this.preferences, action);
    const unchanged =
      next.masterEnabled === this.preferences.masterEnabled &&
      next.musicEnabled === this.preferences.musicEnabled &&
      next.effectsEnabled === this.preferences.effectsEnabled &&
      next.mediaMuted === this.preferences.mediaMuted;

    this.preferences = next;
    this.persist();
    if (!unchanged) {
      this.notify();
    }
    return this.preferences;
  }

  public toggleMaster(): AudioPreferences {
    return this.dispatch({ type: "MASTER_TOGGLED" });
  }

  public toggleMusic(): AudioPreferences {
    return this.dispatch({ type: "MUSIC_TOGGLED" });
  }

  public toggleEffects(): AudioPreferences {
    return this.dispatch({ type: "EFFECTS_TOGGLED" });
  }

  public toggleStandMedia(): AudioPreferences {
    return this.dispatch({ type: "STAND_MEDIA_TOGGLED" });
  }

  public activateSound(): AudioPreferences {
    return this.dispatch({ type: "ACTIVATE_SOUND" });
  }

  public syncMediaMuted(muted: boolean): AudioPreferences {
    return this.dispatch({ type: "SYNC_MEDIA_MUTED", muted });
  }

  public subscribe(listener: AudioPreferencesListener): () => void {
    this.listeners.add(listener);
    listener(this.preferences, this.getDerivedChannels());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(): void {
    this.preferences = { ...DEFAULT_AUDIO_PREFERENCES };
    try {
      this.storage.removeItem(AUDIO_STORAGE_KEYS.PREFERENCES);
    } catch {
      // Ignore storage clear errors
    }
    this.notify();
  }

  private persist(): void {
    try {
      this.storage.setItem(
        AUDIO_STORAGE_KEYS.PREFERENCES,
        JSON.stringify(this.preferences),
      );
    } catch {
      // Ignore storage write errors
    }
  }

  private notify(): void {
    const channels = this.getDerivedChannels();
    for (const listener of this.listeners) {
      listener(this.preferences, channels);
    }
  }
}

let sharedAudioPreferencesStore = new AudioPreferencesStore();

export function getSharedAudioPreferencesStore(): AudioPreferencesStore {
  return sharedAudioPreferencesStore;
}

export function setSharedAudioPreferencesStore(
  store: AudioPreferencesStore | null,
): void {
  sharedAudioPreferencesStore = store ?? new AudioPreferencesStore();
}
