import {
  isValidRoomStand,
  type RoomId,
  type StandId,
} from "../src/shared/room-catalog.js";

export const StandMediaKindValues = [
  "IMAGE_2D",
  "IMAGE_STEREO_SBS",
  "VIDEO_2D",
  "VIDEO_STEREO_SBS",
] as const;

export type StandMediaKind = (typeof StandMediaKindValues)[number];

export const MEDIA_STORAGE_LIMITS = {
  MAX_TOTAL_BYTES: 8_589_934_592, // 8 GiB free-tier ceiling (2 GiB buffer under 10 GiB R2)
  MAX_IMAGE_BYTES: 5_242_880, // 5 MiB
  MAX_VIDEO_BYTES: 52_428_800, // 50 MiB
  MAX_POSTER_BYTES: 1_048_576, // 1 MiB
  MAX_TITLE_LENGTH: 120,
  MAX_CREATOR_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 500,
  PRESIGN_TTL_SECONDS: 300,
} as const;

export const ALLOWED_IMAGE_MIMES = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

export const ALLOWED_VIDEO_MIMES = ["video/mp4"] as const;

export const MIME_TO_EXTENSION: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
};

export interface PresignRequestInput {
  readonly roomId: unknown;
  readonly standId: unknown;
  readonly mediaKind: unknown;
  readonly mimeType: unknown;
  readonly fileSizeBytes: unknown;
  readonly posterMimeType?: unknown;
  readonly posterSizeBytes?: unknown;
}

export interface ValidatedPresignRequest {
  readonly roomId: RoomId;
  readonly standId: StandId;
  readonly mediaKind: StandMediaKind;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly posterMimeType?: string;
  readonly posterSizeBytes?: number;
}

export interface MediaRecordCreateInput {
  readonly roomId: unknown;
  readonly standId: unknown;
  readonly mediaKind: unknown;
  readonly title: unknown;
  readonly creatorName?: unknown;
  readonly description?: unknown;
  readonly mediaKey: unknown;
  readonly posterKey?: unknown;
  readonly mimeType: unknown;
  readonly fileSizeBytes: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
}

export interface ValidatedMediaRecordCreate {
  readonly roomId: RoomId;
  readonly standId: StandId;
  readonly mediaKind: StandMediaKind;
  readonly title: string;
  readonly creatorName: string;
  readonly description: string;
  readonly mediaKey: string;
  readonly posterKey: string | null;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: 400 | 413; readonly error: string };

export function isStandMediaKind(value: unknown): value is StandMediaKind {
  return (
    typeof value === "string" &&
    (StandMediaKindValues as readonly string[]).includes(value)
  );
}

export function isVideoMediaKind(kind: StandMediaKind): boolean {
  return kind === "VIDEO_2D" || kind === "VIDEO_STEREO_SBS";
}

function isAllowedImageMime(mime: unknown): mime is string {
  return (
    typeof mime === "string" &&
    (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime)
  );
}

function isAllowedVideoMime(mime: unknown): mime is string {
  return (
    typeof mime === "string" &&
    (ALLOWED_VIDEO_MIMES as readonly string[]).includes(mime)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseOptionalDimension(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (isPositiveInteger(value)) {
    return value;
  }
  return null;
}

export function buildMediaKeyPrefix(roomId: RoomId, standId: StandId): string {
  return `rooms/${roomId.toLowerCase()}/${standId.toLowerCase()}/`;
}

export function isSafeRoomObjectKey(
  key: string,
  roomId: RoomId,
  standId: StandId,
): boolean {
  if (key.includes("..") || key.startsWith("/")) {
    return false;
  }
  return key.startsWith(buildMediaKeyPrefix(roomId, standId));
}

export function validateQuotaCapacity(
  usedBytes: number,
  incomingBytes: number,
): ValidationResult<true> {
  if (usedBytes + incomingBytes > MEDIA_STORAGE_LIMITS.MAX_TOTAL_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Storage quota ceiling (8 GiB) exceeded.",
    };
  }
  return { ok: true, value: true };
}

export function validatePresignRequest(
  input: PresignRequestInput,
): ValidationResult<ValidatedPresignRequest> {
  if (
    typeof input.roomId !== "string" ||
    typeof input.standId !== "string" ||
    !isValidRoomStand(input.roomId, input.standId)
  ) {
    return {
      ok: false,
      status: 400,
      error: "Invalid roomId and standId combination.",
    };
  }

  if (!isStandMediaKind(input.mediaKind)) {
    return {
      ok: false,
      status: 400,
      error: "Unsupported mediaKind.",
    };
  }

  if (!isPositiveInteger(input.fileSizeBytes)) {
    return {
      ok: false,
      status: 400,
      error: "fileSizeBytes must be a positive integer.",
    };
  }

  const isVideo = isVideoMediaKind(input.mediaKind);
  if (isVideo) {
    if (!isAllowedVideoMime(input.mimeType)) {
      return {
        ok: false,
        status: 400,
        error: "Unsupported video MIME type. Allowed: video/mp4.",
      };
    }
    if (input.fileSizeBytes > MEDIA_STORAGE_LIMITS.MAX_VIDEO_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "Video exceeds maximum 50 MiB limit.",
      };
    }
  } else {
    if (!isAllowedImageMime(input.mimeType)) {
      return {
        ok: false,
        status: 400,
        error:
          "Unsupported image MIME type. Allowed: image/webp, image/jpeg, image/png.",
      };
    }
    if (input.fileSizeBytes > MEDIA_STORAGE_LIMITS.MAX_IMAGE_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "Image exceeds maximum 5 MiB limit.",
      };
    }
  }

  let posterMimeType: string | undefined;
  let posterSizeBytes: number | undefined;
  if (
    input.posterMimeType !== undefined ||
    input.posterSizeBytes !== undefined
  ) {
    if (!isAllowedImageMime(input.posterMimeType)) {
      return {
        ok: false,
        status: 400,
        error: "Unsupported poster MIME type.",
      };
    }
    if (!isPositiveInteger(input.posterSizeBytes)) {
      return {
        ok: false,
        status: 400,
        error: "posterSizeBytes must be a positive integer.",
      };
    }
    if (input.posterSizeBytes > MEDIA_STORAGE_LIMITS.MAX_POSTER_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "Poster exceeds maximum 1 MiB limit.",
      };
    }
    posterMimeType = input.posterMimeType;
    posterSizeBytes = input.posterSizeBytes;
  }

  return {
    ok: true,
    value: {
      roomId: input.roomId as RoomId,
      standId: input.standId as StandId,
      mediaKind: input.mediaKind,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      posterMimeType,
      posterSizeBytes,
    },
  };
}

export function validateMediaRecordCreate(
  input: MediaRecordCreateInput,
): ValidationResult<ValidatedMediaRecordCreate> {
  if (
    typeof input.roomId !== "string" ||
    typeof input.standId !== "string" ||
    !isValidRoomStand(input.roomId, input.standId)
  ) {
    return {
      ok: false,
      status: 400,
      error: "Invalid roomId and standId combination.",
    };
  }

  if (!isStandMediaKind(input.mediaKind)) {
    return {
      ok: false,
      status: 400,
      error: "Unsupported mediaKind.",
    };
  }

  if (typeof input.title !== "string") {
    return { ok: false, status: 400, error: "Title is required." };
  }
  const title = input.title.trim();
  if (
    title.length === 0 ||
    title.length > MEDIA_STORAGE_LIMITS.MAX_TITLE_LENGTH
  ) {
    return {
      ok: false,
      status: 400,
      error: `Title must be between 1 and ${MEDIA_STORAGE_LIMITS.MAX_TITLE_LENGTH} characters.`,
    };
  }

  const creatorName =
    typeof input.creatorName === "string" ? input.creatorName.trim() : "";
  if (creatorName.length > MEDIA_STORAGE_LIMITS.MAX_CREATOR_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `creatorName exceeds ${MEDIA_STORAGE_LIMITS.MAX_CREATOR_LENGTH} characters.`,
    };
  }

  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > MEDIA_STORAGE_LIMITS.MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `description exceeds ${MEDIA_STORAGE_LIMITS.MAX_DESCRIPTION_LENGTH} characters.`,
    };
  }

  const roomId = input.roomId as RoomId;
  const standId = input.standId as StandId;
  if (
    typeof input.mediaKey !== "string" ||
    !isSafeRoomObjectKey(input.mediaKey.trim(), roomId, standId)
  ) {
    return {
      ok: false,
      status: 400,
      error: "mediaKey does not match the target room and stand prefix.",
    };
  }
  const mediaKey = input.mediaKey.trim();

  let posterKey: string | null = null;
  if (
    input.posterKey !== undefined &&
    input.posterKey !== null &&
    input.posterKey !== ""
  ) {
    if (
      typeof input.posterKey !== "string" ||
      !isSafeRoomObjectKey(input.posterKey.trim(), roomId, standId)
    ) {
      return {
        ok: false,
        status: 400,
        error: "posterKey does not match the target room and stand prefix.",
      };
    }
    posterKey = input.posterKey.trim();
  }

  if (!isPositiveInteger(input.fileSizeBytes)) {
    return {
      ok: false,
      status: 400,
      error: "fileSizeBytes must be a positive integer.",
    };
  }

  const isVideo = isVideoMediaKind(input.mediaKind);
  if (isVideo) {
    if (!isAllowedVideoMime(input.mimeType)) {
      return { ok: false, status: 400, error: "Unsupported video MIME type." };
    }
    if (input.fileSizeBytes > MEDIA_STORAGE_LIMITS.MAX_VIDEO_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "Video exceeds maximum 50 MiB limit.",
      };
    }
  } else {
    if (!isAllowedImageMime(input.mimeType)) {
      return { ok: false, status: 400, error: "Unsupported image MIME type." };
    }
    if (input.fileSizeBytes > MEDIA_STORAGE_LIMITS.MAX_IMAGE_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "Image exceeds maximum 5 MiB limit.",
      };
    }
  }

  return {
    ok: true,
    value: {
      roomId,
      standId,
      mediaKind: input.mediaKind,
      title,
      creatorName,
      description,
      mediaKey,
      posterKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      width: parseOptionalDimension(input.width),
      height: parseOptionalDimension(input.height),
    },
  };
}
