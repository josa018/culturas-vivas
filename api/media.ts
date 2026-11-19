import type { Client } from "@libsql/client";
import { getDb } from "./_db.js";
import {
  API_HTTP_STATUS,
  type ServerlessRequest,
  type ServerlessResponse,
} from "./_http.js";
import { MEDIA_STORAGE_LIMITS } from "./_media-validation.js";
import { resolvePublicMediaUrl } from "./_storage.js";

const PUBLIC_MEDIA_CACHE_HEADER =
  "public, max-age=30, stale-while-revalidate=120";

export interface MediaCatalogRow {
  readonly id: string;
  readonly room_id: string;
  readonly stand_id: string;
  readonly media_kind: string;
  readonly title: string;
  readonly creator_name: string;
  readonly description: string;
  readonly storage_provider: string;
  readonly media_key: string;
  readonly poster_key: string | null;
  readonly mime_type: string;
  readonly file_size_bytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly sort_order: number;
  readonly created_at: number;
  readonly updated_at: number;
}

export interface SerializedStandMediaItem {
  readonly id: string;
  readonly roomId: string;
  readonly standId: string;
  readonly mediaType: string;
  readonly title: string;
  readonly creatorName: string;
  readonly description: string;
  readonly mediaKey: string;
  readonly posterKey: string | null;
  readonly mediaUrl: string;
  readonly posterUrl?: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function serializeMediaRow(
  row: MediaCatalogRow,
  publicBaseUrl: string | undefined,
): SerializedStandMediaItem {
  const mediaUrl = resolvePublicMediaUrl(publicBaseUrl, row.media_key) ?? "";
  const posterUrl = resolvePublicMediaUrl(publicBaseUrl, row.poster_key);
  return {
    id: row.id,
    roomId: row.room_id,
    standId: row.stand_id,
    mediaType: row.media_kind,
    title: row.title,
    creatorName: row.creator_name,
    description: row.description,
    mediaKey: row.media_key,
    posterKey: row.poster_key,
    mediaUrl,
    ...(posterUrl ? { posterUrl } : {}),
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    ...(row.width !== null && row.width !== undefined
      ? { width: Number(row.width) }
      : {}),
    ...(row.height !== null && row.height !== undefined
      ? { height: Number(row.height) }
      : {}),
    sortOrder: Number(row.sort_order),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export interface MediaGetHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly resolvePublicBaseUrl?: () => string | undefined;
}

export function createMediaGetHandler(deps: MediaGetHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const resolvePublicBaseUrl =
    deps.resolvePublicBaseUrl ?? (() => process.env.MEDIA_PUBLIC_BASE_URL);

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    if (req.method !== "GET") {
      res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: "Method not allowed. Use GET.",
      });
      return;
    }

    try {
      const db = resolveDb();
      const result = await db.execute(
        `SELECT
           id, room_id, stand_id, media_kind, title, creator_name, description,
           storage_provider, media_key, poster_key, mime_type, file_size_bytes,
           width, height, sort_order, created_at, updated_at
         FROM room_media_items
         ORDER BY room_id ASC, stand_id ASC, sort_order ASC, created_at ASC`,
      );

      const baseUrl = resolvePublicBaseUrl();
      let storageUsageBytes = 0;
      const items = result.rows.map((raw) => {
        const row = raw as unknown as MediaCatalogRow;
        storageUsageBytes += Number(row.file_size_bytes ?? 0);
        return serializeMediaRow(row, baseUrl);
      });

      res.setHeader?.("Cache-Control", PUBLIC_MEDIA_CACHE_HEADER);
      res.status(API_HTTP_STATUS.OK).json({
        items,
        storageUsageBytes,
        maxStorageBytes: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
      });
    } catch (error) {
      console.error("[/api/media] Database read failure:", error);
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Failed to load media catalog.",
      });
    }
  };
}

export default createMediaGetHandler();
