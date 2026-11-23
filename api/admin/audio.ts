import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { verifyAdminBearerToken, type AdminTokenClaims } from "../_auth.js";
import { getDb } from "../_db.js";
import {
  API_HTTP_STATUS,
  extractQueryParam,
  parseJsonObjectBody,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";
import {
  MEDIA_STORAGE_LIMITS,
  validateQuotaCapacity,
} from "../_media-validation.js";
import {
  fetchCombinedStorageUsageBytes,
  fetchRoomAudioTracks,
  fetchRoomPlaybackMode,
  serializeAudioTrackRow,
  validateAudioPlaybackModeUpdate,
  validateAudioReorderPatch,
  validateAudioTrackCreate,
  validateAudioTrackMetadataPatch,
  type AudioTrackRow,
} from "../_audio-validation.js";
import {
  createMediaStorageProviderFromEnv,
  type MediaStorageProvider,
} from "../_storage.js";
import { isValidRoomId } from "../../src/shared/room-catalog.js";

export interface AdminAudioHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly resolveStorage?: () => MediaStorageProvider;
  readonly verifyToken?: (
    headers?: Record<string, string | string[] | undefined>,
  ) => Promise<AdminTokenClaims | null>;
  readonly resolvePublicBaseUrl?: () => string | undefined;
  readonly now?: () => number;
  readonly generateId?: () => string;
}

const MAX_TRACK_ID_LENGTH = 64;
const ADMIN_AUDIO_CACHE_HEADER = "no-store";

function resolveTrackId(
  rawId: unknown,
  generateId: () => string,
): string | null {
  if (rawId === undefined || rawId === null || rawId === "") {
    return generateId();
  }
  if (typeof rawId !== "string") {
    return null;
  }
  const trimmed = rawId.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_TRACK_ID_LENGTH ||
    /[\s/\\]/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function createAdminAudioHandler(deps: AdminAudioHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const resolveStorage =
    deps.resolveStorage ?? (() => createMediaStorageProviderFromEnv());
  const verifyToken = deps.verifyToken ?? ((h) => verifyAdminBearerToken(h));
  const resolvePublicBaseUrl =
    deps.resolvePublicBaseUrl ?? (() => process.env.MEDIA_PUBLIC_BASE_URL);
  const now = deps.now ?? (() => Date.now());
  const generateId = deps.generateId ?? (() => randomUUID());

  async function handleGet(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const roomId = extractQueryParam(req, "roomId");
    if (!roomId || !isValidRoomId(roomId)) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Valid roomId query parameter is required." });
      return;
    }

    const db = resolveDb();
    const baseUrl = resolvePublicBaseUrl();
    const [tracks, playbackMode, storageUsageBytes] = await Promise.all([
      fetchRoomAudioTracks(db, roomId, baseUrl),
      fetchRoomPlaybackMode(db, roomId),
      fetchCombinedStorageUsageBytes(db),
    ]);

    res.status(API_HTTP_STATUS.OK).json({
      roomId,
      playbackMode,
      tracks,
      storageUsageBytes,
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
    });
  }

  async function handlePost(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Invalid JSON body." });
      return;
    }

    const id = resolveTrackId(body.id, generateId);
    if (!id) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Invalid track id." });
      return;
    }

    const validated = validateAudioTrackCreate(body);
    if (!validated.ok) {
      res.status(validated.status).json({ error: validated.error });
      return;
    }

    const db = resolveDb();
    const currentUsage = await fetchCombinedStorageUsageBytes(db);
    const quota = validateQuotaCapacity(
      currentUsage,
      validated.value.fileSizeBytes,
    );
    if (!quota.ok) {
      res.status(quota.status).json({ error: quota.error });
      return;
    }

    const sortRes = await db.execute({
      sql: "SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM room_audio_tracks WHERE room_id = ?",
      args: [validated.value.roomId],
    });
    const nextOrder = Number(sortRes.rows[0]?.nextOrder ?? 0);
    const timestamp = now();
    const storageProvider = resolveStorage().getProviderId();

    await db.execute({
      sql: `INSERT INTO room_audio_tracks (
        id, room_id, title, artist_credit, license_note, storage_provider,
        media_key, mime_type, file_size_bytes, duration_ms, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        validated.value.roomId,
        validated.value.title,
        validated.value.artistCredit,
        validated.value.licenseNote,
        storageProvider,
        validated.value.mediaKey,
        validated.value.mimeType,
        validated.value.fileSizeBytes,
        validated.value.durationMs,
        nextOrder,
        timestamp,
        timestamp,
      ],
    });

    const row: AudioTrackRow = {
      id,
      room_id: validated.value.roomId,
      title: validated.value.title,
      artist_credit: validated.value.artistCredit,
      license_note: validated.value.licenseNote,
      storage_provider: storageProvider,
      media_key: validated.value.mediaKey,
      mime_type: validated.value.mimeType,
      file_size_bytes: validated.value.fileSizeBytes,
      duration_ms: validated.value.durationMs,
      sort_order: nextOrder,
      created_at: timestamp,
      updated_at: timestamp,
    };

    const storageUsageBytes = await fetchCombinedStorageUsageBytes(db);
    res.status(API_HTTP_STATUS.CREATED).json({
      track: serializeAudioTrackRow(row, resolvePublicBaseUrl()),
      storageUsageBytes,
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
    });
  }

  async function handleReorderPatch(
    body: Record<string, unknown>,
    res: ServerlessResponse,
  ): Promise<void> {
    const validated = validateAudioReorderPatch(body);
    if (!validated.ok) {
      res.status(validated.status).json({ error: validated.error });
      return;
    }

    const db = resolveDb();
    const existingRes = await db.execute({
      sql: "SELECT id FROM room_audio_tracks WHERE room_id = ?",
      args: [validated.value.roomId],
    });
    const existingIds = new Set(existingRes.rows.map((r) => String(r.id)));
    const { orderedIds, roomId } = validated.value;

    if (
      existingIds.size !== orderedIds.length ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "orderedIds must exactly match all tracks in the target room.",
      });
      return;
    }

    const timestamp = now();
    await db.batch(
      orderedIds.map((trackId, index) => ({
        sql: "UPDATE room_audio_tracks SET sort_order = ?, updated_at = ? WHERE id = ? AND room_id = ?",
        args: [index, timestamp, trackId, roomId],
      })),
      "write",
    );

    const tracks = await fetchRoomAudioTracks(
      db,
      roomId,
      resolvePublicBaseUrl(),
    );
    res.status(API_HTTP_STATUS.OK).json({ roomId, tracks });
  }

  async function handleMetadataPatch(
    body: Record<string, unknown>,
    res: ServerlessResponse,
  ): Promise<void> {
    const validated = validateAudioTrackMetadataPatch(body);
    if (!validated.ok) {
      res.status(validated.status).json({ error: validated.error });
      return;
    }

    const db = resolveDb();
    const existing = await db.execute({
      sql: "SELECT id FROM room_audio_tracks WHERE id = ?",
      args: [validated.value.id],
    });
    if (existing.rows.length === 0) {
      res
        .status(API_HTTP_STATUS.NOT_FOUND)
        .json({ error: "Audio track not found." });
      return;
    }

    const assignments: string[] = [];
    const args: Array<string | number> = [];
    if (validated.value.title !== undefined) {
      assignments.push("title = ?");
      args.push(validated.value.title);
    }
    if (validated.value.artistCredit !== undefined) {
      assignments.push("artist_credit = ?");
      args.push(validated.value.artistCredit);
    }
    if (validated.value.licenseNote !== undefined) {
      assignments.push("license_note = ?");
      args.push(validated.value.licenseNote);
    }
    assignments.push("updated_at = ?");
    args.push(now());
    args.push(validated.value.id);

    await db.execute({
      sql: `UPDATE room_audio_tracks SET ${assignments.join(", ")} WHERE id = ?`,
      args,
    });

    const updatedRes = await db.execute({
      sql: `SELECT id, room_id, title, artist_credit, license_note, storage_provider,
              media_key, mime_type, file_size_bytes, duration_ms, sort_order, created_at, updated_at
            FROM room_audio_tracks WHERE id = ?`,
      args: [validated.value.id],
    });
    const row = updatedRes.rows[0] as unknown as AudioTrackRow;
    res.status(API_HTTP_STATUS.OK).json({
      track: serializeAudioTrackRow(row, resolvePublicBaseUrl()),
    });
  }

  async function handlePatch(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Invalid JSON body." });
      return;
    }

    if ("orderedIds" in body) {
      await handleReorderPatch(body, res);
      return;
    }
    await handleMetadataPatch(body, res);
  }

  async function handleDelete(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const queryId = extractQueryParam(req, "id");
    const bodyObj = !queryId ? parseJsonObjectBody(req.body) : null;
    const id =
      queryId ?? (typeof bodyObj?.id === "string" ? bodyObj.id.trim() : "");

    if (!id) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Missing track id." });
      return;
    }

    const db = resolveDb();
    const rowRes = await db.execute({
      sql: "SELECT media_key FROM room_audio_tracks WHERE id = ?",
      args: [id],
    });
    if (rowRes.rows.length === 0) {
      res
        .status(API_HTTP_STATUS.NOT_FOUND)
        .json({ error: "Audio track not found." });
      return;
    }

    const mediaKey = String(rowRes.rows[0]?.media_key ?? "");
    if (mediaKey) {
      await resolveStorage().deleteObject(mediaKey);
    }

    await db.execute({
      sql: "DELETE FROM room_audio_tracks WHERE id = ?",
      args: [id],
    });

    const storageUsageBytes = await fetchCombinedStorageUsageBytes(db);
    res.status(API_HTTP_STATUS.OK).json({
      ok: true,
      id,
      storageUsageBytes,
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
    });
  }

  async function handlePut(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Invalid JSON body." });
      return;
    }

    const validated = validateAudioPlaybackModeUpdate(body);
    if (!validated.ok) {
      res.status(validated.status).json({ error: validated.error });
      return;
    }

    const db = resolveDb();
    await db.execute({
      sql: `INSERT INTO room_playlist_settings (room_id, playback_mode, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(room_id) DO UPDATE SET
              playback_mode = excluded.playback_mode,
              updated_at = excluded.updated_at`,
      args: [validated.value.roomId, validated.value.playbackMode, now()],
    });

    res.status(API_HTTP_STATUS.OK).json({
      roomId: validated.value.roomId,
      playbackMode: validated.value.playbackMode,
    });
  }

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    res.setHeader?.("Cache-Control", ADMIN_AUDIO_CACHE_HEADER);

    const claims = await verifyToken(req.headers);
    if (!claims) {
      res.status(API_HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized." });
      return;
    }

    try {
      switch (req.method) {
        case "GET":
          await handleGet(req, res);
          return;
        case "POST":
          await handlePost(req, res);
          return;
        case "PATCH":
          await handlePatch(req, res);
          return;
        case "DELETE":
          await handleDelete(req, res);
          return;
        case "PUT":
          await handlePut(req, res);
          return;
        default:
          res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
            error: "Method not allowed.",
          });
      }
    } catch (error) {
      console.error("[/api/admin/audio] Error:", error);
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Failed to process audio request.",
      });
    }
  };
}

export default createAdminAudioHandler();
