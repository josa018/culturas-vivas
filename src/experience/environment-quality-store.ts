import { ENVIRONMENT_QUALITY_TOKENS } from "./constants";
import type { EnvironmentQualityTier } from "./landscape/types";
import type { StorageAdapter } from "../navigation/session-store";

type QualityListener = (tier: EnvironmentQualityTier) => void;

function createInMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function resolveDefaultStorage(): StorageAdapter {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const probe = "__cv_quality_probe__";
      window.sessionStorage.setItem(probe, "1");
      window.sessionStorage.removeItem(probe);
      return window.sessionStorage;
    }
  } catch {
    // Fallback when sessionStorage is unavailable or blocked
  }
  return createInMemoryStorage();
}

function normalizeTier(raw: string | null | undefined): EnvironmentQualityTier {
  return raw === ENVIRONMENT_QUALITY_TOKENS.ECO_TIER
    ? ENVIRONMENT_QUALITY_TOKENS.ECO_TIER
    : ENVIRONMENT_QUALITY_TOKENS.DEFAULT_TIER;
}

/**
 * Decoupled client preference store for exterior 3D environment quality ("rich" vs "eco").
 */
export class EnvironmentQualityStore {
  private readonly storage: StorageAdapter;
  private readonly listeners = new Set<QualityListener>();
  private currentTier: EnvironmentQualityTier;

  constructor(storageAdapter?: StorageAdapter) {
    this.storage = storageAdapter ?? resolveDefaultStorage();
    this.currentTier = normalizeTier(
      this.storage.getItem(ENVIRONMENT_QUALITY_TOKENS.STORAGE_KEY),
    );
  }

  public getTier(): EnvironmentQualityTier {
    return this.currentTier;
  }

  public isEcoMode(): boolean {
    return this.currentTier === ENVIRONMENT_QUALITY_TOKENS.ECO_TIER;
  }

  public setTier(tier: EnvironmentQualityTier): void {
    const normalized = normalizeTier(tier);
    if (normalized === this.currentTier) {
      return;
    }
    this.currentTier = normalized;
    try {
      this.storage.setItem(ENVIRONMENT_QUALITY_TOKENS.STORAGE_KEY, normalized);
    } catch {
      // Ignore storage write errors
    }
    for (const listener of this.listeners) {
      listener(normalized);
    }
  }

  public toggle(): EnvironmentQualityTier {
    const next: EnvironmentQualityTier = this.isEcoMode()
      ? ENVIRONMENT_QUALITY_TOKENS.DEFAULT_TIER
      : ENVIRONMENT_QUALITY_TOKENS.ECO_TIER;
    this.setTier(next);
    return next;
  }

  public subscribe(listener: QualityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

let sharedEnvironmentQualityStore: EnvironmentQualityStore | null = null;

export function getSharedEnvironmentQualityStore(): EnvironmentQualityStore {
  if (!sharedEnvironmentQualityStore) {
    sharedEnvironmentQualityStore = new EnvironmentQualityStore();
  }
  return sharedEnvironmentQualityStore;
}
