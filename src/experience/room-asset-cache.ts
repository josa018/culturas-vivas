import {
  DEFAULT_ROOM_ID,
  ROOM_CATALOG,
  type RoomId,
} from "../shared/room-catalog";

export const ROOM_ASSET_CACHE_DEFAULTS = {
  LOAD_TIMEOUT_MS: 8000,
} as const;

export type RoomImagePreloader = (url: string) => Promise<boolean>;

export interface RoomAssetCacheOptions {
  readonly timeoutMs?: number;
  readonly preloadImage?: RoomImagePreloader;
}

function defaultPreloadImage(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    const finish = (ok: boolean): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      }
    };

    if (
      typeof window !== "undefined" &&
      typeof (window as unknown as { Image?: unknown }).Image !== "undefined"
    ) {
      const ImgCtor = (window as unknown as { Image: new () => HTMLImageElement })
        .Image;
      const img = new ImgCtor();
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
      img.onerror = () => finish(false);
      img.src = url;
      return;
    }

    if (typeof fetch === "function") {
      fetch(url)
        .then((res) => finish(res.ok))
        .catch(() => finish(false));
      return;
    }

    finish(true);
  });
}

/**
 * Caches decoded skybox assets across room transitions to avoid duplicate downloads.
 */
export class RoomAssetCache {
  private readonly loadedUrls = new Set<string>();
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly timeoutMs: number;
  private readonly preloadImage: RoomImagePreloader;

  constructor(options: RoomAssetCacheOptions = {}) {
    this.timeoutMs =
      options.timeoutMs ?? ROOM_ASSET_CACHE_DEFAULTS.LOAD_TIMEOUT_MS;
    this.preloadImage =
      options.preloadImage ??
      ((url: string) => defaultPreloadImage(url, this.timeoutMs));
  }

  public hasLoaded(url: string): boolean {
    return this.loadedUrls.has(url);
  }

  public markLoaded(url: string): void {
    this.loadedUrls.add(url);
  }

  public clear(): void {
    this.loadedUrls.clear();
    this.inFlight.clear();
  }

  public async ensureAsset(url: string): Promise<boolean> {
    if (this.loadedUrls.has(url)) {
      return true;
    }

    const pending = this.inFlight.get(url);
    if (pending) {
      return pending;
    }

    const loadPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.inFlight.delete(url);
          resolve(false);
        }
      }, this.timeoutMs);

      this.preloadImage(url)
        .then((ok) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.inFlight.delete(url);
            if (ok) {
              this.loadedUrls.add(url);
            }
            resolve(ok);
          }
        })
        .catch(() => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.inFlight.delete(url);
            resolve(false);
          }
        });
    });

    this.inFlight.set(url, loadPromise);
    return loadPromise;
  }

  public async ensureRoomAssets(roomId: RoomId): Promise<boolean> {
    const entry = ROOM_CATALOG[roomId] ?? ROOM_CATALOG[DEFAULT_ROOM_ID];
    return this.ensureAsset(entry.skyboxUrl);
  }
}
