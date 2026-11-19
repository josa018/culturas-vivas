import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RoomAssetCache } from "../../src/experience/room-asset-cache";
import { ROOM_CATALOG, RoomId } from "../../src/shared/room-catalog";

describe("RoomAssetCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads target culture skybox on first portal traversal and hits cache on subsequent visits", async () => {
    const loadedUrls: string[] = [];
    const cache = new RoomAssetCache({
      preloadImage: async (url) => {
        loadedUrls.push(url);
        return true;
      },
    });

    const firstVisit = await cache.ensureRoomAssets(RoomId.WIXARIKA);
    expect(firstVisit).toBe(true);
    expect(loadedUrls).toEqual([ROOM_CATALOG[RoomId.WIXARIKA].skyboxUrl]);
    expect(cache.hasLoaded(ROOM_CATALOG[RoomId.WIXARIKA].skyboxUrl)).toBe(true);

    // Return to Lobby and revisit Wixarika -> zero duplicate loads
    await cache.ensureRoomAssets(RoomId.LOBBY);
    const secondVisit = await cache.ensureRoomAssets(RoomId.WIXARIKA);
    expect(secondVisit).toBe(true);
    expect(loadedUrls).toEqual([
      ROOM_CATALOG[RoomId.WIXARIKA].skyboxUrl,
      ROOM_CATALOG[RoomId.LOBBY].skyboxUrl,
    ]);
  });

  it("deduplicates concurrent ensureRoomAssets calls for the same room", async () => {
    let resolveLoad!: (ok: boolean) => void;
    const loaderSpy = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const cache = new RoomAssetCache({ preloadImage: loaderSpy });
    const p1 = cache.ensureRoomAssets(RoomId.NAAYERI);
    const p2 = cache.ensureRoomAssets(RoomId.NAAYERI);

    expect(loaderSpy).toHaveBeenCalledTimes(1);
    resolveLoad(true);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  it("does not cache failed asset loads and times out stalled loads safely", async () => {
    let attempts = 0;
    const cache = new RoomAssetCache({
      timeoutMs: 200,
      preloadImage: async () => {
        attempts++;
        return attempts > 1;
      },
    });

    expect(await cache.ensureRoomAssets(RoomId.ODAM)).toBe(false);
    expect(cache.hasLoaded(ROOM_CATALOG[RoomId.ODAM].skyboxUrl)).toBe(false);
    expect(await cache.ensureRoomAssets(RoomId.ODAM)).toBe(true);
    expect(cache.hasLoaded(ROOM_CATALOG[RoomId.ODAM].skyboxUrl)).toBe(true);

    const stalledCache = new RoomAssetCache({
      timeoutMs: 150,
      preloadImage: () => new Promise<boolean>(() => {}),
    });
    const stalledPromise = stalledCache.ensureRoomAssets(RoomId.MEXICANERO);
    await vi.advanceTimersByTimeAsync(150);
    expect(await stalledPromise).toBe(false);
  });
});
