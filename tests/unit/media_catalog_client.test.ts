import { afterEach, describe, expect, it, vi } from "vitest";
import { ExhibitMediaType, MEDIA_CLIENT_CONSTANTS } from "../../src/experience/constants";
import { MediaCatalogClient } from "../../src/experience/media-catalog-client";
import { RoomId, StandId } from "../../src/shared/room-catalog";

describe("MediaCatalogClient", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads catalog items from /api/media and sorts each stand by sortOrder", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "w-2",
              roomId: RoomId.WIXARIKA,
              standId: StandId.VESTIMENTA,
              mediaType: ExhibitMediaType.IMAGE_2D,
              title: "Segundo",
              creatorName: "Luis",
              description: "Desc 2",
              mediaUrl: "https://pub-demo.r2.dev/rooms/wixarika/vestimenta/2.webp",
              sortOrder: 1,
            },
            {
              id: "w-1",
              roomId: RoomId.WIXARIKA,
              standId: StandId.VESTIMENTA,
              mediaType: ExhibitMediaType.VIDEO_2D,
              title: "Primero",
              creatorName: "Ana",
              description: "Desc 1",
              mediaUrl: "https://pub-demo.r2.dev/rooms/wixarika/vestimenta/1.mp4",
              posterUrl: "https://pub-demo.r2.dev/rooms/wixarika/vestimenta/1-poster.webp",
              sortOrder: 0,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new MediaCatalogClient({ fetchImpl: mockFetch });
    await client.load();

    expect(mockFetch).toHaveBeenCalledWith(
      MEDIA_CLIENT_CONSTANTS.CATALOG_ENDPOINT,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const items = client.getStandItems(RoomId.WIXARIKA, StandId.VESTIMENTA);
    expect(items.map((i) => i.id)).toEqual(["w-1", "w-2"]);
    expect(client.getStandItems(RoomId.ODAM, StandId.ARTE)).toEqual([]);
  });

  it("degrades safely to empty arrays when fetch rejects or times out at 3000 ms", async () => {
    vi.useFakeTimers();

    const failingClient = new MediaCatalogClient({
      fetchImpl: vi.fn(async () => {
        throw new Error("Network offline");
      }),
    });
    await expect(failingClient.load()).resolves.toBeUndefined();
    expect(failingClient.getStandItems(RoomId.LOBBY, StandId.BIENVENIDA)).toEqual([]);

    const hangingFetch = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const timeoutClient = new MediaCatalogClient({ fetchImpl: hangingFetch });
    const loadPromise = timeoutClient.load();
    await vi.advanceTimersByTimeAsync(MEDIA_CLIENT_CONSTANTS.FETCH_TIMEOUT_MS);
    await expect(loadPromise).resolves.toBeUndefined();
    expect(timeoutClient.getStandItems(RoomId.LOBBY, StandId.NAYARIT)).toEqual([]);
  });
});
