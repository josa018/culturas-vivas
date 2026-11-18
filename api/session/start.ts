import { randomUUID } from "node:crypto";
import { getDb, ensureSessionsTable } from "../_db.js";
import {
  API_HTTP_STATUS,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";

export type { ServerlessRequest, ServerlessResponse };

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

  try {
    await ensureSessionsTable();
    const sessionId = randomUUID().toLowerCase();
    const timestamp = Date.now();
    const db = getDb();

    await db.execute({
      sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 0)",
      args: [sessionId, timestamp, timestamp],
    });

    res.status(API_HTTP_STATUS.CREATED).json({ sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database operation failed";
    res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: message });
  }
}
