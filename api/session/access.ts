import type { Client } from "@libsql/client";
import { getDb } from "../_db.js";
import {
  API_HTTP_STATUS,
  normalizeUuid,
  parseJsonObjectBody,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";

const ACCESS_LIMITS = {
  DEVICE_TYPE_MAX_LENGTH: 64,
  ALLOWED_MODES: ["vr", "2d"] as const,
} as const;

function parseMode(value: unknown): "vr" | "2d" | null {
  return value === "vr" || value === "2d" ? value : null;
}

function parseDeviceType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > ACCESS_LIMITS.DEVICE_TYPE_MAX_LENGTH
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Records anonymized viewing modality transitions (`vr` / `2d`) in `access_logs`.
 */
export function createSessionAccessHandler(resolveDb: () => Client = getDb) {
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

    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid JSON body. Expected an object.",
      });
      return;
    }

    const sessionId = normalizeUuid(body.sessionId);
    if (!sessionId) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid or malformed sessionId. Must be UUID v4.",
      });
      return;
    }

    const mode = parseMode(body.mode);
    if (!mode) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "mode must be 'vr' or '2d'.",
      });
      return;
    }

    const deviceType = parseDeviceType(body.deviceType);
    if (!deviceType) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: `deviceType must be a non-empty string of at most ${ACCESS_LIMITS.DEVICE_TYPE_MAX_LENGTH} characters.`,
      });
      return;
    }

    try {
      const result = await resolveDb().execute({
        sql: `INSERT INTO access_logs (session_uuid, device_type, mode)
              SELECT ?, ?, ?
              WHERE EXISTS (SELECT 1 FROM visitor_sessions WHERE id = ?)`,
        args: [sessionId, deviceType, mode, sessionId],
      });

      if (result.rowsAffected === 0) {
        res.status(API_HTTP_STATUS.NOT_FOUND).json({
          error: "Session not found.",
        });
        return;
      }

      res.status(API_HTTP_STATUS.CREATED).json({ ok: true });
    } catch {
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Could not record session access.",
      });
    }
  };
}

export default createSessionAccessHandler();
