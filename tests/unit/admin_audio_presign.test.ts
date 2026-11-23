import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPresignMediaHandler } from "../../api/admin/media/presign";
import { MEDIA_STORAGE_LIMITS } from "../../api/_media-validation";
import { AUDIO_PRESIGN_ASSET_KIND } from "../../api/_audio-validation";
import type { MediaStorageProvider } from "../../api/_storage";
import { RoomId } from "../../src/shared/room-catalog";

async function applyAllMigrations(client: Client): Promise<void> {
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

function createMockRes() {
  let statusCode = 0;
  let body: unknown = null;
  return {
    res: {
      setHeader: vi.fn(),
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
    getBody: () => body as Record<string, unknown>,
  };
}

describe("POST /api/admin/media/presign (ROOM_AUDIO)", () => {
  let db: Client;
  let storageMock: MediaStorageProvider;
  let presignSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await applyAllMigrations(db);
    presignSpy = vi.fn(async (input) => ({
      uploadUrl: `https://r2.example.com/upload/${input.objectKey}`,
      objectKey: input.objectKey,
      publicUrl: `https://cdn.example.com/${input.objectKey}`,
      expiresAt: 1700000300,
    }));
    storageMock = {
      getProviderId: () => "r2",
      createPresignedUpload: presignSpy as unknown as MediaStorageProvider["createPresignedUpload"],
      deleteObject: vi.fn(async () => {}),
    };
  });

  afterEach(() => {
    db.close();
  });

  it("validates roomId, MIME allowlist, 20 MiB cap, and combined room_media_items + room_audio_tracks 8 GiB quota", async () => {
    // Seed combined usage of 8_575_000_000 bytes (8_000_000_000 media + 575_000_000 audio)
    await db.execute({
      sql: `INSERT INTO room_media_items (
        id, room_id, stand_id, media_kind, title, media_key, mime_type, file_size_bytes, sort_order, created_at, updated_at
      ) VALUES ('m1', 'LOBBY', 'BIENVENIDA', 'IMAGE_2D', 'Img', 'rooms/lobby/bienvenida/m1.webp', 'image/webp', ?, 0, 1, 1)`,
      args: [8_000_000_000],
    });
    await db.execute({
      sql: `INSERT INTO room_audio_tracks (
        id, room_id, title, media_key, mime_type, file_size_bytes, sort_order, created_at, updated_at
      ) VALUES ('a1', 'LOBBY', 'Track 0', 'audio/lobby/a1.m4a', 'audio/mp4', ?, 0, 1, 1)`,
      args: [575_000_000],
    });

    const handler = createPresignMediaHandler({
      resolveDb: () => db,
      resolveStorage: () => storageMock,
      verifyToken: async () => ({ id: 1, username: "admin", role: "admin" }),
      generateId: () => "track-uuid-1",
    });

    // Valid 5,000,000-byte m4a in WIXARIKA -> 200 OK with audio/wixarika/ prefix
    const okRes = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          assetKind: AUDIO_PRESIGN_ASSET_KIND,
          roomId: RoomId.WIXARIKA,
          mimeType: "audio/mp4",
          fileSizeBytes: 5_000_000,
        },
      },
      okRes.res,
    );
    expect(okRes.getStatus()).toBe(200);
    expect(okRes.getBody()).toMatchObject({
      itemId: "track-uuid-1",
      storageProvider: "r2",
      storageUsageBytes: 8_575_000_000,
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
      media: {
        objectKey: "audio/wixarika/track-uuid-1.m4a",
      },
    });

    // Over 20 MiB single audio cap -> 413
    const tooBigAudio = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          assetKind: AUDIO_PRESIGN_ASSET_KIND,
          roomId: RoomId.WIXARIKA,
          mimeType: "audio/mpeg",
          fileSizeBytes: 25_000_000,
        },
      },
      tooBigAudio.res,
    );
    expect(tooBigAudio.getStatus()).toBe(413);

    // 20,000,000 bytes would push 8,575,000,000 + 20,000,000 > 8,589,934,592 -> 413 combined quota
    const quotaBreach = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          assetKind: AUDIO_PRESIGN_ASSET_KIND,
          roomId: RoomId.LOBBY,
          mimeType: "audio/mp4",
          fileSizeBytes: 20_000_000,
        },
      },
      quotaBreach.res,
    );
    expect(quotaBreach.getStatus()).toBe(413);

    // Unsupported MIME (audio/ogg) -> 400
    const badMime = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          assetKind: AUDIO_PRESIGN_ASSET_KIND,
          roomId: RoomId.LOBBY,
          mimeType: "audio/ogg",
          fileSizeBytes: 1000,
        },
      },
      badMime.res,
    );
    expect(badMime.getStatus()).toBe(400);

    // Invalid roomId -> 400
    const badRoom = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          assetKind: AUDIO_PRESIGN_ASSET_KIND,
          roomId: "INVALID_ROOM",
          mimeType: "audio/mp4",
          fileSizeBytes: 1000,
        },
      },
      badRoom.res,
    );
    expect(badRoom.getStatus()).toBe(400);
  });
});
