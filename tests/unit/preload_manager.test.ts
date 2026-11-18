import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ScenePreloadManager,
  getCriticalRoomAssets,
  type PreloadProgress,
} from "../../src/experience/preload-manager";

class MockImage {
  public static behavior: "load" | "decode-reject" | "error" | "hang" = "load";
  public static createdInstances: MockImage[] = [];

  public crossOrigin: string | null = null;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  private _src = "";

  constructor() {
    MockImage.createdInstances.push(this);
  }

  public get src(): string {
    return this._src;
  }

  public set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      if (MockImage.behavior === "load" || MockImage.behavior === "decode-reject") {
        this.onload?.();
      } else if (MockImage.behavior === "error") {
        this.onerror?.();
      }
    });
  }

  public decode(): Promise<void> {
    if (MockImage.behavior === "decode-reject") {
      return Promise.reject(new Error("decode unsupported"));
    }
    return Promise.resolve();
  }
}

describe("ScenePreloadManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockImage.behavior = "load";
    MockImage.createdInstances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("completes immediately with 100% progress for an empty asset list", async () => {
    const progressLog: PreloadProgress[] = [];
    const manager = new ScenePreloadManager({
      onProgress: (p) => progressLog.push(p),
    });

    const result = await manager.preloadAll([]);

    expect(result).toEqual({
      success: true,
      loaded: [],
      failed: [],
      durationMs: 0,
    });
    expect(progressLog).toEqual([
      {
        loadedCount: 0,
        totalCount: 0,
        percentage: 100,
        isComplete: true,
      },
    ]);
  });

  it("loads sequential image assets and reports 0% -> 50% -> 100% progress", async () => {
    vi.stubGlobal("Image", MockImage);
    const progressLog: PreloadProgress[] = [];
    const manager = new ScenePreloadManager({
      timeoutMs: 1000,
      onProgress: (p) => progressLog.push(p),
    });

    const result = await manager.preloadAll(["/scenes/scene1.webp", "/scenes/scene2.webp"]);

    expect(result.success).toBe(true);
    expect(result.loaded).toEqual(["/scenes/scene1.webp", "/scenes/scene2.webp"]);
    expect(result.failed).toEqual([]);
    expect(MockImage.createdInstances.every((img) => img.crossOrigin === "anonymous")).toBe(true);
    expect(progressLog).toEqual([
      { loadedCount: 0, totalCount: 2, percentage: 0, isComplete: false },
      {
        loadedCount: 1,
        totalCount: 2,
        percentage: 50,
        currentAsset: "/scenes/scene1.webp",
        isComplete: false,
      },
      {
        loadedCount: 2,
        totalCount: 2,
        percentage: 100,
        currentAsset: "/scenes/scene2.webp",
        isComplete: true,
      },
    ]);
  });

  it("still marks image as loaded when img.decode() rejects", async () => {
    MockImage.behavior = "decode-reject";
    vi.stubGlobal("Image", MockImage);
    const manager = new ScenePreloadManager({ timeoutMs: 1000 });

    const ok = await manager.preloadAsset("/scenes/scene1.webp");
    expect(ok).toBe(true);
  });

  it("records failed assets when Image triggers onerror", async () => {
    MockImage.behavior = "error";
    vi.stubGlobal("Image", MockImage);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = new ScenePreloadManager({ timeoutMs: 1000 });

    const result = await manager.preloadAll(["/broken.webp"]);

    expect(result.success).toBe(false);
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual(["/broken.webp"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("times out stalled asset loads deterministically without blocking", async () => {
    MockImage.behavior = "hang";
    vi.stubGlobal("Image", MockImage);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = new ScenePreloadManager({ timeoutMs: 1000 });

    const promise = manager.preloadAll(["/stalled-1.webp", "/stalled-2.webp"]);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual(["/stalled-1.webp", "/stalled-2.webp"]);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to fetch when window.Image is unavailable", async () => {
    vi.stubGlobal("Image", undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const manager = new ScenePreloadManager({ timeoutMs: 1000 });
    const result = await manager.preloadAll(["/ok.webp", "/missing.webp", "/err.webp"]);

    expect(result.success).toBe(false);
    expect(result.loaded).toEqual(["/ok.webp"]);
    expect(result.failed).toEqual(["/missing.webp", "/err.webp"]);
  });

  it("continues preloading if onProgress callback throws", async () => {
    vi.stubGlobal("Image", MockImage);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const manager = new ScenePreloadManager({
      onProgress: () => {
        throw new Error("UI progress crash");
      },
    });

    const result = await manager.preloadAll(["/scenes/scene1.webp"]);

    expect(result.success).toBe(true);
    expect(result.loaded).toEqual(["/scenes/scene1.webp"]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("waitForSceneLoaded resolves immediately for null or already-loaded scenes", async () => {
    const manager = new ScenePreloadManager();

    expect(await manager.waitForSceneLoaded(null)).toBe(true);

    const loadedScene = {
      hasLoaded: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    expect(await manager.waitForSceneLoaded(loadedScene)).toBe(true);
    expect(loadedScene.addEventListener).not.toHaveBeenCalled();
  });

  it("waitForSceneLoaded resolves true on 'loaded' event and removes listener", async () => {
    const manager = new ScenePreloadManager();
    const scene = document.createElement("a-scene") as HTMLElement & {
      hasLoaded: boolean;
    };
    scene.hasLoaded = false;
    const removeSpy = vi.spyOn(scene, "removeEventListener");

    const promise = manager.waitForSceneLoaded(scene, 500);
    scene.dispatchEvent(new Event("loaded"));

    expect(await promise).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith("loaded", expect.any(Function));
  });

  it("waitForSceneLoaded returns false on timeout", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const manager = new ScenePreloadManager();
    const stalledScene = document.createElement("a-scene") as HTMLElement & {
      hasLoaded: boolean;
    };
    stalledScene.hasLoaded = false;

    const promise = manager.waitForSceneLoaded(stalledScene, 100);
    await vi.advanceTimersByTimeAsync(100);

    expect(await promise).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("extracts unique critical room skybox assets", () => {
    const assets = getCriticalRoomAssets();
    expect(assets).toEqual(["/scenes/scene1.webp", "/scenes/scene2.webp"]);
  });
});
