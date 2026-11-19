import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { describe, it, expect } from "vitest";
import { verifyPassword } from "../../api/_auth";
// @ts-expect-error ESM utility script without generated .d.ts
import { runMigrations } from "../../scripts/db-migrate.mjs";
// @ts-expect-error ESM utility script without generated .d.ts
import { seedAdminUser } from "../../scripts/seed-admin.mjs";

async function withMigratedTempDb(fn: (dbUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-seed-admin-"));
  const dbUrl = pathToFileURL(path.join(tmpDir, "seed.db")).href;
  try {
    await runMigrations({ dbUrl, log: () => {} });
    await fn(dbUrl);
  } finally {
    try {
      fs.rmSync(tmpDir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      });
    } catch {
      // Windows native handle release lag
    }
  }
}

describe("scripts/seed-admin.mjs", () => {
  it("provisions an admin user and updates password/role idempotently on conflict", async () => {
    await withMigratedTempDb(async (dbUrl) => {
      const created = await seedAdminUser({
        dbUrl,
        username: " director ",
        password: "strong_password_99",
        role: "librarian",
      });
      expect(created).toEqual({ username: "director", role: "librarian" });

      const updated = await seedAdminUser({
        dbUrl,
        username: "director",
        password: "rotated_password_2",
        role: "admin",
      });
      expect(updated).toEqual({ username: "director", role: "admin" });

      const verifyDb = createClient({ url: dbUrl });
      try {
        const userRes = await verifyDb.execute({
          sql: "SELECT username, password_hash, role FROM users_admin WHERE username = ?",
          args: ["director"],
        });
        expect(userRes.rows).toHaveLength(1);
        expect(userRes.rows[0].role).toBe("admin");
        expect(
          await verifyPassword(
            "rotated_password_2",
            String(userRes.rows[0].password_hash),
          ),
        ).toBe(true);
      } finally {
        verifyDb.close();
      }
    });
  });

  it.each([
    {
      label: "missing dbUrl",
      args: { dbUrl: undefined, username: "admin", password: "password123", role: "admin" },
      expectedError: "Missing TURSO_DATABASE_URL",
    },
    {
      label: "empty username",
      args: { dbUrl: "file:unused.db", username: "   ", password: "password123", role: "admin" },
      expectedError: "at least 8 characters",
    },
    {
      label: "short password (< 8 chars)",
      args: { dbUrl: "file:unused.db", username: "admin", password: "short", role: "admin" },
      expectedError: "at least 8 characters",
    },
    {
      label: "invalid role",
      args: { dbUrl: "file:unused.db", username: "admin", password: "password123", role: "superuser" },
      expectedError: "role must be 'admin' or 'librarian'",
    },
  ])("rejects $label before opening database", async ({ args, expectedError }) => {
    await expect(seedAdminUser(args)).rejects.toThrow(expectedError);
  });
});
