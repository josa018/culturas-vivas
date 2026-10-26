import { createClient, type Client } from "@libsql/client";
import { DB_CONFIG } from "../config/db_config.js";

export function createTursoClient(): Client {
  return createClient({
    url: DB_CONFIG.DATABASE_URL,
    authToken: DB_CONFIG.AUTH_TOKEN,
  });
}
