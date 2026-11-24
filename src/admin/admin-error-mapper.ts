import { AdminHttpError } from "./admin-http-client";
import { ADMIN_HTTP_ERROR_TEXT } from "./constants";

const HTTP_STATUS_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  SERVER_ERROR_MIN: 500,
} as const;

const RAW_TECHNICAL_PATTERN = /\bHTTP\s+\d{3}\b|\/api\/|Failed to fetch|NetworkError/i;

/**
 * Translates HTTP, network, and internal technical errors into plain-Spanish messages for library staff.
 */
export function mapAdminErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (error instanceof AdminHttpError) {
    if (error.status === HTTP_STATUS_CODES.PAYLOAD_TOO_LARGE) {
      return ADMIN_HTTP_ERROR_TEXT.PAYLOAD_TOO_LARGE;
    }
    if (error.status === HTTP_STATUS_CODES.BAD_REQUEST) {
      return ADMIN_HTTP_ERROR_TEXT.BAD_REQUEST;
    }
    if (
      error.status === HTTP_STATUS_CODES.UNAUTHORIZED ||
      error.status === HTTP_STATUS_CODES.FORBIDDEN
    ) {
      return ADMIN_HTTP_ERROR_TEXT.FORBIDDEN;
    }
    if (error.status === HTTP_STATUS_CODES.NOT_FOUND) {
      return ADMIN_HTTP_ERROR_TEXT.NOT_FOUND;
    }
    if (error.status >= HTTP_STATUS_CODES.SERVER_ERROR_MIN) {
      return ADMIN_HTTP_ERROR_TEXT.SERVER_ERROR;
    }
    return fallbackMessage;
  }

  if (error instanceof TypeError) {
    return ADMIN_HTTP_ERROR_TEXT.NETWORK_ERROR;
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (!trimmed || RAW_TECHNICAL_PATTERN.test(trimmed)) {
      return fallbackMessage;
    }
    return trimmed;
  }

  return fallbackMessage;
}
