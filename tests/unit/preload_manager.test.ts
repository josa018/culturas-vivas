import { assert } from "../helpers/assert";
import {
  ScenePreloadManager,
  PRELOAD_CONSTANTS,
  type PreloadProgress,
} from "../../src/experience/preload-manager";

async function runPreloadManagerUnitTests(): Promise<void> {
  console.log("--- [UNIT TEST] Scene Preload Manager ---");

  // Test 1: Empty asset list preloads immediately with 100% progress
  {
    const progressLog: PreloadProgress[] = [];
    const manager = new ScenePreloadManager({
      onProgress: (p) => progressLog.push(p),
    });

    const result = await manager.preloadAll([]);
    assert.equal(result.success, true);
    assert.equal(result.loaded.length, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(progressLog.length, 1);
    assert.equal(
      progressLog[0].percentage,
      PRELOAD_CONSTANTS.PERCENTAGE_COMPLETE,
    );
    assert.equal(progressLog[0].isComplete, true);

    console.log("✓ Test 1 Passed: Empty asset list handled synchronously");
  }

  // Test 2: Preloading sequential assets reports granular progress
  {
    const progressLog: PreloadProgress[] = [];
    const manager = new ScenePreloadManager({
      timeoutMs: 1000,
      onProgress: (p) => progressLog.push(p),
    });

    const testUrls = ["/test/asset1.png", "/test/asset2.png"];
    const result = await manager.preloadAll(testUrls);

    assert.equal(result.loaded.length + result.failed.length, testUrls.length);
    // Initial progress (0%) + 1 per asset = 3 total progress updates
    assert.equal(progressLog.length, 3);
    assert.equal(progressLog[0].percentage, 0);
    assert.equal(progressLog[0].isComplete, false);
    assert.equal(progressLog[1].percentage, 50);
    assert.equal(progressLog[1].currentAsset, testUrls[0]);
    assert.equal(progressLog[2].percentage, 100);
    assert.equal(progressLog[2].currentAsset, testUrls[1]);
    assert.equal(progressLog[2].isComplete, true);

    console.log("✓ Test 2 Passed: Granular progress and completion notified");
  }

  // Test 3: Scene loaded detection
  {
    const manager = new ScenePreloadManager();

    // Null scene element
    const nullResult = await manager.waitForSceneLoaded(null);
    assert.equal(nullResult, true);

    // Already loaded scene
    const mockLoadedScene = {
      hasLoaded: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLElement;
    const loadedResult = await manager.waitForSceneLoaded(mockLoadedScene);
    assert.equal(loadedResult, true);

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
    assert.ok(registeredCallback !== null);
    registeredCallback!();
    const eventResult = await promise;
    assert.equal(eventResult, true);

    console.log("✓ Test 3 Passed: WebGL scene lifecycle detection verified");
  }

  // Test 4: Scene loaded timeout fallback
  {
    const manager = new ScenePreloadManager();
    const mockStalledScene = {
      hasLoaded: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLElement;

    const timeoutResult = await manager.waitForSceneLoaded(
      mockStalledScene,
      100,
    );
    assert.equal(timeoutResult, false);

    console.log(
      "✓ Test 4 Passed: Scene loaded timeout fallback handled gracefully",
    );
  }

  console.log("=== ALL PRELOAD MANAGER UNIT TESTS PASSED ===");
}

runPreloadManagerUnitTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
