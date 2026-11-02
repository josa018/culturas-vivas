import { createClient, type Client } from "@libsql/client";

let dbInstance: Client | null = null;

export function getDb(): Client {
  if (dbInstance) {
    return dbInstance;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not defined in environment variables");
  }

  dbInstance = createClient({
    url,
    authToken,
  });

  return dbInstance;
}

let isInitialized = false;

/**
 * Ensures the sessions schema is created.
 * Intended for deployment/migration or one-time cold initialization,
 * decoupled from high-frequency telemetry ping requests.
 */
export async function ensureSessionsTable(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_ping INTEGER NOT NULL,
    ping_count INTEGER NOT NULL DEFAULT 0
  )`);

  isInitialized = true;
}
