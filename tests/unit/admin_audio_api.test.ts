import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminAudioHandler } from "../../api/admin/audio";
import { MEDIA_STORAGE_LIMITS } from "../../api/_media-validation";
import type { MediaStorageProvider } from "../../api/_storage";
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

describe("Admin Audio API (/api/admin/audio)", () => {
  let db: Client;
  let storageMock: MediaStorageProvider;
  let deleteSpy: ReturnType<typeof vi.fn>;
  let clockMs: number;
  let seqId: number;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await applyAllMigrations(db);
    clockMs = 1_700_000_000_000;
    seqId = 0;
    deleteSpy = vi.fn(async () => {});
    storageMock = {
      getProviderId: () => "r2",
      createPresignedUpload: vi.fn(),
      deleteObject: deleteSpy as unknown as MediaStorageProvider["deleteObject"],
    };
  });

  afterEach(() => {
    db.close();
  });

  function buildHandler(authed = true) {
    return createAdminAudioHandler({
      resolveDb: () => db,
      resolveStorage: () => storageMock,
      verifyToken: async () =>
        authed ? { id: 1, username: "admin", role: "admin" } : null,
      resolvePublicBaseUrl: () => PUBLIC_BASE_URL,
      now: () => ++clockMs,
      generateId: () => `t${++seqId}`,
    });
  }

  it("rejects unauthenticated requests with 401 and lists/creates tracks with combined quota and key validation", async () => {
    const unauthHandler = buildHandler(false);
    const unauthRes = createMockRes();
    await unauthHandler(
      { method: "GET", headers: {}, query: { roomId: RoomId.NAAYERI } },
      unauthRes.res,
    );
    expect(unauthRes.getStatus()).toBe(401);

    const handler = buildHandler(true);

    // Rejects unsafe mediaKey targeting another room
    const unsafeRes = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          roomId: RoomId.NAAYERI,
          title: "Canto",
          mediaKey: "audio/lobby/wrong.m4a",
          mimeType: "audio/mp4",
          fileSizeBytes: 1000,
        },
      },
      unsafeRes.res,
    );
    expect(unsafeRes.getStatus()).toBe(400);

    // Creates two tracks sequentially (sortOrder 0, 1)
    const create1 = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          id: "t1",
          roomId: RoomId.NAAYERI,
          title: "Sones de la Sierra",
          artistCredit: "Colectivo Náayeri",
          licenseNote: "Consentimiento comunitario 2026",
          mediaKey: "audio/naayeri/t1.m4a",
          mimeType: "audio/mp4",
          fileSizeBytes: 2_000_000,
          durationMs: 124_000,
        },
      },
      create1.res,
    );
    expect(create1.getStatus()).toBe(201);
    expect(create1.getBody().track).toMatchObject({
      id: "t1",
      roomId: RoomId.NAAYERI,
      title: "Sones de la Sierra",
      artistCredit: "Colectivo Náayeri",
      licenseNote: "Consentimiento comunitario 2026",
      mediaUrl: `${PUBLIC_BASE_URL}/audio/naayeri/t1.m4a`,
      durationMs: 124_000,
      sortOrder: 0,
    });

    const create2 = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          id: "t2",
          roomId: RoomId.NAAYERI,
          title: "Flauta del Cañón",
          mediaKey: "audio/naayeri/t2.mp3",
          mimeType: "audio/mpeg",
          fileSizeBytes: 1_500_000,
        },
      },
      create2.res,
    );
    expect(create2.getStatus()).toBe(201);
    expect(create2.getBody().track).toMatchObject({
      id: "t2",
      sortOrder: 1,
    });

    // Combined quota breach against existing room_media_items -> 413
    await db.execute({
      sql: `INSERT INTO room_media_items (
        id, room_id, stand_id, media_kind, title, media_key, mime_type, file_size_bytes, sort_order, created_at, updated_at
      ) VALUES ('m-big', 'LOBBY', 'BIENVENIDA', 'IMAGE_2D', 'Big', 'rooms/lobby/bienvenida/m-big.webp', 'image/webp', ?, 0, 1, 1)`,
      args: [MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES - 3_600_000],
    });
    const overQuota = createMockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: {
          roomId: RoomId.NAAYERI,
          title: "Too large for remaining quota",
          mediaKey: "audio/naayeri/t3.m4a",
          mimeType: "audio/mp4",
          fileSizeBytes: 500_000,
        },
      },
      overQuota.res,
    );
    expect(overQuota.getStatus()).toBe(413);

    // GET lists NAAYERI tracks sorted and defaults playbackMode to SEQUENTIAL
    const listRes = createMockRes();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer token" },
        query: { roomId: RoomId.NAAYERI },
      },
      listRes.res,
    );
    expect(listRes.getStatus()).toBe(200);
    expect(listRes.getBody()).toMatchObject({
      roomId: RoomId.NAAYERI,
      playbackMode: "SEQUENTIAL",
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
    });
    const tracks = listRes.getBody().tracks as Array<{ id: string }>;
    expect(tracks.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("supports PATCH atomic reorder + metadata edits and DELETE removing R2 object before SQL row", async () => {
    const handler = buildHandler(true);

    for (const [id, title, key] of [
      ["t1", "Pista Uno", "audio/wixarika/t1.m4a"],
      ["t2", "Pista Dos", "audio/wixarika/t2.m4a"],
      ["t3", "Pista Tres", "audio/wixarika/t3.m4a"],
    ]) {
      const created = createMockRes();
      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer token" },
          body: {
            id,
            roomId: RoomId.WIXARIKA,
            title,
            mediaKey: key,
            mimeType: "audio/mp4",
            fileSizeBytes: 1_000_000,
          },
        },
        created.res,
      );
      expect(created.getStatus()).toBe(201);
    }

    // Reject incomplete reorder set -> 400
    const badReorder = createMockRes();
    await handler(
      {
        method: "PATCH",
        headers: { authorization: "Bearer token" },
        body: { roomId: RoomId.WIXARIKA, orderedIds: ["t3", "t1"] },
      },
      badReorder.res,
    );
    expect(badReorder.getStatus()).toBe(400);

    // Valid atomic reorder
    const reorderRes = createMockRes();
    await handler(
      {
        method: "PATCH",
        headers: { authorization: "Bearer token" },
        body: { roomId: RoomId.WIXARIKA, orderedIds: ["t3", "t1", "t2"] },
      },
      reorderRes.res,
    );
    expect(reorderRes.getStatus()).toBe(200);
    expect(
      (reorderRes.getBody().tracks as Array<{ id: string; sortOrder: number }>).map(
        (t) => [t.id, t.sortOrder],
      ),
    ).toEqual([
      ["t3", 0],
      ["t1", 1],
      ["t2", 2],
    ]);

    // Metadata update
    const metaRes = createMockRes();
    await handler(
      {
        method: "PATCH",
        headers: { authorization: "Bearer token" },
        body: {
          id: "t1",
          title: "Venado Azul",
          artistCredit: "Músicos Wirrárika",
          licenseNote: "CC BY 4.0",
        },
      },
      metaRes.res,
    );
    expect(metaRes.getStatus()).toBe(200);
    expect(metaRes.getBody().track).toMatchObject({
      id: "t1",
      title: "Venado Azul",
      artistCredit: "Músicos Wirrárika",
      licenseNote: "CC BY 4.0",
    });

    // Delete t1 invokes R2 deleteObject before removing DB row
    const callOrder: string[] = [];
    deleteSpy.mockImplementationOnce(async () => {
      const check = await db.execute({
        sql: "SELECT id FROM room_audio_tracks WHERE id = 't1'",
      });
      expect(check.rows.length).toBe(1);
      callOrder.push("r2-delete");
    });

    const delRes = createMockRes();
    await handler(
      {
        method: "DELETE",
        headers: { authorization: "Bearer token" },
        query: { id: "t1" },
      },
      delRes.res,
    );
    expect(delRes.getStatus()).toBe(200);
    expect(callOrder).toEqual(["r2-delete"]);
    expect(deleteSpy).toHaveBeenCalledWith("audio/wixarika/t1.m4a");
    expect(delRes.getBody()).toMatchObject({
      ok: true,
      id: "t1",
      storageUsageBytes: 2_000_000,
    });

    const listAfterDelete = createMockRes();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer token" },
        query: { roomId: RoomId.WIXARIKA },
      },
      listAfterDelete.res,
    );
    expect(
      (listAfterDelete.getBody().tracks as Array<{ id: string }>).map(
        (t) => t.id,
      ),
    ).toEqual(["t3", "t2"]);
  });

  it("persists per-room playbackMode via PUT and validates SEQUENTIAL/SHUFFLE", async () => {
    const handler = buildHandler(true);

    const invalidPut = createMockRes();
    await handler(
      {
        method: "PUT",
        headers: { authorization: "Bearer token" },
        body: { roomId: RoomId.ODAM, playbackMode: "LOOP" },
      },
      invalidPut.res,
    );
    expect(invalidPut.getStatus()).toBe(400);

    const putShuffle = createMockRes();
    await handler(
      {
        method: "PUT",
        headers: { authorization: "Bearer token" },
        body: { roomId: RoomId.ODAM, playbackMode: "SHUFFLE" },
      },
      putShuffle.res,
    );
    expect(putShuffle.getStatus()).toBe(200);
    expect(putShuffle.getBody()).toMatchObject({
      roomId: RoomId.ODAM,
      playbackMode: "SHUFFLE",
    });

    const getRes = createMockRes();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer token" },
        query: { roomId: RoomId.ODAM },
      },
      getRes.res,
    );
    expect(getRes.getStatus()).toBe(200);
    expect(getRes.getBody().playbackMode).toBe("SHUFFLE");
  });
});
