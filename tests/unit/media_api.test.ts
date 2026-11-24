import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signAdminToken } from "../../api/_auth";
import type { MediaStorageProvider } from "../../api/_storage";
import { MEDIA_STORAGE_LIMITS } from "../../api/_media-validation";
import { createMediaGetHandler } from "../../api/media";
import { createAdminMediaHandler } from "../../api/admin/media";
import { createPresignMediaHandler } from "../../api/admin/media/presign";
import { RoomId, StandId } from "../../src/shared/room-catalog";

const TEST_JWT_SECRET = "test-secret-minimum-32-bytes-long-for-hs256";
const PUBLIC_BASE_URL = "https://pub-test-bucket.r2.dev";

async function applyAllMigrations(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON;");
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    await client.executeMultiple(sql);
  }
}

function createMockResponse() {
  let statusCode = 0;
  let body: unknown = null;
  const headers = new Map<string, string>();
  return {
    res: {
      setHeader: (name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      },
      status: (code: number) => {
        statusCode = code;
        return {
          json: (payload: unknown) => {
            body = payload;
          },
        };
      },
    },
    getStatus: () => statusCode,
    getBody: () => body,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
  };
}

function createMockStorageProvider(): MediaStorageProvider & {
  deletedKeys: string[];
} {
  const deletedKeys: string[] = [];
  return {
    deletedKeys,
    getProviderId: () => "r2",
    createPresignedUpload: vi.fn(async (input) => ({
      key: input.objectKey,
      uploadUrl: `https://acct123.r2.cloudflarestorage.com/bucket/${input.objectKey}?X-Amz-Signature=deadbeef`,
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.contentLength),
      },
      expiresInSeconds: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
    })),
    deleteObject: vi.fn(async (key: string) => {
      deletedKeys.push(key);
    }),
  };
}

describe("Media Catalog & Admin Media CMS API", () => {
  let db: Client;
  let storageProvider: ReturnType<typeof createMockStorageProvider>;
  let authHeader: string;
  let clockMs = 1_700_000_000_000;

  beforeEach(async () => {
    process.env.ADMIN_JWT_SECRET = TEST_JWT_SECRET;
    process.env.MEDIA_PUBLIC_BASE_URL = PUBLIC_BASE_URL;
    db = createClient({ url: ":memory:" });
    await applyAllMigrations(db);
    storageProvider = createMockStorageProvider();
    const token = await signAdminToken(
      { id: 1, username: "curator", role: "admin" },
      TEST_JWT_SECRET,
    );
    authHeader = `Bearer ${token}`;
    clockMs = 1_700_000_000_000;
  });

  afterEach(() => {
    db.close();
  });

  it("rejects missing or invalid Bearer tokens with 401 across all admin media routes", async () => {
    const presign = createPresignMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
    });
    const adminMedia = createAdminMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
    });

    for (const [fn, req] of [
      [presign, { method: "POST", body: {}, headers: {} }],
      [adminMedia, { method: "POST", body: {}, headers: { authorization: "Bearer bad" } }],
      [adminMedia, { method: "PATCH", body: {}, headers: {} }],
      [adminMedia, { method: "DELETE", url: "/api/admin/media?id=123", headers: {} }],
    ] as const) {
      const mock = createMockResponse();
      await fn(req, mock.res);
      expect(mock.getStatus()).toBe(401);
    }
  });

  it("enforces 8 GiB global quota and validation guardrails on /api/admin/media/presign", async () => {
    await db.execute({
      sql: `INSERT INTO room_media_items (
              id, room_id, stand_id, media_kind, title, creator_name, description,
              storage_provider, media_key, poster_key, mime_type, file_size_bytes,
              sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "seed-heavy",
        RoomId.LOBBY,
        StandId.BIENVENIDA,
        "VIDEO_2D",
        "Video Pesado",
        "",
        "",
        "r2",
        "rooms/lobby/historia/seed.mp4",
        null,
        "video/mp4",
        8_580_000_000,
        0,
        1000,
        1000,
      ],
    });

    const presign = createPresignMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
    });

    // Exceeds 8 GiB quota
    const quotaMock = createMockResponse();
    await presign(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaKind: "VIDEO_2D",
          mimeType: "video/mp4",
          fileSizeBytes: 15_000_000,
        },
      },
      quotaMock.res,
    );
    expect(quotaMock.getStatus()).toBe(413);
    expect(storageProvider.createPresignedUpload).not.toHaveBeenCalled();

    // Oversized single image (> 5 MiB)
    const oversizedMock = createMockResponse();
    await presign(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaKind: "IMAGE_2D",
          mimeType: "image/webp",
          fileSizeBytes: MEDIA_STORAGE_LIMITS.MAX_IMAGE_BYTES + 1,
        },
      },
      oversizedMock.res,
    );
    expect(oversizedMock.getStatus()).toBe(413);

    // Invalid (LOBBY, VESTIMENTA)
    const badSlotMock = createMockResponse();
    await presign(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          roomId: RoomId.LOBBY,
          standId: StandId.VESTIMENTA,
          mediaKind: "IMAGE_2D",
          mimeType: "image/webp",
          fileSizeBytes: 25000,
        },
      },
      badSlotMock.res,
    );
    expect(badSlotMock.getStatus()).toBe(400);

    // Valid upload under remaining quota
    const validMock = createMockResponse();
    await presign(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaKind: "VIDEO_STEREO_SBS",
          mimeType: "video/mp4",
          fileSizeBytes: 1_500_000,
          posterMimeType: "image/webp",
          posterSizeBytes: 42_000,
        },
      },
      validMock.res,
    );
    expect(validMock.getStatus()).toBe(200);
    const body = validMock.getBody() as {
      media: { key: string; uploadUrl: string };
      poster?: { key: string; uploadUrl: string };
      storageUsageBytes: number;
      maxStorageBytes: number;
    };
    expect(body.media.key).toMatch(/^rooms\/wixarika\/arte\/.+\.mp4$/);
    expect(body.poster?.key).toMatch(/^rooms\/wixarika\/arte\/.+-poster\.webp$/);
    expect(body.storageUsageBytes).toBe(8_580_000_000);
    expect(body.maxStorageBytes).toBe(MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES);
  });

  it("supports POST create, GET /api/media sorting + Cache-Control, PATCH edit + reorder, and DELETE cleanup", async () => {
    const adminMedia = createAdminMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
      now: () => {
        clockMs += 1000;
        return clockMs;
      },
    });
    const publicMedia = createMediaGetHandler({
      resolveDb: () => db,
      resolvePublicBaseUrl: () => PUBLIC_BASE_URL,
    });

    // POST item A (video with poster + creator)
    const createAMock = createMockResponse();
    await adminMedia(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          id: "item-a",
          roomId: RoomId.ODAM,
          standId: StandId.VIVIENDA,
          mediaKind: "VIDEO_2D",
          title: "Casa tradicional O'dam",
          creatorName: "Juan Reyes",
          description: "Construcción de adobe.",
          mediaKey: "rooms/odam/vivienda/a.mp4",
          posterKey: "rooms/odam/vivienda/a-poster.webp",
          mimeType: "video/mp4",
          fileSizeBytes: 2_000_000,
          width: 1920,
          height: 1080,
        },
      },
      createAMock.res,
    );
    expect(createAMock.getStatus()).toBe(201);

    // POST item B (image without creator)
    const createBMock = createMockResponse();
    await adminMedia(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          id: "item-b",
          roomId: RoomId.ODAM,
          standId: StandId.VIVIENDA,
          mediaKind: "IMAGE_2D",
          title: "Techo de teja",
          creatorName: "",
          description: "Detalle arquitectónico.",
          mediaKey: "rooms/odam/vivienda/b.webp",
          mimeType: "image/webp",
          fileSizeBytes: 150_000,
          width: 1200,
          height: 900,
        },
      },
      createBMock.res,
    );
    expect(createBMock.getStatus()).toBe(201);

    // PATCH metadata of item-b
    const editMock = createMockResponse();
    await adminMedia(
      {
        method: "PATCH",
        headers: { authorization: authHeader },
        body: {
          id: "item-b",
          title: "Techo tradicional de teja",
          creatorName: "Sofía Méndez",
          mediaKind: "IMAGE_STEREO_SBS",
        },
      },
      editMock.res,
    );
    expect(editMock.getStatus()).toBe(200);

    // PATCH atomic reorder [item-b, item-a]
    const reorderMock = createMockResponse();
    await adminMedia(
      {
        method: "PATCH",
        headers: { authorization: authHeader },
        body: {
          roomId: RoomId.ODAM,
          standId: StandId.VIVIENDA,
          orderedIds: ["item-b", "item-a"],
        },
      },
      reorderMock.res,
    );
    expect(reorderMock.getStatus()).toBe(200);

    // GET /api/media verifies order, resolved URLs, creatorName, and Cache-Control
    const getMock = createMockResponse();
    await publicMedia({ method: "GET" }, getMock.res);
    expect(getMock.getStatus()).toBe(200);
    expect(getMock.getHeader("cache-control")).toBe(
      "public, max-age=30, stale-while-revalidate=120",
    );
    const catalogBody = getMock.getBody() as {
      items: Array<{
        id: string;
        title: string;
        creatorName: string;
        mediaType: string;
        mediaUrl: string;
        posterUrl?: string;
        sortOrder: number;
      }>;
      storageUsageBytes: number;
    };
    expect(catalogBody.items.map((i) => i.id)).toEqual(["item-b", "item-a"]);
    expect(catalogBody.items[0]?.title).toBe("Techo tradicional de teja");
    expect(catalogBody.items[0]?.creatorName).toBe("Sofía Méndez");
    expect(catalogBody.items[0]?.mediaType).toBe("IMAGE_STEREO_SBS");
    expect(catalogBody.items[0]?.mediaUrl).toBe(
      "https://pub-test-bucket.r2.dev/rooms/odam/vivienda/b.webp",
    );
    expect(catalogBody.items[1]?.posterUrl).toBe(
      "https://pub-test-bucket.r2.dev/rooms/odam/vivienda/a-poster.webp",
    );
    expect(catalogBody.storageUsageBytes).toBe(2_150_000);

    // DELETE item-a deletes both media_key and poster_key via storageProvider
    const deleteMock = createMockResponse();
    await adminMedia(
      {
        method: "DELETE",
        url: "/api/admin/media?id=item-a",
        headers: { authorization: authHeader },
      },
      deleteMock.res,
    );
    expect(deleteMock.getStatus()).toBe(200);
    expect(storageProvider.deletedKeys).toEqual([
      "rooms/odam/vivienda/a.mp4",
      "rooms/odam/vivienda/a-poster.webp",
    ]);

    const afterDeleteRes = await db.execute("SELECT id FROM room_media_items");
    expect(afterDeleteRes.rows.map((r) => r.id)).toEqual(["item-b"]);
  });

  it("supports posterOnly presign, PATCH posterKey replacement on videos with R2 cleanup, and rejects posterKey on images", async () => {
    const presign = createPresignMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
      generateId: () => "poster-replacement-1",
    });
    const adminMedia = createAdminMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
      now: () => ++clockMs,
    });

    // Seed one video (with existing poster) and one image
    await adminMedia(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          id: "vid-item",
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaKind: "VIDEO_2D",
          title: "Video Ceremonial",
          creatorName: "Autor",
          description: "Descripción.",
          mediaKey: "rooms/wixarika/arte/vid.mp4",
          posterKey: "rooms/wixarika/arte/old-poster.webp",
          mimeType: "video/mp4",
          fileSizeBytes: 5_000_000,
        },
      },
      createMockResponse().res,
    );
    await adminMedia(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          id: "img-item",
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaKind: "IMAGE_2D",
          title: "Fotografía",
          creatorName: "Autor",
          description: "Imagen.",
          mediaKey: "rooms/wixarika/arte/pic.webp",
          mimeType: "image/webp",
          fileSizeBytes: 250_000,
        },
      },
      createMockResponse().res,
    );

    // 1. posterOnly presign
    const posterPresignMock = createMockResponse();
    await presign(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          posterOnly: true,
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          posterMimeType: "image/webp",
          posterSizeBytes: 48_000,
        },
      },
      posterPresignMock.res,
    );
    expect(posterPresignMock.getStatus()).toBe(200);
    const presignBody = posterPresignMock.getBody() as {
      poster?: { key: string; uploadUrl: string };
      media?: unknown;
    };
    expect(presignBody.poster?.key).toBe(
      "rooms/wixarika/arte/poster-replacement-1-poster.webp",
    );
    expect(presignBody.media).toBeUndefined();

    // 2. PATCH image item with posterKey must return 400
    const badImagePatch = createMockResponse();
    await adminMedia(
      {
        method: "PATCH",
        headers: { authorization: authHeader },
        body: {
          id: "img-item",
          posterKey: "rooms/wixarika/arte/poster-replacement-1-poster.webp",
        },
      },
      badImagePatch.res,
    );
    expect(badImagePatch.getStatus()).toBe(400);

    // 3. PATCH video item with valid posterKey updates DB & deletes old poster object in R2
    const videoPatchMock = createMockResponse();
    await adminMedia(
      {
        method: "PATCH",
        headers: { authorization: authHeader },
        body: {
          id: "vid-item",
          posterKey: "rooms/wixarika/arte/poster-replacement-1-poster.webp",
        },
      },
      videoPatchMock.res,
    );
    expect(videoPatchMock.getStatus()).toBe(200);
    const patchBody = videoPatchMock.getBody() as {
      item: { posterKey?: string; posterUrl?: string };
    };
    expect(patchBody.item.posterKey).toBe(
      "rooms/wixarika/arte/poster-replacement-1-poster.webp",
    );
    expect(patchBody.item.posterUrl).toBe(
      `${PUBLIC_BASE_URL}/rooms/wixarika/arte/poster-replacement-1-poster.webp`,
    );
    expect(storageProvider.deletedKeys).toEqual([
      "rooms/wixarika/arte/old-poster.webp",
    ]);
  });

  it("supports authenticated GET /api/admin/media?downloadId=<id> with presigned attachment URL and local fallback", async () => {
    const createPresignedDownload = vi.fn(async (input) => ({
      key: input.objectKey,
      downloadUrl: `https://acct123.r2.cloudflarestorage.com/bucket/${input.objectKey}?response-content-disposition=attachment&X-Amz-Signature=dl123`,
      filename: input.filename,
      expiresInSeconds: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
    }));
    const storageWithDownload: MediaStorageProvider = {
      ...storageProvider,
      createPresignedDownload,
    };
    const adminMedia = createAdminMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageWithDownload,
      resolvePublicBaseUrl: () => PUBLIC_BASE_URL,
      now: () => ++clockMs,
    });

    // Seed item
    await adminMedia(
      {
        method: "POST",
        headers: { authorization: authHeader },
        body: {
          id: "dl-1",
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaKind: "IMAGE_2D",
          title: "Estambre Ceremonial!",
          mediaKey: "rooms/wixarika/arte/dl-1.webp",
          mimeType: "image/webp",
          fileSizeBytes: 120_000,
        },
      },
      createMockResponse().res,
    );

    // Unauthenticated -> 401
    const unauthMock = createMockResponse();
    await adminMedia(
      { method: "GET", url: "/api/admin/media?downloadId=dl-1", headers: {} },
      unauthMock.res,
    );
    expect(unauthMock.getStatus()).toBe(401);

    // Missing -> 404
    const missingMock = createMockResponse();
    await adminMedia(
      {
        method: "GET",
        url: "/api/admin/media?downloadId=missing",
        headers: { authorization: authHeader },
      },
      missingMock.res,
    );
    expect(missingMock.getStatus()).toBe(404);

    // Valid -> 200 with presigned download URL and sanitized filename
    const okMock = createMockResponse();
    await adminMedia(
      {
        method: "GET",
        url: "/api/admin/media?downloadId=dl-1",
        headers: { authorization: authHeader },
      },
      okMock.res,
    );
    expect(okMock.getStatus()).toBe(200);
    expect(okMock.getHeader("cache-control")).toBe("no-store");
    expect(createPresignedDownload).toHaveBeenCalledWith({
      objectKey: "rooms/wixarika/arte/dl-1.webp",
      filename: "estambre-ceremonial.webp",
      expiresInSeconds: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
    });
    expect(okMock.getBody()).toEqual({
      downloadUrl:
        "https://acct123.r2.cloudflarestorage.com/bucket/rooms/wixarika/arte/dl-1.webp?response-content-disposition=attachment&X-Amz-Signature=dl123",
      filename: "estambre-ceremonial.webp",
      expiresInSeconds: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
    });

    // Fallback when storageProvider omits createPresignedDownload
    const fallbackHandler = createAdminMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageProvider,
      resolvePublicBaseUrl: () => PUBLIC_BASE_URL,
    });
    const fallbackMock = createMockResponse();
    await fallbackHandler(
      {
        method: "GET",
        url: "/api/admin/media?downloadId=dl-1",
        headers: { authorization: authHeader },
      },
      fallbackMock.res,
    );
    expect(fallbackMock.getStatus()).toBe(200);
    expect(fallbackMock.getBody()).toMatchObject({
      downloadUrl: `${PUBLIC_BASE_URL}/rooms/wixarika/arte/dl-1.webp`,
      filename: "estambre-ceremonial.webp",
    });
  });
});
