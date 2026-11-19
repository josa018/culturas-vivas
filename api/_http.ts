export interface ServerlessRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ServerlessResponse {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
}

export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const API_HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export function extractQueryParam(
  req: ServerlessRequest,
  key: string,
): string | null {
  const fromQuery = req.query?.[key];
  if (typeof fromQuery === "string" && fromQuery.trim().length > 0) {
    return fromQuery.trim();
  }
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === "string") {
    const trimmed = fromQuery[0].trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  if (typeof req.url === "string" && req.url.includes("?")) {
    try {
      const parsed = new URL(req.url, "http://localhost");
      const val = parsed.searchParams.get(key);
      if (val && val.trim().length > 0) {
        return val.trim();
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parses a serverless request body into a plain JSON object, rejecting arrays and primitives.
 */
export function parseJsonObjectBody(
  body: unknown,
): Record<string, unknown> | null {
  let candidate: unknown = body;

  if (typeof body === "string") {
    try {
      candidate = JSON.parse(body);
    } catch {
      return null;
    }
  }

  if (
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate)
  ) {
    return candidate as Record<string, unknown>;
  }

  return null;
}

/**
 * Extracts, trims, lowercases, and validates a UUID v4 string.
 */
export function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return UUID_V4_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Checks whether a SQLite/libSQL error represents a UNIQUE constraint violation.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const record = error as { code?: unknown; message?: unknown };
  if (
    typeof record.code === "string" &&
    (record.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      record.code === "SQLITE_CONSTRAINT_PRIMARYKEY")
  ) {
    return true;
  }

  if (error instanceof Error) {
    return (
      error.message.includes("UNIQUE constraint failed") ||
      error.message.includes("SQLITE_CONSTRAINT_UNIQUE")
    );
  }

  return false;
}
