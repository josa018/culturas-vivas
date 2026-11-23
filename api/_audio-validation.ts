import type { Client } from "@libsql/client";
import { isValidRoomId, type RoomId } from "../src/shared/room-catalog.js";
import {
  MEDIA_STORAGE_LIMITS,
  type ValidationResult,
} from "./_media-validation.js";
import { resolvePublicMediaUrl } from "./_storage.js";

export const AUDIO_PRESIGN_ASSET_KIND = "ROOM_AUDIO" as const;

export const ALLOWED_AUDIO_MIMES = ["audio/mpeg", "audio/mp4"] as const;

export const AUDIO_MIME_TO_EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
} as const;

export const AudioPlaybackModeValues = ["SEQUENTIAL", "SHUFFLE"] as const;

export type AudioPlaybackMode = (typeof AudioPlaybackModeValues)[number];

export const AUDIO_STORAGE_LIMITS = {
  MAX_AUDIO_BYTES: 20_971_520, // 20 MiB per track
  MAX_TITLE_LENGTH: 80,
  MAX_CREDIT_LENGTH: 80,
  MAX_LICENSE_LENGTH: 240,
  PRESIGN_TTL_SECONDS: MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS,
  MAX_TOTAL_BYTES: MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES,
} as const;

export interface AudioPresignRequestInput {
  readonly roomId: unknown;
  readonly mimeType: unknown;
  readonly fileSizeBytes: unknown;
}

export interface ValidatedAudioPresignRequest {
  readonly roomId: RoomId;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
}

export interface AudioTrackCreateInput {
  readonly roomId: unknown;
  readonly title: unknown;
  readonly artistCredit?: unknown;
  readonly licenseNote?: unknown;
  readonly mediaKey: unknown;
  readonly mimeType: unknown;
  readonly fileSizeBytes: unknown;
  readonly durationMs?: unknown;
}

export interface ValidatedAudioTrackCreate {
  readonly roomId: RoomId;
  readonly title: string;
  readonly artistCredit: string;
  readonly licenseNote: string;
  readonly mediaKey: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly durationMs: number | null;
}

export interface ValidatedAudioTrackMetadataPatch {
  readonly id: string;
  readonly title?: string;
  readonly artistCredit?: string;
  readonly licenseNote?: string;
}

export interface ValidatedAudioReorderPatch {
  readonly roomId: RoomId;
  readonly orderedIds: readonly string[];
}

export function isAllowedAudioMime(mime: unknown): mime is string {
  return (
    typeof mime === "string" &&
    (ALLOWED_AUDIO_MIMES as readonly string[]).includes(mime)
  );
}

export function isAudioPlaybackMode(value: unknown): value is AudioPlaybackMode {
  return (
    typeof value === "string" &&
    (AudioPlaybackModeValues as readonly string[]).includes(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function buildAudioKeyPrefix(roomId: RoomId): string {
  return `audio/${roomId.toLowerCase()}/`;
}

export function isSafeAudioObjectKey(key: string, roomId: RoomId): boolean {
  if (key.includes("..") || key.startsWith("/")) {
    return false;
  }
  return key.startsWith(buildAudioKeyPrefix(roomId));
}

export async function fetchCombinedStorageUsageBytes(
  db: Client,
): Promise<number> {
  const res = await db.execute(
    `SELECT (
       (SELECT COALESCE(SUM(file_size_bytes), 0) FROM room_media_items) +
       (SELECT COALESCE(SUM(file_size_bytes), 0) FROM room_audio_tracks)
     ) AS usedBytes`,
  );
  return Number(res.rows[0]?.usedBytes ?? 0);
}

export function validateAudioPresignRequest(
  input: AudioPresignRequestInput,
): ValidationResult<ValidatedAudioPresignRequest> {
  if (typeof input.roomId !== "string" || !isValidRoomId(input.roomId)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid roomId target.",
    };
  }
  if (!isAllowedAudioMime(input.mimeType)) {
    return {
      ok: false,
      status: 400,
      error: "Unsupported audio MIME type.",
    };
  }
  if (!isPositiveInteger(input.fileSizeBytes)) {
    return {
      ok: false,
      status: 400,
      error: "fileSizeBytes must be a positive integer.",
    };
  }
  if (input.fileSizeBytes > AUDIO_STORAGE_LIMITS.MAX_AUDIO_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Audio exceeds maximum 20 MiB limit.",
    };
  }

  return {
    ok: true,
    value: {
      roomId: input.roomId,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
    },
  };
}

export function validateAudioTrackCreate(
  input: Record<string, unknown> | AudioTrackCreateInput,
): ValidationResult<ValidatedAudioTrackCreate> {
  if (typeof input.roomId !== "string" || !isValidRoomId(input.roomId)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid roomId target.",
    };
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (
    title.length === 0 ||
    title.length > AUDIO_STORAGE_LIMITS.MAX_TITLE_LENGTH
  ) {
    return {
      ok: false,
      status: 400,
      error: `Title must be between 1 and ${AUDIO_STORAGE_LIMITS.MAX_TITLE_LENGTH} characters.`,
    };
  }

  const artistCredit =
    typeof input.artistCredit === "string" ? input.artistCredit.trim() : "";
  if (artistCredit.length > AUDIO_STORAGE_LIMITS.MAX_CREDIT_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `artistCredit exceeds ${AUDIO_STORAGE_LIMITS.MAX_CREDIT_LENGTH} characters.`,
    };
  }

  const licenseNote =
    typeof input.licenseNote === "string" ? input.licenseNote.trim() : "";
  if (licenseNote.length > AUDIO_STORAGE_LIMITS.MAX_LICENSE_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `licenseNote exceeds ${AUDIO_STORAGE_LIMITS.MAX_LICENSE_LENGTH} characters.`,
    };
  }

  if (
    typeof input.mediaKey !== "string" ||
    !isSafeAudioObjectKey(input.mediaKey.trim(), input.roomId)
  ) {
    return {
      ok: false,
      status: 400,
      error: "mediaKey does not match the target room audio prefix.",
    };
  }
  const mediaKey = input.mediaKey.trim();

  if (!isAllowedAudioMime(input.mimeType)) {
    return {
      ok: false,
      status: 400,
      error: "Unsupported audio MIME type.",
    };
  }

  if (!isPositiveInteger(input.fileSizeBytes)) {
    return {
      ok: false,
      status: 400,
      error: "fileSizeBytes must be a positive integer.",
    };
  }

  if (input.fileSizeBytes > AUDIO_STORAGE_LIMITS.MAX_AUDIO_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Audio exceeds maximum 20 MiB limit.",
    };
  }

  let durationMs: number | null = null;
  if (input.durationMs !== undefined && input.durationMs !== null) {
    if (!isPositiveInteger(input.durationMs)) {
      return {
        ok: false,
        status: 400,
        error: "durationMs must be a positive integer when provided.",
      };
    }
    durationMs = input.durationMs;
  }

  return {
    ok: true,
    value: {
      roomId: input.roomId,
      title,
      artistCredit,
      licenseNote,
      mediaKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      durationMs,
    },
  };
}

export function validateAudioTrackMetadataPatch(
  body: Record<string, unknown>,
): ValidationResult<ValidatedAudioTrackMetadataPatch> {
  if (typeof body.id !== "string" || body.id.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Track id is required.",
    };
  }
  const patch: {
    id: string;
    title?: string;
    artistCredit?: string;
    licenseNote?: string;
  } = { id: body.id.trim() };

  if (body.title !== undefined) {
    if (typeof body.title !== "string") {
      return { ok: false, status: 400, error: "Title must be a string." };
    }
    const title = body.title.trim();
    if (
      title.length === 0 ||
      title.length > AUDIO_STORAGE_LIMITS.MAX_TITLE_LENGTH
    ) {
      return {
        ok: false,
        status: 400,
        error: `Title must be between 1 and ${AUDIO_STORAGE_LIMITS.MAX_TITLE_LENGTH} characters.`,
      };
    }
    patch.title = title;
  }

  if (body.artistCredit !== undefined) {
    if (typeof body.artistCredit !== "string") {
      return {
        ok: false,
        status: 400,
        error: "artistCredit must be a string.",
      };
    }
    const artistCredit = body.artistCredit.trim();
    if (artistCredit.length > AUDIO_STORAGE_LIMITS.MAX_CREDIT_LENGTH) {
      return {
        ok: false,
        status: 400,
        error: `artistCredit exceeds ${AUDIO_STORAGE_LIMITS.MAX_CREDIT_LENGTH} characters.`,
      };
    }
    patch.artistCredit = artistCredit;
  }

  if (body.licenseNote !== undefined) {
    if (typeof body.licenseNote !== "string") {
      return {
        ok: false,
        status: 400,
        error: "licenseNote must be a string.",
      };
    }
    const licenseNote = body.licenseNote.trim();
    if (licenseNote.length > AUDIO_STORAGE_LIMITS.MAX_LICENSE_LENGTH) {
      return {
        ok: false,
        status: 400,
        error: `licenseNote exceeds ${AUDIO_STORAGE_LIMITS.MAX_LICENSE_LENGTH} characters.`,
      };
    }
    patch.licenseNote = licenseNote;
  }

  if (
    patch.title === undefined &&
    patch.artistCredit === undefined &&
    patch.licenseNote === undefined
  ) {
    return {
      ok: false,
      status: 400,
      error: "At least one metadata field must be provided.",
    };
  }

  return { ok: true, value: patch };
}

export function validateAudioReorderPatch(
  body: Record<string, unknown>,
): ValidationResult<ValidatedAudioReorderPatch> {
  if (typeof body.roomId !== "string" || !isValidRoomId(body.roomId)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid roomId for reorder.",
    };
  }
  if (
    !Array.isArray(body.orderedIds) ||
    body.orderedIds.length === 0 ||
    !body.orderedIds.every(
      (id) => typeof id === "string" && id.trim().length > 0,
    )
  ) {
    return {
      ok: false,
      status: 400,
      error: "orderedIds must be a non-empty array of track IDs.",
    };
  }

  const trimmed = body.orderedIds.map((id) => (id as string).trim());
  if (new Set(trimmed).size !== trimmed.length) {
    return {
      ok: false,
      status: 400,
      error: "orderedIds must not contain duplicates.",
    };
  }

  return {
    ok: true,
    value: {
      roomId: body.roomId,
      orderedIds: trimmed,
    },
  };
}

export function validateAudioPlaybackModeUpdate(
  body: Record<string, unknown>,
): ValidationResult<{
  readonly roomId: RoomId;
  readonly playbackMode: AudioPlaybackMode;
}> {
  if (typeof body.roomId !== "string" || !isValidRoomId(body.roomId)) {
    return {
      ok: false,
      status: 400,
      error: "Invalid roomId target.",
    };
  }
  if (!isAudioPlaybackMode(body.playbackMode)) {
    return {
      ok: false,
      status: 400,
      error: "playbackMode must be SEQUENTIAL or SHUFFLE.",
    };
  }
  return {
    ok: true,
    value: {
      roomId: body.roomId,
      playbackMode: body.playbackMode,
    },
  };
}

export interface AudioTrackRow {
  readonly id: string;
  readonly room_id: string;
  readonly title: string;
  readonly artist_credit: string;
  readonly license_note: string;
  readonly storage_provider: string;
  readonly media_key: string;
  readonly mime_type: string;
  readonly file_size_bytes: number;
  readonly duration_ms: number | null;
  readonly sort_order: number;
  readonly created_at: number;
  readonly updated_at: number;
}

export interface SerializedRoomAudioTrack {
  readonly id: string;
  readonly roomId: string;
  readonly title: string;
  readonly artistCredit: string;
  readonly licenseNote: string;
  readonly mediaKey: string;
  readonly mediaUrl: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly durationMs: number | null;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function serializeAudioTrackRow(
  row: AudioTrackRow,
  publicBaseUrl: string | undefined,
): SerializedRoomAudioTrack {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    title: String(row.title),
    artistCredit: String(row.artist_credit ?? ""),
    licenseNote: String(row.license_note ?? ""),
    mediaKey: String(row.media_key),
    mediaUrl: resolvePublicMediaUrl(publicBaseUrl, String(row.media_key)) ?? "",
    mimeType: String(row.mime_type),
    fileSizeBytes: Number(row.file_size_bytes),
    durationMs:
      row.duration_ms !== null && row.duration_ms !== undefined
        ? Number(row.duration_ms)
        : null,
    sortOrder: Number(row.sort_order),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function fetchRoomPlaybackMode(
  db: Client,
  roomId: RoomId,
): Promise<AudioPlaybackMode> {
  const modeRes = await db.execute({
    sql: "SELECT playback_mode FROM room_playlist_settings WHERE room_id = ?",
    args: [roomId],
  });
  const rawMode = modeRes.rows[0]?.playback_mode;
  return isAudioPlaybackMode(rawMode) ? rawMode : "SEQUENTIAL";
}

export async function fetchRoomAudioTracks(
  db: Client,
  roomId: RoomId,
  publicBaseUrl: string | undefined,
): Promise<SerializedRoomAudioTrack[]> {
  const rowsRes = await db.execute({
    sql: `SELECT id, room_id, title, artist_credit, license_note, storage_provider,
            media_key, mime_type, file_size_bytes, duration_ms, sort_order, created_at, updated_at
          FROM room_audio_tracks
          WHERE room_id = ?
          ORDER BY sort_order ASC, created_at ASC`,
    args: [roomId],
  });
  return rowsRes.rows.map((row) =>
    serializeAudioTrackRow(row as unknown as AudioTrackRow, publicBaseUrl),
  );
}
