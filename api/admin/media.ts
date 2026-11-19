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
  isStandMediaKind,
  isVideoMediaKind,
  MEDIA_STORAGE_LIMITS,
  validateMediaRecordCreate,
  validateQuotaCapacity,
} from "../_media-validation.js";
import {
  createMediaStorageProviderFromEnv,
  type MediaStorageProvider,
} from "../_storage.js";
import { isValidRoomStand } from "../../src/shared/room-catalog.js";
import { serializeMediaRow, type MediaCatalogRow } from "../media.js";

export interface AdminMediaHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly resolveStorage?: () => MediaStorageProvider;
  readonly verifyToken?: (
    headers?: Record<string, string | string[] | undefined>,
  ) => Promise<AdminTokenClaims | null>;
  readonly resolvePublicBaseUrl?: () => string | undefined;
  readonly now?: () => number;
  readonly generateId?: () => string;
}

const MAX_ITEM_ID_LENGTH = 64;

function resolveRecordId(
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
    trimmed.length > MAX_ITEM_ID_LENGTH ||
    /[\s/\\]/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

async function fetchStorageUsageBytes(db: Client): Promise<number> {
  const usageRes = await db.execute(
    "SELECT COALESCE(SUM(file_size_bytes), 0) AS usedBytes FROM room_media_items",
  );
  return Number(usageRes.rows[0]?.usedBytes ?? 0);
}

export function createAdminMediaHandler(deps: AdminMediaHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const resolveStorage =
    deps.resolveStorage ?? (() => createMediaStorageProviderFromEnv());
  const verifyToken = deps.verifyToken ?? ((h) => verifyAdminBearerToken(h));
  const resolvePublicBaseUrl =
    deps.resolvePublicBaseUrl ?? (() => process.env.MEDIA_PUBLIC_BASE_URL);
  const now = deps.now ?? (() => Date.now());
  const generateId = deps.generateId ?? (() => randomUUID());

  async function handleGet(res: ServerlessResponse): Promise<void> {
    const db = resolveDb();
    const rowsRes = await db.execute(
      `SELECT
         id, room_id, stand_id, media_kind, title, creator_name, description,
         storage_provider, media_key, poster_key, mime_type, file_size_bytes,
         width, height, sort_order, created_at, updated_at
       FROM room_media_items
       ORDER BY room_id ASC, stand_id ASC, sort_order ASC, created_at ASC`,
    );
    const baseUrl = resolvePublicBaseUrl();
    let storageUsageBytes = 0;
    const items = rowsRes.rows.map((raw) => {
      const row = raw as unknown as MediaCatalogRow;
      storageUsageBytes += Number(row.file_size_bytes ?? 0);
      return serializeMediaRow(row, baseUrl);
    });

    res.setHeader?.("Cache-Control", "no-store");
    res.status(API_HTTP_STATUS.OK).json({
      items,
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
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Request body must be a JSON object.",
      });
      return;
    }

    const id = resolveRecordId(body.id, generateId);
    if (!id) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Invalid item id." });
      return;
    }

    const validation = validateMediaRecordCreate({
      roomId: body.roomId,
      standId: body.standId,
      mediaKind: body.mediaKind,
      title: body.title,
      creatorName: body.creatorName,
      description: body.description,
      mediaKey: body.mediaKey,
      posterKey: body.posterKey,
      mimeType: body.mimeType,
      fileSizeBytes: body.fileSizeBytes,
      width: body.width,
      height: body.height,
    });

    if (!validation.ok) {
      res.status(validation.status).json({ error: validation.error });
      return;
    }

    const v = validation.value;
    const db = resolveDb();
    const currentUsage = await fetchStorageUsageBytes(db);
    const quota = validateQuotaCapacity(currentUsage, v.fileSizeBytes);
    if (!quota.ok) {
      res.status(quota.status).json({ error: quota.error });
      return;
    }

    const nextOrderRes = await db.execute({
      sql: `SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder
            FROM room_media_items
            WHERE room_id = ? AND stand_id = ?`,
      args: [v.roomId, v.standId],
    });
    const sortOrder =
      typeof body.sortOrder === "number" &&
      Number.isInteger(body.sortOrder) &&
      body.sortOrder >= 0
        ? body.sortOrder
        : Number(nextOrderRes.rows[0]?.nextOrder ?? 0);

    const timestampMs = now();
    const storageProvider = resolveStorage().getProviderId();

    await db.execute({
      sql: `INSERT INTO room_media_items (
              id, room_id, stand_id, media_kind, title, creator_name, description,
              storage_provider, media_key, poster_key, mime_type, file_size_bytes,
              width, height, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        v.roomId,
        v.standId,
        v.mediaKind,
        v.title,
        v.creatorName,
        v.description,
        storageProvider,
        v.mediaKey,
        v.posterKey,
        v.mimeType,
        v.fileSizeBytes,
        v.width,
        v.height,
        sortOrder,
        timestampMs,
        timestampMs,
      ],
    });

    const createdRow: MediaCatalogRow = {
      id,
      room_id: v.roomId,
      stand_id: v.standId,
      media_kind: v.mediaKind,
      title: v.title,
      creator_name: v.creatorName,
      description: v.description,
      storage_provider: storageProvider,
      media_key: v.mediaKey,
      poster_key: v.posterKey,
      mime_type: v.mimeType,
      file_size_bytes: v.fileSizeBytes,
      width: v.width,
      height: v.height,
      sort_order: sortOrder,
      created_at: timestampMs,
      updated_at: timestampMs,
    };

    res.status(API_HTTP_STATUS.CREATED).json({
      item: serializeMediaRow(createdRow, resolvePublicBaseUrl()),
      storageUsageBytes: currentUsage + v.fileSizeBytes,
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
    });
  }

  async function handlePatch(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Request body must be a JSON object.",
      });
      return;
    }

    const db = resolveDb();
    const timestampMs = now();

    // Mode A: Atomic stand reorder via orderedIds[]
    if (Array.isArray(body.orderedIds)) {
      if (
        typeof body.roomId !== "string" ||
        typeof body.standId !== "string" ||
        !isValidRoomStand(body.roomId, body.standId)
      ) {
        res.status(API_HTTP_STATUS.BAD_REQUEST).json({
          error: "Invalid roomId and standId for reorder.",
        });
        return;
      }

      const orderedIds: string[] = [];
      const seen = new Set<string>();
      for (const rawId of body.orderedIds) {
        if (
          typeof rawId !== "string" ||
          rawId.trim().length === 0 ||
          seen.has(rawId.trim())
        ) {
          res.status(API_HTTP_STATUS.BAD_REQUEST).json({
            error: "orderedIds must contain unique non-empty strings.",
          });
          return;
        }
        seen.add(rawId.trim());
        orderedIds.push(rawId.trim());
      }

      const statements = orderedIds.map((itemId, index) => ({
        sql: `UPDATE room_media_items
              SET sort_order = ?, updated_at = ?
              WHERE id = ? AND room_id = ? AND stand_id = ?`,
        args: [
          index,
          timestampMs,
          itemId,
          body.roomId as string,
          body.standId as string,
        ],
      }));

      if (statements.length > 0) {
        await db.batch(statements, "write");
      }

      res.status(API_HTTP_STATUS.OK).json({ ok: true, orderedIds });
      return;
    }

    // Mode B: Single-item metadata edit
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      res
        .status(API_HTTP_STATUS.BAD_REQUEST)
        .json({ error: "Missing item id." });
      return;
    }

    const existingRes = await db.execute({
      sql: `SELECT
              id, room_id, stand_id, media_kind, title, creator_name, description,
              storage_provider, media_key, poster_key, mime_type, file_size_bytes,
              width, height, sort_order, created_at, updated_at
            FROM room_media_items
            WHERE id = ?`,
      args: [id],
    });

    if (existingRes.rows.length === 0) {
      res
        .status(API_HTTP_STATUS.NOT_FOUND)
        .json({ error: "Media item not found." });
      return;
    }

    const existing = existingRes.rows[0] as unknown as MediaCatalogRow;

    let title = existing.title;
    if (body.title !== undefined) {
      if (typeof body.title !== "string") {
        res
          .status(API_HTTP_STATUS.BAD_REQUEST)
          .json({ error: "Invalid title." });
        return;
      }
      const trimmedTitle = body.title.trim();
      if (
        trimmedTitle.length === 0 ||
        trimmedTitle.length > MEDIA_STORAGE_LIMITS.MAX_TITLE_LENGTH
      ) {
        res.status(API_HTTP_STATUS.BAD_REQUEST).json({
          error: `Title must be between 1 and ${MEDIA_STORAGE_LIMITS.MAX_TITLE_LENGTH} characters.`,
        });
        return;
      }
      title = trimmedTitle;
    }

    let creatorName = existing.creator_name;
    if (body.creatorName !== undefined) {
      if (typeof body.creatorName !== "string") {
        res
          .status(API_HTTP_STATUS.BAD_REQUEST)
          .json({ error: "Invalid creatorName." });
        return;
      }
      const trimmedCreator = body.creatorName.trim();
      if (trimmedCreator.length > MEDIA_STORAGE_LIMITS.MAX_CREATOR_LENGTH) {
        res.status(API_HTTP_STATUS.BAD_REQUEST).json({
          error: `creatorName exceeds ${MEDIA_STORAGE_LIMITS.MAX_CREATOR_LENGTH} characters.`,
        });
        return;
      }
      creatorName = trimmedCreator;
    }

    let description = existing.description;
    if (body.description !== undefined) {
      if (typeof body.description !== "string") {
        res
          .status(API_HTTP_STATUS.BAD_REQUEST)
          .json({ error: "Invalid description." });
        return;
      }
      const trimmedDesc = body.description.trim();
      if (trimmedDesc.length > MEDIA_STORAGE_LIMITS.MAX_DESCRIPTION_LENGTH) {
        res.status(API_HTTP_STATUS.BAD_REQUEST).json({
          error: `description exceeds ${MEDIA_STORAGE_LIMITS.MAX_DESCRIPTION_LENGTH} characters.`,
        });
        return;
      }
      description = trimmedDesc;
    }

    let mediaKind = existing.media_kind;
    if (body.mediaKind !== undefined) {
      if (!isStandMediaKind(body.mediaKind)) {
        res
          .status(API_HTTP_STATUS.BAD_REQUEST)
          .json({ error: "Invalid mediaKind." });
        return;
      }
      const wasVideo = isStandMediaKind(existing.media_kind)
        ? isVideoMediaKind(existing.media_kind)
        : false;
      if (wasVideo !== isVideoMediaKind(body.mediaKind)) {
        res.status(API_HTTP_STATUS.BAD_REQUEST).json({
          error: "Cannot convert between image and video mediaKind.",
        });
        return;
      }
      mediaKind = body.mediaKind;
    }

    await db.execute({
      sql: `UPDATE room_media_items
            SET title = ?, creator_name = ?, description = ?, media_kind = ?, updated_at = ?
            WHERE id = ?`,
      args: [title, creatorName, description, mediaKind, timestampMs, id],
    });

    const updatedRow: MediaCatalogRow = {
      ...existing,
      title,
      creator_name: creatorName,
      description,
      media_kind: mediaKind,
      updated_at: timestampMs,
    };

    res.status(API_HTTP_STATUS.OK).json({
      item: serializeMediaRow(updatedRow, resolvePublicBaseUrl()),
    });
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
        .json({ error: "Missing item id." });
      return;
    }

    const db = resolveDb();
    const rowRes = await db.execute({
      sql: "SELECT media_key, poster_key FROM room_media_items WHERE id = ?",
      args: [id],
    });

    if (rowRes.rows.length === 0) {
      res
        .status(API_HTTP_STATUS.NOT_FOUND)
        .json({ error: "Media item not found." });
      return;
    }

    const mediaKey = String(rowRes.rows[0]?.media_key ?? "");
    const posterKey = rowRes.rows[0]?.poster_key
      ? String(rowRes.rows[0].poster_key)
      : null;

    const storage = resolveStorage();
    if (mediaKey) {
      await storage.deleteObject(mediaKey);
    }
    if (posterKey) {
      await storage.deleteObject(posterKey);
    }

    await db.execute({
      sql: "DELETE FROM room_media_items WHERE id = ?",
      args: [id],
    });

    const storageUsageBytes = await fetchStorageUsageBytes(db);
    res.status(API_HTTP_STATUS.OK).json({
      ok: true,
      id,
      storageUsageBytes,
      maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
    });
  }

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    const claims = await verifyToken(req.headers);
    if (!claims) {
      res.status(API_HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized." });
      return;
    }

    try {
      switch (req.method) {
        case "GET":
          await handleGet(res);
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
        default:
          res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
            error: "Method not allowed.",
          });
      }
    } catch (error) {
      console.error("[/api/admin/media] Error:", error);
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Failed to process media request.",
      });
    }
  };
}

export default createAdminMediaHandler();
