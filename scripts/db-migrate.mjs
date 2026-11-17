import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MIGRATIONS_FOLDER = join(process.cwd(), "db", "migrations");

export function loadDatabaseEnv() {
  dotenv.config({ path: ".env.local", quiet: true });
  dotenv.config({ path: ".env", quiet: true });
  return {
    dbUrl: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  };
}

async function listTables(db) {
  const r = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return r.rows.map((row) => String(row.name));
}

async function listApplied(db) {
  const r = await db.execute("SELECT name FROM _migrations");
  return new Set(r.rows.map((row) => String(row.name)));
}

/**
 * Applies pending SQL migrations in sorted order with `_migrations` idempotency tracking.
 */
export async function runMigrations({
  dbUrl,
  authToken,
  migrationsDir = MIGRATIONS_FOLDER,
  dryRun = false,
  log = console.log,
}) {
  if (!dbUrl) {
    throw new Error("Missing TURSO_DATABASE_URL (check .env.local or .env).");
  }

  const db = createClient({ url: dbUrl, authToken });

  try {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const before = await listTables(db);

    if (dryRun) {
      log("DRY RUN - nothing will be changed\n");
      log("Tables currently in database:");
      before.forEach((t) => log(`  - ${t}`));
      const applied = before.includes("_migrations")
        ? await listApplied(db)
        : new Set();
      const pending = files.filter((f) => !applied.has(f));
      log("\nPending migrations:");
      if (pending.length === 0) log("  (none)");
      pending.forEach((f) => log(`  - ${f}`));
      return {
        appliedCount: 0,
        skippedCount: applied.size,
        pending,
        tables: before,
      };
    }

    await db.execute("PRAGMA foreign_keys = ON;");
    await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const applied = await listApplied(db);
    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        log(`= ${file} (already applied)`);
        skippedCount++;
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await db.executeMultiple(sql);
      await db.execute({
        sql: "INSERT INTO _migrations (name) VALUES (?)",
        args: [file],
      });
      log(`+ ${file} applied`);
      appliedCount++;
    }

    log(`\n${appliedCount} new migration(s).`);

    const tables = await listTables(db);
    log("\nTables in database:");
    tables.forEach((t) => log(`  - ${t}`));

    const idx = await db.execute(
      "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND (name LIKE 'idx_%' OR name LIKE 'ux_%') ORDER BY name",
    );
    log("\nIndexes:");
    idx.rows.forEach((i) => log(`  - ${i.name} (${i.tbl_name})`));

    return { appliedCount, skippedCount, pending: [], tables };
  } finally {
    db.close();
  }
}

const isMainEntry =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainEntry) {
  const { dbUrl, authToken } = loadDatabaseEnv();
  const dryRun = process.argv.includes("--dry-run");
  runMigrations({ dbUrl, authToken, dryRun }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
