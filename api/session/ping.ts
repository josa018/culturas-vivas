
import { getDb, ensureSessionsTable } from "../_db.js";
import {
  API_HTTP_STATUS,
  normalizeUuid,
  parseJsonObjectBody,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
      error: "Method not allowed. Use POST.",
    });
    return;
  }

  const body = parseJsonObjectBody(req.body);
  const sessionId = normalizeUuid(body?.sessionId);

  if (!sessionId) {
    res.status(API_HTTP_STATUS.BAD_REQUEST).json({
      error: "Invalid or malformed sessionId. Must be UUID v4.",
    });
    return;
  }

  try {
    await ensureSessionsTable();
    const db = getDb();
    const result = await db.execute({
      sql: "UPDATE visitor_sessions SET last_ping = ?, ping_count = ping_count + 1 WHERE id = ?",
      args: [Date.now(), sessionId],
    });

    if (result.rowsAffected === 0) {
      res.status(API_HTTP_STATUS.NOT_FOUND).json({ error: "Session not found." });
      return;
    }

    res.status(API_HTTP_STATUS.OK).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database operation failed";
    res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: message });
  }
}
