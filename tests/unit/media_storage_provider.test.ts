import { describe, expect, it, vi } from "vitest";
import {
  MEDIA_STORAGE_LIMITS,
  validateMediaRecordCreate,
  validatePosterPresignRequest,
  validatePresignRequest,
} from "../../api/_media-validation";
import {
  R2StorageProvider,
  resolvePublicMediaUrl,
} from "../../api/_storage";
import { ExhibitMediaType } from "../../src/experience/constants";
import { RoomId, StandId } from "../../src/shared/room-catalog";

describe("api/_storage & api/_media-validation", () => {
  it("resolves relative media keys consistently across trailing slashes and custom base paths", () => {
    expect(
      resolvePublicMediaUrl(
        "https://pub-demo.r2.dev/",
        "rooms/wixarika/vestimenta/item-1.webp",
      ),
    ).toBe("https://pub-demo.r2.dev/rooms/wixarika/vestimenta/item-1.webp");

    expect(
      resolvePublicMediaUrl(
        "https://media.culturas.gob.mx/uploads",
        "/rooms/wixarika/vestimenta/item-1.webp",
      ),
    ).toBe("https://media.culturas.gob.mx/uploads/rooms/wixarika/vestimenta/item-1.webp");

    expect(resolvePublicMediaUrl("/uploads/", "rooms/lobby/historia/a.webp")).toBe(
      "/uploads/rooms/lobby/historia/a.webp",
    );
    expect(resolvePublicMediaUrl("https://pub-demo.r2.dev", null)).toBeUndefined();
  });

  it("dispatches signed DELETE requests and handles 204/404 idempotently in R2StorageProvider", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const provider = new R2StorageProvider({
      accountId: "acct123",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      bucket: "culturas-media",
      now: () => new Date("2026-11-18T12:00:00Z"),
      fetchImpl: fetchSpy,
    });

    expect(provider.getProviderId()).toBe("r2");

    const presigned = await provider.createPresignedUpload({
      objectKey: "rooms/wixarika/arte/a1.webp",
      contentType: "image/webp",
      contentLength: 245000,
    });
    expect(presigned.expiresInSeconds).toBe(MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS);
    expect(presigned.uploadUrl).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");

    await expect(
      provider.deleteObject("rooms/wixarika/arte/a1.webp"),
    ).resolves.toBeUndefined();
    await expect(
      provider.deleteObject("rooms/wixarika/arte/missing.webp"),
    ).resolves.toBeUndefined();
    await expect(
      provider.deleteObject("rooms/wixarika/arte/forbidden.webp"),
    ).rejects.toThrow(/403/);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const firstCallInit = fetchSpy.mock.calls[0]?.[1];
    expect(firstCallInit?.method).toBe("DELETE");
  });

  it("validates room/stand membership, MIME types, and file size caps accurately", () => {
    const valid = validatePresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      mimeType: "image/webp",
      fileSizeBytes: 500_000,
    });
    expect(valid.ok).toBe(true);

    const badRoomStand = validatePresignRequest({
      roomId: RoomId.LOBBY,
      standId: StandId.VESTIMENTA,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      mimeType: "image/webp",
      fileSizeBytes: 1000,
    });
    expect(badRoomStand.ok).toBe(false);
    if (!badRoomStand.ok) {
      expect(badRoomStand.status).toBe(400);
    }

    const badMime = validatePresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      mimeType: "image/gif",
      fileSizeBytes: 1000,
    });
    expect(badMime.ok).toBe(false);
    if (!badMime.ok) {
      expect(badMime.status).toBe(400);
    }

    const tooLargeImage = validatePresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      mimeType: "image/webp",
      fileSizeBytes: MEDIA_STORAGE_LIMITS.MAX_IMAGE_BYTES + 1,
    });
    expect(tooLargeImage.ok).toBe(false);
    if (!tooLargeImage.ok) {
      expect(tooLargeImage.status).toBe(413);
    }

    const tooLargePoster = validatePresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.VIDEO_2D,
      mimeType: "video/mp4",
      fileSizeBytes: 2_000_000,
      posterMimeType: "image/webp",
      posterSizeBytes: MEDIA_STORAGE_LIMITS.MAX_POSTER_BYTES + 1,
    });
    expect(tooLargePoster.ok).toBe(false);
    if (!tooLargePoster.ok) {
      expect(tooLargePoster.status).toBe(413);
    }

    const maxAllowedVideo = validatePresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.VIDEO_2D,
      mimeType: "video/mp4",
      fileSizeBytes: MEDIA_STORAGE_LIMITS.MAX_VIDEO_BYTES,
    });
    expect(maxAllowedVideo.ok).toBe(true);

    const tooLargeVideo = validatePresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.VIDEO_2D,
      mimeType: "video/mp4",
      fileSizeBytes: MEDIA_STORAGE_LIMITS.MAX_VIDEO_BYTES + 1,
    });
    expect(tooLargeVideo.ok).toBe(false);
    if (!tooLargeVideo.ok) {
      expect(tooLargeVideo.status).toBe(413);
    }
  });

  it("enforces calibrated 80 / 80 / 240 metadata limits and validates poster-only presign requests", () => {
    expect(MEDIA_STORAGE_LIMITS.MAX_TITLE_LENGTH).toBe(80);
    expect(MEDIA_STORAGE_LIMITS.MAX_CREATOR_LENGTH).toBe(80);
    expect(MEDIA_STORAGE_LIMITS.MAX_DESCRIPTION_LENGTH).toBe(240);

    const overTitle = validateMediaRecordCreate({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      title: "a".repeat(81),
      creatorName: "Autor",
      description: "Desc",
      mediaKey: "rooms/wixarika/arte/a.webp",
      mimeType: "image/webp",
      fileSizeBytes: 5000,
    });
    expect(overTitle.ok).toBe(false);

    const overCreator = validateMediaRecordCreate({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      title: "Obra",
      creatorName: "b".repeat(81),
      description: "Desc",
      mediaKey: "rooms/wixarika/arte/a.webp",
      mimeType: "image/webp",
      fileSizeBytes: 5000,
    });
    expect(overCreator.ok).toBe(false);

    const overDesc = validateMediaRecordCreate({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaKind: ExhibitMediaType.IMAGE_2D,
      title: "Obra",
      creatorName: "Autor",
      description: "c".repeat(241),
      mediaKey: "rooms/wixarika/arte/a.webp",
      mimeType: "image/webp",
      fileSizeBytes: 5000,
    });
    expect(overDesc.ok).toBe(false);

    const validPosterPresign = validatePosterPresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      posterMimeType: "image/webp",
      posterSizeBytes: 64_000,
    });
    expect(validPosterPresign.ok).toBe(true);

    const badPosterPresign = validatePosterPresignRequest({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      posterMimeType: "video/mp4",
      posterSizeBytes: 64_000,
    });
    expect(badPosterPresign.ok).toBe(false);
    if (!badPosterPresign.ok) {
      expect(badPosterPresign.status).toBe(400);
    }
  });
});
