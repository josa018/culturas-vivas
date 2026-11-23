import type { StorageAdapter } from "../../navigation/session-store";
import {
  AUDIO_STORAGE_KEYS,
  AUDIO_TOKENS,
  DEFAULT_AUDIO_PREFERENCES,
  type AudioPreferences,
} from "./audio-constants";

export type AudioMixerAction =
  | { readonly type: "MASTER_TOGGLED" }
  | { readonly type: "SET_MUSIC_VOLUME"; readonly volume: number }
  | { readonly type: "SET_EFFECTS_VOLUME"; readonly volume: number }
  | { readonly type: "STAND_MEDIA_TOGGLED" }
  | { readonly type: "ACTIVATE_SOUND" }
  | { readonly type: "SYNC_MEDIA_MUTED"; readonly muted: boolean };

function clampVolume(volume: number, fallback: number): number {
  if (!Number.isFinite(volume)) {
    return fallback;
  }
  return Math.max(
    AUDIO_TOKENS.VOLUME_MIN,
    Math.min(AUDIO_TOKENS.VOLUME_MAX, volume),
  );
}

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
    case "SET_MUSIC_VOLUME":
      return {
        ...state,
        musicVolume: clampVolume(action.volume, state.musicVolume),
      };
    case "SET_EFFECTS_VOLUME":
      return {
        ...state,
        effectsVolume: clampVolume(action.volume, state.effectsVolume),
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
    musicAudible: prefs.masterEnabled && prefs.musicVolume > AUDIO_TOKENS.VOLUME_MIN,
    effectsAudible:
      prefs.masterEnabled && prefs.effectsVolume > AUDIO_TOKENS.VOLUME_MIN,
    mediaMuted: prefs.mediaMuted,
  };
}

interface LegacyAudioPreferences {
  readonly musicEnabled?: boolean;
  readonly effectsEnabled?: boolean;
}

function parsePersistedPreferences(raw: string | null): AudioPreferences {
  if (!raw) {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AudioPreferences> &
      LegacyAudioPreferences;
    const resolvedMusicVolume =
      typeof parsed.musicVolume === "number"
        ? clampVolume(
            parsed.musicVolume,
            DEFAULT_AUDIO_PREFERENCES.musicVolume,
          )
        : parsed.musicEnabled === false
          ? AUDIO_TOKENS.VOLUME_MIN
          : DEFAULT_AUDIO_PREFERENCES.musicVolume;
    const resolvedEffectsVolume =
      typeof parsed.effectsVolume === "number"
        ? clampVolume(
            parsed.effectsVolume,
            DEFAULT_AUDIO_PREFERENCES.effectsVolume,
          )
        : parsed.effectsEnabled === false
          ? AUDIO_TOKENS.VOLUME_MIN
          : DEFAULT_AUDIO_PREFERENCES.effectsVolume;

    return {
      masterEnabled:
        typeof parsed.masterEnabled === "boolean"
          ? parsed.masterEnabled
          : DEFAULT_AUDIO_PREFERENCES.masterEnabled,
      musicVolume: resolvedMusicVolume,
      effectsVolume: resolvedEffectsVolume,
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
      next.musicVolume === this.preferences.musicVolume &&
      next.effectsVolume === this.preferences.effectsVolume &&
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

  public setMusicVolume(volume: number): AudioPreferences {
    return this.dispatch({ type: "SET_MUSIC_VOLUME", volume });
  }

  public setEffectsVolume(volume: number): AudioPreferences {
    return this.dispatch({ type: "SET_EFFECTS_VOLUME", volume });
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
