import { getDb } from "../_db.js";
import type { ServerlessRequest, ServerlessResponse } from "./start.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractSessionId(body: unknown): string | null {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      return typeof parsed.sessionId === "string" ? parsed.sessionId : null;
    } catch {
      return null;
    }
  }

  if (typeof body === "object" && body !== null) {
    const candidate = (body as Record<string, unknown>).sessionId;
    return typeof candidate === "string" ? candidate : null;
  }

  return null;
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const sessionId = extractSessionId(req.body);

  if (!sessionId || !UUID_V4_PATTERN.test(sessionId)) {
    res.status(400).json({ error: "Invalid or malformed sessionId. Must be UUID v4." });
    return;
  }

  try {
    const db = getDb();
    const result = await db.execute({
      sql: "UPDATE sessions SET last_ping = ?, ping_count = ping_count + 1 WHERE id = ?",
      args: [Date.now(), sessionId],
    });

    if (result.rowsAffected === 0) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database operation failed";
    res.status(500).json({ error: message });
  }
}
