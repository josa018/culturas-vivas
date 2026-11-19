import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { verifyAdminBearerToken, type AdminTokenClaims } from "../../_auth.js";
import { getDb } from "../../_db.js";
import {
  API_HTTP_STATUS,
  parseJsonObjectBody,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../../_http.js";
import {
  MEDIA_STORAGE_LIMITS,
  MIME_TO_EXTENSION,
  validatePresignRequest,
  validateQuotaCapacity,
} from "../../_media-validation.js";
import {
  createMediaStorageProviderFromEnv,
  type MediaStorageProvider,
} from "../../_storage.js";

export interface PresignMediaHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly resolveStorage?: () => MediaStorageProvider;
  readonly verifyToken?: (
    headers?: Record<string, string | string[] | undefined>,
  ) => Promise<AdminTokenClaims | null>;
  readonly generateId?: () => string;
}

export function createPresignMediaHandler(deps: PresignMediaHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const resolveStorage =
    deps.resolveStorage ?? (() => createMediaStorageProviderFromEnv());
  const verifyToken = deps.verifyToken ?? ((h) => verifyAdminBearerToken(h));
  const generateId = deps.generateId ?? (() => randomUUID());

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    if (req.method !== "POST") {
      res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: "Method not allowed. Use POST.",
      });
      return;
    }

    const claims = await verifyToken(req.headers);
    if (!claims) {
      res.status(API_HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized." });
      return;
    }

    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Request body must be a JSON object.",
      });
      return;
    }

    const validation = validatePresignRequest({
      roomId: body.roomId,
      standId: body.standId,
      mediaKind: body.mediaKind,
      mimeType: body.mimeType,
      fileSizeBytes: body.fileSizeBytes,
      posterMimeType: body.posterMimeType,
      posterSizeBytes: body.posterSizeBytes,
    });

    if (!validation.ok) {
      res.status(validation.status).json({ error: validation.error });
      return;
    }

    const validated = validation.value;

    try {
      const db = resolveDb();
      const usageRes = await db.execute(
        "SELECT COALESCE(SUM(file_size_bytes), 0) AS usedBytes FROM room_media_items",
      );
      const storageUsageBytes = Number(usageRes.rows[0]?.usedBytes ?? 0);
      const totalIncomingBytes =
        validated.fileSizeBytes + (validated.posterSizeBytes ?? 0);

      const quotaCheck = validateQuotaCapacity(
        storageUsageBytes,
        totalIncomingBytes,
      );
      if (!quotaCheck.ok) {
        res.status(quotaCheck.status).json({
          error: quotaCheck.error,
          storageUsageBytes,
          maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
        });
        return;
      }

      const storage = resolveStorage();
      const itemId = generateId();
      const roomSegment = validated.roomId.toLowerCase();
      const standSegment = validated.standId.toLowerCase();
      const mediaExt = MIME_TO_EXTENSION[validated.mimeType] ?? "bin";
      const mediaKey = `rooms/${roomSegment}/${standSegment}/${itemId}.${mediaExt}`;

      const media = await storage.createPresignedUpload({
        objectKey: mediaKey,
        contentType: validated.mimeType,
        contentLength: validated.fileSizeBytes,
        expiresInSeconds: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
      });

      let poster:
        | Awaited<ReturnType<MediaStorageProvider["createPresignedUpload"]>>
        | undefined;

      if (validated.posterMimeType && validated.posterSizeBytes) {
        const posterExt = MIME_TO_EXTENSION[validated.posterMimeType] ?? "webp";
        const posterKey = `rooms/${roomSegment}/${standSegment}/${itemId}-poster.${posterExt}`;
        poster = await storage.createPresignedUpload({
          objectKey: posterKey,
          contentType: validated.posterMimeType,
          contentLength: validated.posterSizeBytes,
          expiresInSeconds: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
        });
      }

      res.status(API_HTTP_STATUS.OK).json({
        itemId,
        storageProvider: storage.getProviderId(),
        media,
        ...(poster ? { poster } : {}),
        storageUsageBytes,
        maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
      });
    } catch (error) {
      console.error("[/api/admin/media/presign] Error:", error);
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Failed to generate upload signature.",
      });
    }
  };
}

export default createPresignMediaHandler();
