import { describe, it, expect, beforeEach } from "vitest";
import type { StorageAdapter } from "../../src/navigation/session-store";
import {
  DEFAULT_RETICLE_PREFERENCES,
  RETICLE_FUSE_PRESETS_MS,
  RETICLE_SIZE_PRESETS,
  RETICLE_STORAGE_KEYS,
  RETICLE_TOKENS,
} from "../../src/experience/constants";
import {
  ReticlePreferencesStore,
  getSharedReticlePreferencesStore,
  reduceReticlePreferencesState,
  setSharedReticlePreferencesStore,
  type ReticlePreferences,
} from "../../src/experience/reticle-preferences-store";

class InMemoryTestStorage implements StorageAdapter {
  public readonly data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  public removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("ReticlePreferencesStore (Session-Scoped Reticle Preferences)", () => {
  beforeEach(() => {
    setSharedReticlePreferencesStore(null);
  });

  it("exposes declarative reticle preset constants and falls back safely on corrupt JSON", () => {
    expect(RETICLE_STORAGE_KEYS.PREFERENCES).toBe("cv_reticle_preferences");
    expect(RETICLE_SIZE_PRESETS).toEqual({
      SMALL: 0.75,
      NORMAL: 1.0,
      LARGE: 1.35,
    });
    expect(RETICLE_FUSE_PRESETS_MS).toEqual({
      FAST: 1000,
      NORMAL: 1500,
      SLOW: 2500,
    });
    expect(RETICLE_TOKENS.DIM_OPACITY).toBe(0.25);

    const storage = new InMemoryTestStorage();
    storage.setItem(RETICLE_STORAGE_KEYS.PREFERENCES, "{corrupt-json");

    const store = new ReticlePreferencesStore(storage);
    expect(store.getPreferences()).toEqual(DEFAULT_RETICLE_PREFERENCES);
    expect(store.getResolvedConfig()).toEqual({
      sizeMultiplier: 1.0,
      fuseTimeoutMs: 1500,
      idleBehavior: "AUTO_HIDE",
    });
  });

  it("persists preset changes, notifies subscribers, hydrates a second instance, and resets cleanly", () => {
    const storage = new InMemoryTestStorage();
    const store = new ReticlePreferencesStore(storage);
    const seen: ReticlePreferences[] = [];

    const unsubscribe = store.subscribe((prefs) => {
      seen.push(prefs);
    });

    expect(seen).toEqual([
      { sizePreset: "NORMAL", fusePreset: "NORMAL", idleBehavior: "AUTO_HIDE" },
    ]);

    store.setSizePreset("LARGE");
    store.setFusePreset("FAST");
    store.setIdleBehavior("DIM");

    expect(store.getPreferences()).toEqual({
      sizePreset: "LARGE",
      fusePreset: "FAST",
      idleBehavior: "DIM",
    });
    expect(store.getResolvedConfig()).toEqual({
      sizeMultiplier: 1.35,
      fuseTimeoutMs: 1000,
      idleBehavior: "DIM",
    });
    expect(seen).toHaveLength(4);

    // Hydrate from persisted StorageAdapter
    const hydrated = new ReticlePreferencesStore(storage);
    expect(hydrated.getPreferences()).toEqual({
      sizePreset: "LARGE",
      fusePreset: "FAST",
      idleBehavior: "DIM",
    });

    hydrated.toggleIdleBehavior();
    expect(hydrated.getPreferences().idleBehavior).toBe("AUTO_HIDE");

    store.reset();
    expect(store.getPreferences()).toEqual(DEFAULT_RETICLE_PREFERENCES);
    expect(storage.getItem(RETICLE_STORAGE_KEYS.PREFERENCES)).toBeNull();

    unsubscribe();
    store.setSizePreset("SMALL");
    expect(seen).toHaveLength(5);
  });

  it("ignores invalid preset payloads in pure reducer and hydrates valid partial storage", () => {
    const next = reduceReticlePreferencesState(DEFAULT_RETICLE_PREFERENCES, {
      type: "SET_SIZE_PRESET",
      sizePreset: "INVALID" as never,
    });
    expect(next).toEqual(DEFAULT_RETICLE_PREFERENCES);

    const storage = new InMemoryTestStorage();
    storage.setItem(
      RETICLE_STORAGE_KEYS.PREFERENCES,
      JSON.stringify({ sizePreset: "SMALL", fusePreset: "BOGUS", idleBehavior: "DIM" }),
    );
    const store = new ReticlePreferencesStore(storage);
    expect(store.getPreferences()).toEqual({
      sizePreset: "SMALL",
      fusePreset: "NORMAL",
      idleBehavior: "DIM",
    });

    const shared = getSharedReticlePreferencesStore();
    expect(shared.getPreferences()).toEqual(DEFAULT_RETICLE_PREFERENCES);
  });
});
