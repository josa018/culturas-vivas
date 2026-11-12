import { getDb } from "../_db.js";
import type { ServerlessRequest, ServerlessResponse } from "../session/start";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBody(body: unknown): Record<string, unknown> | null {
  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : null;
}

function toRating(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : null;
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = parseBody(req.body);
  const sessionId =
    typeof body?.sessionId === "string" ? body.sessionId.toLowerCase() : null;
  const q1 = toRating(body?.q1Rating);
  const q2 = toRating(body?.q2Ease);
  const q3 = toRating(body?.q3Recommend);

  if (!sessionId || !UUID_V4_PATTERN.test(sessionId)) {
    res.status(400).json({ error: "Invalid or malformed sessionId. Must be UUID v4." });
    return;
  }

  if (q1 === null || q2 === null || q3 === null) {
    res.status(400).json({ error: "q1Rating, q2Ease and q3Recommend must be integers from 1 to 5." });
    return;
  }

  try {
    // Single statement: inserts only if the session exists.
    // The unique index on surveys.session_uuid rejects a second survey.
    const result = await getDb().execute({
      sql: `INSERT INTO surveys (session_uuid, q1_rating, q2_ease, q3_recommend)
            SELECT ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM sessions WHERE uuid = ?)`,
      args: [sessionId, q1, q2, q3, sessionId],
    });

    if (result.rowsAffected === 0) {
      res.status(404).json({ error: "Session not found." });
      return;
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("UNIQUE")) {
      res.status(409).json({ error: "This session already submitted a survey." });
      return;
    }
    // Do not echo database details back to the client
    res.status(500).json({ error: "Could not save the survey." });
  }
}