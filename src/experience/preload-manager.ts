/**
 * Scene Preload Manager
 * Coordinates preloading of critical assets and WebGL scene readiness.
 */

export const PRELOAD_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 8000,
  DEFAULT_CRITICAL_ASSETS: ["/scenes/test_scene.webp"],
  PERCENTAGE_COMPLETE: 100,
  PERCENTAGE_START: 0,
} as const;

export interface PreloadProgress {
  readonly loadedCount: number;
  readonly totalCount: number;
  readonly percentage: number;
  readonly currentAsset?: string;
  readonly isComplete: boolean;
}

export interface PreloadOptions {
  readonly timeoutMs?: number;
  readonly onProgress?: (progress: PreloadProgress) => void;
}

export interface PreloadResult {
  readonly success: boolean;
  readonly loaded: string[];
  readonly failed: string[];
  readonly durationMs: number;
}

export class ScenePreloadManager {
  private readonly timeoutMs: number;
  private readonly onProgress?: (progress: PreloadProgress) => void;

  constructor(options: PreloadOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? PRELOAD_CONSTANTS.DEFAULT_TIMEOUT_MS;
    this.onProgress = options.onProgress;
  }

  /**
   * Preloads a single image or asset URL with fallback timeout.
   */
  public async preloadAsset(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn(`[ScenePreloadManager] Asset timeout: ${url}`);
          resolve(false);
        }
      }, this.timeoutMs);

      const finish = (success: boolean): void => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(success);
        }
      };

      try {
        if (
          typeof window !== "undefined" &&
          typeof (window as any).Image !== "undefined"
        ) {
          const img = new (window as any).Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (typeof img.decode === "function") {
              img
                .decode()
                .then(() => finish(true))
                .catch(() => finish(true));
            } else {
              finish(true);
            }
          };
          img.onerror = () => {
            console.warn(`[ScenePreloadManager] Failed to load image: ${url}`);
            finish(false);
          };
          img.src = url;
        } else if (typeof fetch === "function") {
          fetch(url)
            .then((res) => finish(res.ok))
            .catch(() => finish(false));
        } else {
          // In headless environment without fetch or Image, gracefully mark success
          finish(true);
        }
      } catch (err) {
        console.warn(
          `[ScenePreloadManager] Unexpected asset load error: ${url}`,
          err,
        );
        finish(false);
      }
    });
  }

  /**
   * Preloads an array of asset URLs while updating progress.
   */
  public async preloadAll(urls: readonly string[]): Promise<PreloadResult> {
    const startTime = Date.now();
    const totalCount = urls.length;
    const loaded: string[] = [];
    const failed: string[] = [];

    if (totalCount === 0) {
      this.notifyProgress({
        loadedCount: 0,
        totalCount: 0,
        percentage: PRELOAD_CONSTANTS.PERCENTAGE_COMPLETE,
        isComplete: true,
      });
      return {
        success: true,
        loaded,
        failed,
        durationMs: 0,
      };
    }

    this.notifyProgress({
      loadedCount: 0,
      totalCount,
      percentage: PRELOAD_CONSTANTS.PERCENTAGE_START,
      isComplete: false,
    });

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const ok = await this.preloadAsset(url);
      if (ok) {
        loaded.push(url);
      } else {
        failed.push(url);
      }

      const completedCount = i + 1;
      const percentage = Math.round((completedCount / totalCount) * 100);

      this.notifyProgress({
        loadedCount: completedCount,
        totalCount,
        percentage,
        currentAsset: url,
        isComplete: completedCount === totalCount,
      });
    }

    const durationMs = Date.now() - startTime;
    return {
      success: failed.length === 0,
      loaded,
      failed,
      durationMs,
    };
  }

  /**
   * Awaits WebGL scene 'loaded' event if the element exists and hasn't loaded yet.
   */
  public async waitForSceneLoaded(
    sceneEl: HTMLElement | null,
    timeoutMs = this.timeoutMs,
  ): Promise<boolean> {
    if (!sceneEl) {
      return true;
    }

    if ((sceneEl as any).hasLoaded) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn("[ScenePreloadManager] Scene loaded event timed out");
          resolve(false);
        }
      }, timeoutMs);

      const onLoaded = (): void => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          sceneEl.removeEventListener("loaded", onLoaded);
          resolve(true);
        }
      };

      sceneEl.addEventListener("loaded", onLoaded);
    });
  }

  private notifyProgress(progress: PreloadProgress): void {
    if (this.onProgress) {
      try {
        this.onProgress(progress);
      } catch (err) {
        console.error("[ScenePreloadManager] Progress callback error:", err);
      }
    }
  }
}
