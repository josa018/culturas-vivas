import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminHttpError, type AdminNetworkFetcher } from "../../src/admin/admin-http-client";
import { ADMIN_MEDIA_ENDPOINTS } from "../../src/admin/constants";
import type { AdminMediaProcessor } from "../../src/admin/media-processor";
import { AdminMediaStore } from "../../src/admin/media-store";
import { ExhibitMediaType } from "../../src/experience/constants";
import { RoomId, StandId } from "../../src/shared/room-catalog";

function createMockFetcher(): AdminNetworkFetcher {
  return {
    get: vi.fn(async () => ({ items: [], storageUsageBytes: 0, maxStorageBytes: 8_589_934_592 })),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({ ok: true, storageUsageBytes: 0 })),
    putBinary: vi.fn(async () => {}),
  };
}

describe("AdminMediaStore", () => {
  let fetcher: AdminNetworkFetcher;
  let onUnauthorized: ReturnType<typeof vi.fn>;
  let processor: AdminMediaProcessor;

  beforeEach(() => {
    fetcher = createMockFetcher();
    onUnauthorized = vi.fn();
    processor = {
      optimizeImage: vi.fn(async () => ({
        blob: new Blob(["webp"], { type: "image/webp" }),
        width: 2048,
        height: 1536,
        mimeType: "image/webp" as const,
      })),
      extractVideoPoster: vi.fn(async () => ({
        posterBlob: new Blob(["poster"], { type: "image/webp" }),
        videoWidth: 1920,
        videoHeight: 1080,
        posterWidth: 1024,
        posterHeight: 576,
        posterMimeType: "image/webp" as const,
      })),
    } as unknown as AdminMediaProcessor;
  });

  it("uploads video + extracted poster through presign -> binary PUT -> metadata POST", async () => {
    (fetcher.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        media: {
          key: "rooms/wixarika/arte/v1.mp4",
          uploadUrl: "https://r2.example.com/v1.mp4",
          headers: { "Content-Type": "video/mp4", "Content-Length": "9" },
        },
        poster: {
          key: "rooms/wixarika/arte/v1-poster.webp",
          uploadUrl: "https://r2.example.com/v1-poster.webp",
          headers: { "Content-Type": "image/webp", "Content-Length": "6" },
        },
        storageUsageBytes: 0,
        maxStorageBytes: 8_589_934_592,
      })
      .mockResolvedValueOnce({
        item: {
          id: "v1",
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaType: ExhibitMediaType.VIDEO_STEREO_SBS,
          title: "Danza",
          creatorName: "Sofía Carrillo",
          description: "Registro SBS.",
          mediaKey: "rooms/wixarika/arte/v1.mp4",
          posterKey: "rooms/wixarika/arte/v1-poster.webp",
          mediaUrl: "https://pub.r2.dev/rooms/wixarika/arte/v1.mp4",
          posterUrl: "https://pub.r2.dev/rooms/wixarika/arte/v1-poster.webp",
          fileSizeBytes: 9,
          width: 1920,
          height: 1080,
          sortOrder: 0,
        },
        storageUsageBytes: 9,
        maxStorageBytes: 8_589_934_592,
      });

    const store = new AdminMediaStore({
      fetcher,
      getToken: () => "jwt-token",
      onUnauthorized,
      processor,
    });

    const videoFile = new File(["123456789"], "danza.mp4", { type: "video/mp4" });
    await store.uploadMedia({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      file: videoFile,
      mediaKind: ExhibitMediaType.VIDEO_STEREO_SBS,
      title: "Danza",
      creatorName: "Sofía Carrillo",
      description: "Registro SBS.",
    });

    expect(fetcher.post).toHaveBeenNthCalledWith(
      1,
      ADMIN_MEDIA_ENDPOINTS.PRESIGN,
      expect.objectContaining({
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        mediaKind: ExhibitMediaType.VIDEO_STEREO_SBS,
        mimeType: "video/mp4",
        posterMimeType: "image/webp",
      }),
      { Authorization: "Bearer jwt-token" },
    );
    expect(fetcher.putBinary).toHaveBeenCalledTimes(2);
    expect(fetcher.post).toHaveBeenNthCalledWith(
      2,
      ADMIN_MEDIA_ENDPOINTS.MEDIA,
      expect.objectContaining({
        creatorName: "Sofía Carrillo",
        mediaKey: "rooms/wixarika/arte/v1.mp4",
        posterKey: "rooms/wixarika/arte/v1-poster.webp",
      }),
      { Authorization: "Bearer jwt-token" },
    );

    store.setSelection(RoomId.WIXARIKA, StandId.ARTE);
    expect(store.getSelectedItems()).toHaveLength(1);
    expect(store.getState().storageUsageBytes).toBe(9);
  });

  it("handles reordering, editing, deletion, and 401 session expiration cleanly", async () => {
    (fetcher.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          id: "m1",
          roomId: RoomId.ODAM,
          standId: StandId.VIVIENDA,
          mediaType: ExhibitMediaType.IMAGE_2D,
          title: "Casa",
          creatorName: "Ana",
          description: "Original",
          mediaUrl: "https://pub.r2.dev/m1.webp",
          sortOrder: 0,
        },
        {
          id: "m2",
          roomId: RoomId.ODAM,
          standId: StandId.VIVIENDA,
          mediaType: ExhibitMediaType.IMAGE_2D,
          title: "Techo",
          creatorName: "",
          description: "Segundo",
          mediaUrl: "https://pub.r2.dev/m2.webp",
          sortOrder: 1,
        },
      ],
      storageUsageBytes: 2048,
      maxStorageBytes: 8_589_934_592,
    });

    const store = new AdminMediaStore({
      fetcher,
      getToken: () => "jwt-token",
      onUnauthorized,
      processor,
    });

    await store.fetchCatalog();
    store.setSelection(RoomId.ODAM, StandId.VIVIENDA);
    expect(store.getSelectedItems().map((i) => i.id)).toEqual(["m1", "m2"]);

    await store.moveItem("m2", "up");
    expect(fetcher.patch).toHaveBeenCalledWith(
      ADMIN_MEDIA_ENDPOINTS.MEDIA,
      {
        roomId: RoomId.ODAM,
        standId: StandId.VIVIENDA,
        orderedIds: ["m2", "m1"],
      },
      { Authorization: "Bearer jwt-token" },
    );
    expect(store.getSelectedItems().map((i) => i.id)).toEqual(["m2", "m1"]);

    (fetcher.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      item: {
        id: "m2",
        roomId: RoomId.ODAM,
        standId: StandId.VIVIENDA,
        mediaType: ExhibitMediaType.IMAGE_STEREO_SBS,
        title: "Techo Actualizado",
        creatorName: "Carlos",
        description: "Editado",
        mediaUrl: "https://pub.r2.dev/m2.webp",
        sortOrder: 0,
      },
    });
    await store.updateItemMetadata({
      id: "m2",
      title: "Techo Actualizado",
      creatorName: "Carlos",
      description: "Editado",
      mediaKind: ExhibitMediaType.IMAGE_STEREO_SBS,
    });
    expect(store.getSelectedItems()[0]?.creatorName).toBe("Carlos");

    await store.deleteItem("m1");
    expect(fetcher.delete).toHaveBeenCalledWith(
      `${ADMIN_MEDIA_ENDPOINTS.MEDIA}?id=m1`,
      { Authorization: "Bearer jwt-token" },
    );
    expect(store.getSelectedItems().map((i) => i.id)).toEqual(["m2"]);

    (fetcher.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new AdminHttpError(401, "Unauthorized"),
    );
    await store.fetchCatalog();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("uploads video with custom poster file or seek timestamp and supports replaceVideoPoster(id, file)", async () => {
    const customPosterBlob = new Blob(["custom-webp"], { type: "image/webp" });
    const replacementPosterBlob = new Blob(["new-poster-webp"], {
      type: "image/webp",
    });

    (processor as unknown as { optimizePosterImage: ReturnType<typeof vi.fn> }).optimizePosterImage =
      vi
        .fn()
        .mockResolvedValueOnce({
          posterBlob: customPosterBlob,
          videoWidth: 1280,
          videoHeight: 720,
          posterWidth: 1024,
          posterHeight: 576,
          posterMimeType: "image/webp",
        })
        .mockResolvedValueOnce({
          posterBlob: replacementPosterBlob,
          videoWidth: 1024,
          videoHeight: 576,
          posterWidth: 1024,
          posterHeight: 576,
          posterMimeType: "image/webp",
        });

    (fetcher.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [
        {
          id: "vid-existing",
          roomId: RoomId.WIXARIKA,
          standId: StandId.COSMOVISION,
          mediaType: ExhibitMediaType.VIDEO_2D,
          title: "Canto Ceremonial",
          creatorName: "Marakame",
          description: "Grabación tradicional.",
          mediaKey: "rooms/wixarika/cosmovision/canto.mp4",
          posterKey: "rooms/wixarika/cosmovision/canto-old-poster.webp",
          mediaUrl: "https://pub.r2.dev/rooms/wixarika/cosmovision/canto.mp4",
          posterUrl:
            "https://pub.r2.dev/rooms/wixarika/cosmovision/canto-old-poster.webp",
          sortOrder: 0,
        },
      ],
      storageUsageBytes: 2_000_000,
      maxStorageBytes: 8_589_934_592,
    });

    (fetcher.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        media: {
          key: "rooms/wixarika/cosmovision/v2.mp4",
          uploadUrl: "https://r2.example.com/v2.mp4",
          headers: { "Content-Type": "video/mp4" },
        },
        poster: {
          key: "rooms/wixarika/cosmovision/v2-poster.webp",
          uploadUrl: "https://r2.example.com/v2-poster.webp",
          headers: { "Content-Type": "image/webp" },
        },
      })
      .mockResolvedValueOnce({
        item: {
          id: "v2",
          roomId: RoomId.WIXARIKA,
          standId: StandId.COSMOVISION,
          mediaType: ExhibitMediaType.VIDEO_2D,
          title: "Video con portada propia",
          creatorName: "",
          description: "Desc.",
          mediaUrl: "https://pub.r2.dev/rooms/wixarika/cosmovision/v2.mp4",
          posterUrl: "https://pub.r2.dev/rooms/wixarika/cosmovision/v2-poster.webp",
          sortOrder: 1,
        },
      })
      .mockResolvedValueOnce({
        poster: {
          key: "rooms/wixarika/cosmovision/canto-new-poster.webp",
          uploadUrl: "https://r2.example.com/canto-new-poster.webp",
          headers: { "Content-Type": "image/webp" },
        },
      });

    (fetcher.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      item: {
        id: "vid-existing",
        roomId: RoomId.WIXARIKA,
        standId: StandId.COSMOVISION,
        mediaType: ExhibitMediaType.VIDEO_2D,
        title: "Canto Ceremonial",
        creatorName: "Marakame",
        description: "Grabación tradicional.",
        mediaKey: "rooms/wixarika/cosmovision/canto.mp4",
        posterKey: "rooms/wixarika/cosmovision/canto-new-poster.webp",
        mediaUrl: "https://pub.r2.dev/rooms/wixarika/cosmovision/canto.mp4",
        posterUrl:
          "https://pub.r2.dev/rooms/wixarika/cosmovision/canto-new-poster.webp",
        sortOrder: 0,
      },
    });

    const store = new AdminMediaStore({
      fetcher,
      getToken: () => "jwt-token",
      onUnauthorized,
      processor,
    });
    await store.fetchCatalog();

    // 1. Upload with customPosterFile bypasses extractVideoPoster and uploads optimized custom poster
    const videoFile = new File(["mp4"], "video.mp4", { type: "video/mp4" });
    const customCoverFile = new File(["png"], "cover.png", { type: "image/png" });
    await store.uploadMedia({
      roomId: RoomId.WIXARIKA,
      standId: StandId.COSMOVISION,
      file: videoFile,
      customPosterFile: customCoverFile,
      posterSeekSeconds: 3.2,
      mediaKind: ExhibitMediaType.VIDEO_2D,
      title: "Video con portada propia",
      creatorName: "",
      description: "Desc.",
    });

    expect(fetcher.putBinary).toHaveBeenCalledWith(
      "https://r2.example.com/v2-poster.webp",
      customPosterBlob,
      expect.any(Object),
    );

    // 2. replaceVideoPoster runs posterOnly presign -> binary PUT -> PATCH
    const newThumbFile = new File(["jpg"], "thumb.jpg", { type: "image/jpeg" });
    await store.replaceVideoPoster("vid-existing", newThumbFile);

    expect(fetcher.post).toHaveBeenLastCalledWith(
      ADMIN_MEDIA_ENDPOINTS.PRESIGN,
      expect.objectContaining({
        posterOnly: true,
        roomId: RoomId.WIXARIKA,
        standId: StandId.COSMOVISION,
        posterMimeType: "image/webp",
        posterSizeBytes: replacementPosterBlob.size,
      }),
      { Authorization: "Bearer jwt-token" },
    );
    expect(fetcher.putBinary).toHaveBeenLastCalledWith(
      "https://r2.example.com/canto-new-poster.webp",
      replacementPosterBlob,
      { "Content-Type": "image/webp" },
    );
    expect(fetcher.patch).toHaveBeenLastCalledWith(
      ADMIN_MEDIA_ENDPOINTS.MEDIA,
      {
        id: "vid-existing",
        posterKey: "rooms/wixarika/cosmovision/canto-new-poster.webp",
      },
      { Authorization: "Bearer jwt-token" },
    );
    store.setSelection(RoomId.WIXARIKA, StandId.COSMOVISION);
    expect(store.getSelectedItems()[0]?.posterUrl).toContain(
      "canto-new-poster.webp",
    );
  });
});
