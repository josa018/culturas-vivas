import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[CONFIG_ERROR] Missing required environment variable: '${name}'.`,
    );
  }
  return value.trim();
}

export const DB_CONFIG = Object.freeze({
  DATABASE_URL: getRequiredEnv("TURSO_DATABASE_URL"),
  AUTH_TOKEN: getRequiredEnv("TURSO_AUTH_TOKEN"),
  TABLE_NAME_SESSIONS: "sessions" as const,
  TEST_UUID_PREFIX: "smoke-test-" as const,
  SCHEMA_FILE_PATH: "scripts/db/schema.sql" as const,
});

export type DbConfig = typeof DB_CONFIG;
