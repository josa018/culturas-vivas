import { describe, expect, it, vi } from "vitest";
import { ENVIRONMENT_QUALITY_TOKENS } from "../../src/experience/constants";
import { EnvironmentQualityStore } from "../../src/experience/environment-quality-store";
import type { StorageAdapter } from "../../src/navigation/session-store";

function createMemoryStorage(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, val) => {
      data.set(key, val);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("EnvironmentQualityStore", () => {
  it("defaults to rich, persists eco mode in StorageAdapter, and notifies subscribers", () => {
    const storage = createMemoryStorage();
    const store = new EnvironmentQualityStore(storage);

    expect(store.getTier()).toBe(ENVIRONMENT_QUALITY_TOKENS.DEFAULT_TIER);
    expect(store.isEcoMode()).toBe(false);

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.toggle()).toBe("eco");
    expect(store.getTier()).toBe("eco");
    expect(store.isEcoMode()).toBe(true);
    expect(storage.getItem(ENVIRONMENT_QUALITY_TOKENS.STORAGE_KEY)).toBe("eco");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("eco");

    const restored = new EnvironmentQualityStore(storage);
    expect(restored.getTier()).toBe("eco");

    unsubscribe();
    store.setTier("rich");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getTier()).toBe("rich");
  });
});
