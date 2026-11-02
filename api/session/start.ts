import { randomUUID } from "node:crypto";
import { getDb, ensureSessionsTable } from "../_db";

export interface ServerlessRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ServerlessResponse {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
}

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  try {
    await ensureSessionsTable();
    const sessionId = randomUUID();
    const timestamp = Date.now();
    const db = getDb();

    await db.execute({
      sql: "INSERT INTO sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 0)",
      args: [sessionId, timestamp, timestamp],
    });

    res.status(201).json({ sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database operation failed";
    res.status(500).json({ error: message });
  }
}
