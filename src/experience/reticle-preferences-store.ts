import type { StorageAdapter } from "../navigation/session-store";
import {
  DEFAULT_RETICLE_PREFERENCES,
  RETICLE_FUSE_PRESETS_MS,
  RETICLE_IDLE_BEHAVIOR,
  RETICLE_SIZE_PRESETS,
  RETICLE_STORAGE_KEYS,
  type ReticleFusePreset,
  type ReticleIdleBehavior,
  type ReticlePreferences,
  type ReticleSizePreset,
} from "./constants";

export type {
  ReticleFusePreset,
  ReticleIdleBehavior,
  ReticlePreferences,
  ReticleSizePreset,
};

export interface ResolvedReticleConfig {
  readonly sizeMultiplier: number;
  readonly fuseTimeoutMs: number;
  readonly idleBehavior: ReticleIdleBehavior;
}

export type ReticlePreferencesAction =
  | { readonly type: "SET_SIZE_PRESET"; readonly sizePreset: ReticleSizePreset }
  | { readonly type: "SET_FUSE_PRESET"; readonly fusePreset: ReticleFusePreset }
  | {
      readonly type: "SET_IDLE_BEHAVIOR";
      readonly idleBehavior: ReticleIdleBehavior;
    }
  | { readonly type: "TOGGLE_IDLE_BEHAVIOR" };

export type ReticlePreferencesListener = (
  prefs: ReticlePreferences,
  resolved: ResolvedReticleConfig,
) => void;

class InMemoryReticleStorage implements StorageAdapter {
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
      const probeKey = "__cv_reticle_storage_probe__";
      window.sessionStorage.setItem(probeKey, "1");
      window.sessionStorage.removeItem(probeKey);
      return window.sessionStorage;
    }
  } catch {
    // Fallback to memory storage when sessionStorage is blocked
  }
  return new InMemoryReticleStorage();
}

function isValidSizePreset(value: unknown): value is ReticleSizePreset {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RETICLE_SIZE_PRESETS, value)
  );
}

function isValidFusePreset(value: unknown): value is ReticleFusePreset {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(RETICLE_FUSE_PRESETS_MS, value)
  );
}

function isValidIdleBehavior(value: unknown): value is ReticleIdleBehavior {
  return (
    value === RETICLE_IDLE_BEHAVIOR.AUTO_HIDE ||
    value === RETICLE_IDLE_BEHAVIOR.DIM
  );
}

/**
 * Pure reducer updating VR reticle presets with strict validation against known preset keys.
 */
export function reduceReticlePreferencesState(
  state: ReticlePreferences,
  action: ReticlePreferencesAction,
): ReticlePreferences {
  switch (action.type) {
    case "SET_SIZE_PRESET":
      return isValidSizePreset(action.sizePreset)
        ? { ...state, sizePreset: action.sizePreset }
        : state;
    case "SET_FUSE_PRESET":
      return isValidFusePreset(action.fusePreset)
        ? { ...state, fusePreset: action.fusePreset }
        : state;
    case "SET_IDLE_BEHAVIOR":
      return isValidIdleBehavior(action.idleBehavior)
        ? { ...state, idleBehavior: action.idleBehavior }
        : state;
    case "TOGGLE_IDLE_BEHAVIOR":
      return {
        ...state,
        idleBehavior:
          state.idleBehavior === RETICLE_IDLE_BEHAVIOR.AUTO_HIDE
            ? RETICLE_IDLE_BEHAVIOR.DIM
            : RETICLE_IDLE_BEHAVIOR.AUTO_HIDE,
      };
  }
}

export function resolveReticleConfig(
  prefs: ReticlePreferences,
): ResolvedReticleConfig {
  return {
    sizeMultiplier: RETICLE_SIZE_PRESETS[prefs.sizePreset],
    fuseTimeoutMs: RETICLE_FUSE_PRESETS_MS[prefs.fusePreset],
    idleBehavior: prefs.idleBehavior,
  };
}

function parsePersistedReticlePreferences(
  raw: string | null,
): ReticlePreferences {
  if (!raw) {
    return { ...DEFAULT_RETICLE_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ReticlePreferences>;
    return {
      sizePreset: isValidSizePreset(parsed.sizePreset)
        ? parsed.sizePreset
        : DEFAULT_RETICLE_PREFERENCES.sizePreset,
      fusePreset: isValidFusePreset(parsed.fusePreset)
        ? parsed.fusePreset
        : DEFAULT_RETICLE_PREFERENCES.fusePreset,
      idleBehavior: isValidIdleBehavior(parsed.idleBehavior)
        ? parsed.idleBehavior
        : DEFAULT_RETICLE_PREFERENCES.idleBehavior,
    };
  } catch {
    return { ...DEFAULT_RETICLE_PREFERENCES };
  }
}

/**
 * Session-scoped store managing VR reticle preferences over an injected StorageAdapter.
 */
export class ReticlePreferencesStore {
  private readonly storage: StorageAdapter;
  private readonly listeners = new Set<ReticlePreferencesListener>();
  private preferences: ReticlePreferences;

  constructor(storageAdapter?: StorageAdapter) {
    this.storage = storageAdapter ?? resolveDefaultSessionStorage();
    this.preferences = parsePersistedReticlePreferences(
      this.storage.getItem(RETICLE_STORAGE_KEYS.PREFERENCES),
    );
  }

  public getPreferences(): ReticlePreferences {
    return this.preferences;
  }

  public getResolvedConfig(): ResolvedReticleConfig {
    return resolveReticleConfig(this.preferences);
  }

  public dispatch(action: ReticlePreferencesAction): ReticlePreferences {
    const next = reduceReticlePreferencesState(this.preferences, action);
    const unchanged =
      next.sizePreset === this.preferences.sizePreset &&
      next.fusePreset === this.preferences.fusePreset &&
      next.idleBehavior === this.preferences.idleBehavior;

    this.preferences = next;
    this.persist();
    if (!unchanged) {
      this.notify();
    }
    return this.preferences;
  }

  public setSizePreset(sizePreset: ReticleSizePreset): ReticlePreferences {
    return this.dispatch({ type: "SET_SIZE_PRESET", sizePreset });
  }

  public setFusePreset(fusePreset: ReticleFusePreset): ReticlePreferences {
    return this.dispatch({ type: "SET_FUSE_PRESET", fusePreset });
  }

  public setIdleBehavior(
    idleBehavior: ReticleIdleBehavior,
  ): ReticlePreferences {
    return this.dispatch({ type: "SET_IDLE_BEHAVIOR", idleBehavior });
  }

  public toggleIdleBehavior(): ReticlePreferences {
    return this.dispatch({ type: "TOGGLE_IDLE_BEHAVIOR" });
  }

  public subscribe(listener: ReticlePreferencesListener): () => void {
    this.listeners.add(listener);
    listener(this.preferences, this.getResolvedConfig());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(): void {
    this.preferences = { ...DEFAULT_RETICLE_PREFERENCES };
    try {
      this.storage.removeItem(RETICLE_STORAGE_KEYS.PREFERENCES);
    } catch {
      // Ignore storage clear errors
    }
    this.notify();
  }

  private persist(): void {
    try {
      this.storage.setItem(
        RETICLE_STORAGE_KEYS.PREFERENCES,
        JSON.stringify(this.preferences),
      );
    } catch {
      // Ignore storage write errors
    }
  }

  private notify(): void {
    const resolved = this.getResolvedConfig();
    for (const listener of this.listeners) {
      listener(this.preferences, resolved);
    }
  }
}

let sharedReticlePreferencesStore = new ReticlePreferencesStore();

export function getSharedReticlePreferencesStore(): ReticlePreferencesStore {
  return sharedReticlePreferencesStore;
}

export function setSharedReticlePreferencesStore(
  store: ReticlePreferencesStore | null,
): void {
  sharedReticlePreferencesStore = store ?? new ReticlePreferencesStore();
}
