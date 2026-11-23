import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAudioGetHandler } from "../../api/audio";
import { RoomId } from "../../src/shared/room-catalog";

const PUBLIC_BASE_URL = "https://pub-test-bucket.r2.dev";

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
  const headers = new Map<string, string>();
  return {
    res: {
      setHeader: (k: string, v: string) => {
        headers.set(k.toLowerCase(), v);
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
    getBody: () => body as Record<string, unknown>,
    getHeader: (k: string) => headers.get(k.toLowerCase()),
  };
}

describe("Public Audio API (/api/audio)", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await applyAllMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  function buildHandler() {
    return createAudioGetHandler({
      resolveDb: () => db,
      resolvePublicBaseUrl: () => PUBLIC_BASE_URL,
    });
  }

  it("returns 400 on invalid roomId and 405 on non-GET", async () => {
    const handler = buildHandler();

    const badMethod = createMockRes();
    await handler({ method: "POST", query: { roomId: RoomId.LOBBY } }, badMethod.res);
    expect(badMethod.getStatus()).toBe(405);

    const missingRoom = createMockRes();
    await handler({ method: "GET", query: {} }, missingRoom.res);
    expect(missingRoom.getStatus()).toBe(400);

    const invalidRoom = createMockRes();
    await handler(
      { method: "GET", query: { roomId: "INVALID_ROOM" } },
      invalidRoom.res,
    );
    expect(invalidRoom.getStatus()).toBe(400);
  });

  it("returns empty array + SEQUENTIAL when both requested room and LOBBY are empty", async () => {
    const handler = buildHandler();
    const res = createMockRes();
    await handler({ method: "GET", query: { roomId: RoomId.ODAM } }, res.res);

    expect(res.getStatus()).toBe(200);
    expect(res.getHeader("cache-control")).toBe(
      "public, max-age=30, stale-while-revalidate=120",
    );
    expect(res.getBody()).toEqual({
      roomId: RoomId.ODAM,
      resolvedFromRoomId: RoomId.ODAM,
      playbackMode: "SEQUENTIAL",
      tracks: [],
    });
  });

  it("falls back to LOBBY playlist and LOBBY playbackMode when requested room has no tracks", async () => {
    await db.execute({
      sql: `INSERT INTO room_audio_tracks (
        id, room_id, title, artist_credit, license_note, storage_provider,
        media_key, mime_type, file_size_bytes, duration_ms, sort_order, created_at, updated_at
      ) VALUES ('lob-1', 'LOBBY', 'Tema Lobby', 'Museo Sonora', 'CC0', 'r2', 'audio/lobby/lob-1.m4a', 'audio/mp4', 1000, 90000, 0, 1, 1)`,
    });
    await db.execute({
      sql: `INSERT INTO room_playlist_settings (room_id, playback_mode, updated_at)
            VALUES ('LOBBY', 'SHUFFLE', 1)`,
    });
    // Room-specific setting on empty room should NOT override fallback LOBBY mode
    await db.execute({
      sql: `INSERT INTO room_playlist_settings (room_id, playback_mode, updated_at)
            VALUES ('ODAM', 'SEQUENTIAL', 1)`,
    });

    const handler = buildHandler();
    const res = createMockRes();
    await handler({ method: "GET", query: { roomId: RoomId.ODAM } }, res.res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({
      roomId: RoomId.ODAM,
      resolvedFromRoomId: RoomId.LOBBY,
      playbackMode: "SHUFFLE",
    });
    expect(res.getBody().tracks).toHaveLength(1);
    expect((res.getBody().tracks as Array<{ id: string }>)[0]?.id).toBe("lob-1");
  });

  it("serves requested room tracks and mode when populated without falling back to LOBBY", async () => {
    await db.execute({
      sql: `INSERT INTO room_audio_tracks (
        id, room_id, title, artist_credit, license_note, storage_provider,
        media_key, mime_type, file_size_bytes, duration_ms, sort_order, created_at, updated_at
      ) VALUES
        ('lob-1', 'LOBBY', 'Tema Lobby', '', '', 'r2', 'audio/lobby/lob-1.m4a', 'audio/mp4', 1000, NULL, 0, 1, 1),
        ('naa-1', 'NAAYERI', 'Sones Sierra', 'Comunidad', 'CC BY', 'r2', 'audio/naayeri/naa-1.m4a', 'audio/mp4', 2000, 120000, 0, 2, 2)`,
    });

    const handler = buildHandler();
    const res = createMockRes();
    await handler({ method: "GET", query: { roomId: RoomId.NAAYERI } }, res.res);

    expect(res.getStatus()).toBe(200);
    expect(res.getBody()).toMatchObject({
      roomId: RoomId.NAAYERI,
      resolvedFromRoomId: RoomId.NAAYERI,
      playbackMode: "SEQUENTIAL",
    });
    expect(res.getBody().tracks).toHaveLength(1);
    expect((res.getBody().tracks as Array<{ id: string }>)[0]?.id).toBe("naa-1");
  });
});
