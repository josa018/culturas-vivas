import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  signAdminToken,
  verifyAdminBearerToken,
  verifyPassword,
} from "../../api/_auth";
import { createAdminLoginHandler } from "../../api/admin/login";
import { createAdminStatsHandler } from "../../api/admin/stats";
import { createSessionAccessHandler } from "../../api/session/access";
import { runMigrations } from "../../scripts/db-migrate.mjs";
import { seedAdminUser } from "../../scripts/seed-admin.mjs";

const TEST_JWT_SECRET = "test-secret-minimum-32-bytes-long-for-hs256";
const SESSION_A = "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d";
const SESSION_B = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const MISSING_SESSION = "99999999-1111-4222-8333-444444444444";

async function applyAllMigrations(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON;");
  const migrationsDir = path.resolve(process.cwd(), "db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    await client.executeMultiple(sql);
  }
}

function createMockResponse() {
  let statusCode = 0;
  let body: unknown = null;
  return {
    res: {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (payload: unknown) => {
            body = payload;
          },
        };
      },
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

describe("Admin Auth, Access Logs & Real Telemetry API", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await applyAllMigrations(client);
  });

  afterEach(() => {
    client.close();
  });

  it("hashes passwords with bcryptjs and signs/verifies HS256 JWTs with jose", async () => {
    const hash = await hashPassword("clave_segura_2026");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("clave_segura_2026", hash)).toBe(true);
    expect(await verifyPassword("otra_clave", hash)).toBe(false);

    const token = await signAdminToken(
      { id: 1, username: "bibliotecario", role: "librarian" },
      TEST_JWT_SECRET,
    );
    const claims = await verifyAdminBearerToken(
      { authorization: `Bearer ${token}` },
      TEST_JWT_SECRET,
    );
    expect(claims?.username).toBe("bibliotecario");
    expect(claims?.role).toBe("librarian");

    const invalidClaims = await verifyAdminBearerToken(
      { authorization: "Bearer tampered.token.value" },
      TEST_JWT_SECRET,
    );
    expect(invalidClaims).toBeNull();
  });

  it("authenticates users_admin via POST /api/admin/login", async () => {
    const hash = await hashPassword("secret_pass_123");
    await client.execute({
      sql: "INSERT INTO users_admin (username, password_hash, role) VALUES (?, ?, ?)",
      args: ["biblio_admin", hash, "admin"],
    });

    const loginHandler = createAdminLoginHandler({
      resolveDb: () => client,
      signToken: (u) => signAdminToken(u, TEST_JWT_SECRET),
    });

    // Method rejection
    const getRes = createMockResponse();
    await loginHandler({ method: "GET" }, getRes.res);
    expect(getRes.getStatus()).toBe(405);

    // Invalid body
    const badRes = createMockResponse();
    await loginHandler({ method: "POST", body: { username: "" } }, badRes.res);
    expect(badRes.getStatus()).toBe(400);

    // Wrong password
    const wrongRes = createMockResponse();
    await loginHandler(
      {
        method: "POST",
        body: { username: "biblio_admin", password: "wrong" },
      },
      wrongRes.res,
    );
    expect(wrongRes.getStatus()).toBe(401);

    // Valid credentials
    const okRes = createMockResponse();
    await loginHandler(
      {
        method: "POST",
        body: { username: " biblio_admin ", password: "secret_pass_123" },
      },
      okRes.res,
    );
    expect(okRes.getStatus()).toBe(200);
    const okPayload = okRes.getBody() as {
      token: string;
      user: { username: string; role: string };
    };
    expect(okPayload.user).toEqual({ username: "biblio_admin", role: "admin" });
    const verified = await verifyAdminBearerToken(
      { authorization: `Bearer ${okPayload.token}` },
      TEST_JWT_SECRET,
    );
    expect(verified?.username).toBe("biblio_admin");
  });

  it("records viewing mode into access_logs via POST /api/session/access", async () => {
    const now = Date.now();
    await client.execute({
      sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 0)",
      args: [SESSION_A, now, now],
    });

    const accessHandler = createSessionAccessHandler(() => client);

    const badMode = createMockResponse();
    await accessHandler(
      {
        method: "POST",
        body: { sessionId: SESSION_A, deviceType: "mobile", mode: "3d" },
      },
      badMode.res,
    );
    expect(badMode.getStatus()).toBe(400);

    const missingSession = createMockResponse();
    await accessHandler(
      {
        method: "POST",
        body: { sessionId: MISSING_SESSION, deviceType: "mobile", mode: "vr" },
      },
      missingSession.res,
    );
    expect(missingSession.getStatus()).toBe(404);

    const okRes = createMockResponse();
    await accessHandler(
      {
        method: "POST",
        body: { sessionId: SESSION_A, deviceType: "mobile", mode: "vr" },
      },
      okRes.res,
    );
    expect(okRes.getStatus()).toBe(201);

    const logs = await client.execute(
      "SELECT session_uuid, device_type, mode FROM access_logs",
    );
    expect(logs.rows.length).toBe(1);
    expect(logs.rows[0].mode).toBe("vr");
    expect(logs.rows[0].device_type).toBe("mobile");
  });

  it("enforces JWT auth and aggregates real 24h UTC-7 stats and joined surveys on GET /api/admin/stats", async () => {
    // Fixed museum timestamp: 2026-11-17 11:30:00 UTC-7 = 2026-11-17T18:30:00Z
    const fixedNowMs = Date.UTC(2026, 10, 17, 18, 30, 0);
    const hour11Ms = Date.UTC(2026, 10, 17, 18, 10, 0); // 11:10 UTC-7
    const hour09Ms = Date.UTC(2026, 10, 17, 16, 5, 0); // 09:05 UTC-7

    await client.batch(
      [
        {
          sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 2)",
          args: [SESSION_A, hour11Ms, fixedNowMs - 5_000], // active
        },
        {
          sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
          args: [SESSION_B, hour09Ms, fixedNowMs - 90_000], // inactive (> 30s)
        },
        {
          sql: "INSERT INTO access_logs (session_uuid, device_type, mode) VALUES (?, 'mobile', 'vr')",
          args: [SESSION_A],
        },
        {
          sql: "INSERT INTO access_logs (session_uuid, device_type, mode) VALUES (?, 'mobile', '2d')",
          args: [SESSION_A], // latest switch to 2d
        },
        {
          sql: "INSERT INTO surveys (session_uuid, rating, feedback) VALUES (?, 5, 'Excelente')",
          args: [SESSION_A],
        },
        {
          sql: "INSERT INTO surveys (session_uuid, rating, feedback) VALUES (?, 3, NULL)",
          args: [SESSION_B], // no access_logs row -> viewMode null
        },
      ],
      "write",
    );

    const statsHandler = createAdminStatsHandler({
      resolveDb: () => client,
      verifyToken: (h) => verifyAdminBearerToken(h, TEST_JWT_SECRET),
      now: () => fixedNowMs,
    });

    // Unauthorized without Bearer token
    const unauthRes = createMockResponse();
    await statsHandler({ method: "GET", headers: {} }, unauthRes.res);
    expect(unauthRes.getStatus()).toBe(401);

    // Authorized GET
    const token = await signAdminToken(
      { id: 1, username: "admin", role: "admin" },
      TEST_JWT_SECRET,
    );
    const okRes = createMockResponse();
    await statsHandler(
      { method: "GET", headers: { authorization: `Bearer ${token}` } },
      okRes.res,
    );

    expect(okRes.getStatus()).toBe(200);
    const payload = okRes.getBody() as {
      activeSessions: number;
      hourlyAttendance: { labels: string[]; values: number[]; peak: number };
      surveys: Array<{
        id: string;
        rating: number;
        feedback: string;
        viewMode: string | null;
      }>;
      averageRating: number;
      totalSurveys: number;
    };

    expect(payload.activeSessions).toBe(1);
    expect(payload.hourlyAttendance.labels.length).toBe(24);
    expect(payload.hourlyAttendance.values[9]).toBe(1);
    expect(payload.hourlyAttendance.values[11]).toBe(1);
    expect(payload.hourlyAttendance.peak).toBe(1);
    expect(payload.averageRating).toBe(4);
    expect(payload.totalSurveys).toBe(2);
    expect(payload.surveys.length).toBe(2);
    expect(payload.surveys[0].viewMode).toBeNull(); // SESSION_B newest id=2
    expect(payload.surveys[1].viewMode).toBe("2d"); // SESSION_A switched from vr -> 2d
    expect(payload.surveys[1].feedback).toBe("Excelente");
  });

  it("applies 006_telemetry_indexes.sql and provisions admin account via seed-admin.mjs", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-seed-admin-"));
    const dbUrl = pathToFileURL(path.join(tmpDir, "seed.db")).href;

    try {
      await runMigrations({ dbUrl, log: () => {} });
      const seeded = await seedAdminUser({
        dbUrl,
        username: "director",
        password: "strong_password_99",
        role: "admin",
      });
      expect(seeded).toEqual({ username: "director", role: "admin" });

      const verifyDb = createClient({ url: dbUrl });
      const userRes = await verifyDb.execute({
        sql: "SELECT username, password_hash, role FROM users_admin WHERE username = ?",
        args: ["director"],
      });
      expect(userRes.rows.length).toBe(1);
      expect(
        await verifyPassword(
          "strong_password_99",
          String(userRes.rows[0].password_hash),
        ),
      ).toBe(true);

      const idxRes = await verifyDb.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index'",
      );
      const indexNames = idxRes.rows.map((r) => String(r.name));
      expect(indexNames).toContain("idx_visitor_sessions_created_at");
      expect(indexNames).toContain("idx_visitor_sessions_last_ping");
      expect(indexNames).toContain("idx_access_logs_session_id");
      verifyDb.close();
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
  });
});
