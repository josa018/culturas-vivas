import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RoomAssetCache } from "../../src/experience/room-asset-cache";
import { ExhibitMediaType } from "../../src/experience/constants";
import type { RoomMediaProvider } from "../../src/experience/media-types";
import { RoomId, StandId } from "../../src/shared/room-catalog";

describe("RoomAssetCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("preloads destination stand covers on first traversal, hits cache on revisit, and skips empty rooms without skybox loads", async () => {
    const loadedUrls: string[] = [];
    const cache = new RoomAssetCache({
      preloadImage: async (url) => {
        loadedUrls.push(url);
        return true;
      },
    });

    const provider: RoomMediaProvider = {
      getStandItems: (roomId, standId) => {
        if (roomId === RoomId.WIXARIKA && standId === StandId.ARTE) {
          return [
            {
              id: "wix-art-0",
              roomId,
              standId,
              mediaType: ExhibitMediaType.IMAGE_2D,
              title: "Arte",
              creatorName: "Autor",
              description: "Desc",
              mediaUrl: "https://cdn.example.com/cover.webp",
              sortOrder: 0,
            },
          ];
        }
        if (roomId === RoomId.WIXARIKA && standId === StandId.COSMOVISION) {
          return [
            {
              id: "wix-cosmo-0",
              roomId,
              standId,
              mediaType: ExhibitMediaType.VIDEO_2D,
              title: "Danza",
              creatorName: "Autor",
              description: "Desc",
              mediaUrl: "https://cdn.example.com/video.mp4",
              posterUrl: "https://cdn.example.com/video-poster.webp",
              sortOrder: 0,
            },
          ];
        }
        return [];
      },
    };

    const firstVisit = await cache.ensureRoomAssets(RoomId.WIXARIKA, provider);
    expect(firstVisit).toBe(true);
    expect(loadedUrls).toEqual([
      "https://cdn.example.com/video-poster.webp",
      "https://cdn.example.com/cover.webp",
    ]);
    expect(loadedUrls.some((u) => u.includes("/scenes/"))).toBe(false);
    expect(cache.hasLoaded("https://cdn.example.com/cover.webp")).toBe(true);

    // Visit empty NAAYERI -> 0 loads, resolves true
    const emptyVisit = await cache.ensureRoomAssets(RoomId.NAAYERI, provider);
    expect(emptyVisit).toBe(true);
    expect(loadedUrls).toHaveLength(2);

    // Revisit WIXARIKA -> 0 duplicate loads
    const secondVisit = await cache.ensureRoomAssets(RoomId.WIXARIKA, provider);
    expect(secondVisit).toBe(true);
    expect(loadedUrls).toHaveLength(2);
  });

  it("deduplicates concurrent ensureAsset calls for the same asset URL", async () => {
    let resolveLoad!: (ok: boolean) => void;
    const loaderSpy = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const cache = new RoomAssetCache({ preloadImage: loaderSpy });
    const p1 = cache.ensureAsset("https://cdn.example.com/shared.webp");
    const p2 = cache.ensureAsset("https://cdn.example.com/shared.webp");

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

    expect(await cache.ensureAsset("https://cdn.example.com/flaky.webp")).toBe(false);
    expect(cache.hasLoaded("https://cdn.example.com/flaky.webp")).toBe(false);
    expect(await cache.ensureAsset("https://cdn.example.com/flaky.webp")).toBe(true);
    expect(cache.hasLoaded("https://cdn.example.com/flaky.webp")).toBe(true);

    const stalledCache = new RoomAssetCache({
      timeoutMs: 150,
      preloadImage: () => new Promise<boolean>(() => {}),
    });
    const stalledPromise = stalledCache.ensureAsset("https://cdn.example.com/stalled.webp");
    await vi.advanceTimersByTimeAsync(150);
    expect(await stalledPromise).toBe(false);
  });

  it("ignores mediaProvider errors safely during ensureRoomAssets", async () => {
    const cache = new RoomAssetCache({
      preloadImage: async () => true,
    });

    const failingProvider: RoomMediaProvider = {
      getStandItems: vi.fn(() => {
        throw new Error("provider failure");
      }),
    };
    const fallbackOk = await cache.ensureRoomAssets(RoomId.NAAYERI, failingProvider);
    expect(fallbackOk).toBe(true);
  });
});
