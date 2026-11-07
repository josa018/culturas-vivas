import { describe, it, expect } from "vitest";
import {
  ScenePreloadManager,
  PRELOAD_CONSTANTS,
  type PreloadProgress,
} from "../../src/experience/preload-manager";

describe("ScenePreloadManager", () => {
  it("preloads immediately with 100% progress for empty asset list", async () => {
    const progressLog: PreloadProgress[] = [];
    const manager = new ScenePreloadManager({
      onProgress: (p) => progressLog.push(p),
    });

    const result = await manager.preloadAll([]);
    expect(result.success).toBe(true);
    expect(result.loaded.length).toBe(0);
    expect(result.failed.length).toBe(0);
    expect(progressLog.length).toBe(1);
    expect(progressLog[0].percentage).toBe(
      PRELOAD_CONSTANTS.PERCENTAGE_COMPLETE
    );
    expect(progressLog[0].isComplete).toBe(true);
  });

  it("reports granular progress when preloading sequential assets", async () => {
    const progressLog: PreloadProgress[] = [];
    const manager = new ScenePreloadManager({
      timeoutMs: 1000,
      onProgress: (p) => progressLog.push(p),
    });

    const testUrls = ["/test/asset1.png", "/test/asset2.png"];
    const result = await manager.preloadAll(testUrls);

    expect(result.loaded.length + result.failed.length).toBe(testUrls.length);
    expect(progressLog.length).toBe(3);
    expect(progressLog[0].percentage).toBe(0);
    expect(progressLog[0].isComplete).toBe(false);
    expect(progressLog[1].percentage).toBe(50);
    expect(progressLog[1].currentAsset).toBe(testUrls[0]);
    expect(progressLog[2].percentage).toBe(100);
    expect(progressLog[2].currentAsset).toBe(testUrls[1]);
    expect(progressLog[2].isComplete).toBe(true);
  });

  it("detects WebGL scene lifecycle detection accurately", async () => {
    const manager = new ScenePreloadManager();

    // Null scene element
    const nullResult = await manager.waitForSceneLoaded(null);
    expect(nullResult).toBe(true);

    // Already loaded scene
    const mockLoadedScene = {
      hasLoaded: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLElement;
    const loadedResult = await manager.waitForSceneLoaded(mockLoadedScene);
    expect(loadedResult).toBe(true);

    // Scene awaiting event
    let registeredCallback: (() => void) | null = null;
    const mockPendingScene = {
      hasLoaded: false,
      addEventListener: (evt: string, cb: () => void) => {
        if (evt === "loaded") registeredCallback = cb;
      },
      removeEventListener: () => {
        registeredCallback = null;
      },
    } as unknown as HTMLElement;

    const promise = manager.waitForSceneLoaded(mockPendingScene, 500);
    expect(registeredCallback).not.toBeNull();
    registeredCallback!();
    const eventResult = await promise;
    expect(eventResult).toBe(true);
  });

  it("handles scene loaded timeout fallback gracefully", async () => {
    const manager = new ScenePreloadManager();
    const mockStalledScene = {
      hasLoaded: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLElement;

    const timeoutResult = await manager.waitForSceneLoaded(
      mockStalledScene,
      100
    );
    expect(timeoutResult).toBe(false);
  });
});
