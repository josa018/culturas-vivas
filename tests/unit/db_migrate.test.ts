import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runMigrations } from "../../scripts/db-migrate.mjs";

describe("scripts/db-migrate.mjs", () => {
  let tmpDir: string;
  let dbUrl: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-migrate-test-"));
    dbUrl = pathToFileURL(path.join(tmpDir, "test.db")).href;
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      });
    } catch {
      // Windows @libsql/client native handle may linger until process exit
    }
  });

  it("reports pending migrations in dry-run without mutating the database", async () => {
    const logs: string[] = [];
    const dryResult = await runMigrations({
      dbUrl,
      dryRun: true,
      log: (msg: string) => logs.push(msg),
    });

    expect(dryResult.appliedCount).toBe(0);
    expect(dryResult.tables).toEqual([]);
    expect(dryResult.pending).toContain(
      "005_align_surveys_single_question.sql",
    );
    expect(logs.some((line) => line.includes("DRY RUN"))).toBe(true);
  });

  it("applies all migrations once and skips already-applied files on re-run", async () => {
    const firstLogs: string[] = [];
    const first = await runMigrations({
      dbUrl,
      log: (msg: string) => firstLogs.push(msg),
    });

    expect(first.appliedCount).toBeGreaterThanOrEqual(6);
    expect(first.skippedCount).toBe(0);
    expect(first.tables).toContain("_migrations");
    expect(first.tables).toContain("visitor_sessions");
    expect(first.tables).toContain("surveys");

    const secondLogs: string[] = [];
    const second = await runMigrations({
      dbUrl,
      log: (msg: string) => secondLogs.push(msg),
    });

    expect(second.appliedCount).toBe(0);
    expect(second.skippedCount).toBe(first.appliedCount);
    expect(secondLogs.some((line) => line.includes("(already applied)"))).toBe(
      true,
    );

    const dryAfter = await runMigrations({
      dbUrl,
      dryRun: true,
      log: () => {},
    });
    expect(dryAfter.pending).toEqual([]);
  });

  it("throws a descriptive error when dbUrl is missing", async () => {
    await expect(
      runMigrations({ dbUrl: undefined, log: () => {} }),
    ).rejects.toThrow("Missing TURSO_DATABASE_URL");
  });
});
