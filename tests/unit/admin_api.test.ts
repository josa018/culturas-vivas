import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractBearerToken,
  getJwtSecretKey,
  hashPassword,
  signAdminToken,
  verifyAdminBearerToken,
  verifyPassword,
} from "../../api/_auth";
import { createAdminLoginHandler } from "../../api/admin/login";
import { createAdminStatsHandler } from "../../api/admin/stats";
import { createSessionAccessHandler } from "../../api/session/access";

const TEST_JWT_SECRET = "test-secret-minimum-32-bytes-long-for-hs256";
const SESSION_A = "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d";
const SESSION_B = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const SESSION_C = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
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

describe("Admin Auth Helpers (_auth.ts)", () => {
  it("hashes passwords with bcryptjs and verifies matching vs non-matching passwords", async () => {
    const hash = await hashPassword("clave_segura_2026");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("clave_segura_2026", hash)).toBe(true);
    expect(await verifyPassword("otra_clave", hash)).toBe(false);
  });

  it("signs HS256 JWTs and rejects tampered tokens", async () => {
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

    expect(
      await verifyAdminBearerToken(
        { authorization: "Bearer tampered.token.value" },
        TEST_JWT_SECRET,
      ),
    ).toBeNull();
  });

  it("extracts Bearer tokens case-insensitively and ignores malformed headers", () => {
    expect(extractBearerToken({ Authorization: "bearer my-token-123" })).toBe(
      "my-token-123",
    );
    expect(extractBearerToken({ authorization: ["Bearer first-token"] })).toBe(
      "first-token",
    );
    expect(extractBearerToken({ authorization: "Basic abc" })).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("validates JWT secret length and presence", () => {
    expect(() => getJwtSecretKey("")).toThrow("ADMIN_JWT_SECRET is not defined");
    expect(() => getJwtSecretKey("too-short")).toThrow("at least 32 bytes");
    expect(getJwtSecretKey(TEST_JWT_SECRET).byteLength).toBeGreaterThanOrEqual(32);
  });
});

describe("Admin Login, Access Logs & Stats API", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await applyAllMigrations(client);
  });

  afterEach(() => {
    client.close();
  });

  describe("POST /api/admin/login", () => {
    it("rejects non-POST methods with 405", async () => {
      const loginHandler = createAdminLoginHandler({
        resolveDb: () => client,
        signToken: (u) => signAdminToken(u, TEST_JWT_SECRET),
      });
      const mock = createMockResponse();

      await loginHandler({ method: "GET" }, mock.res);
      expect(mock.getStatus()).toBe(405);
    });

    it.each([
      { label: "non-object body", body: "not-json" },
      { label: "empty username", body: { username: "   ", password: "secret" } },
      { label: "missing password", body: { username: "biblio_admin" } },
    ])("rejects $label with 400", async ({ body }) => {
      const loginHandler = createAdminLoginHandler({
        resolveDb: () => client,
        signToken: (u) => signAdminToken(u, TEST_JWT_SECRET),
      });
      const mock = createMockResponse();

      await loginHandler({ method: "POST", body }, mock.res);
      expect(mock.getStatus()).toBe(400);
    });

    it("returns 401 for unknown username or incorrect password", async () => {
      const hash = await hashPassword("secret_pass_123");
      await client.execute({
        sql: "INSERT INTO users_admin (username, password_hash, role) VALUES (?, ?, ?)",
        args: ["biblio_admin", hash, "admin"],
      });

      const loginHandler = createAdminLoginHandler({
        resolveDb: () => client,
        signToken: (u) => signAdminToken(u, TEST_JWT_SECRET),
      });

      const unknownUserRes = createMockResponse();
      await loginHandler(
        { method: "POST", body: { username: "ghost", password: "secret_pass_123" } },
        unknownUserRes.res,
      );
      expect(unknownUserRes.getStatus()).toBe(401);

      const wrongPassRes = createMockResponse();
      await loginHandler(
        { method: "POST", body: { username: "biblio_admin", password: "wrong" } },
        wrongPassRes.res,
      );
      expect(wrongPassRes.getStatus()).toBe(401);
    });

    it("authenticates valid credentials with trimmed username and returns signed JWT", async () => {
      const hash = await hashPassword("secret_pass_123");
      await client.execute({
        sql: "INSERT INTO users_admin (username, password_hash, role) VALUES (?, ?, ?)",
        args: ["biblio_admin", hash, "admin"],
      });

      const loginHandler = createAdminLoginHandler({
        resolveDb: () => client,
        signToken: (u) => signAdminToken(u, TEST_JWT_SECRET),
      });

      const mock = createMockResponse();
      await loginHandler(
        {
          method: "POST",
          body: { username: " biblio_admin ", password: "secret_pass_123" },
        },
        mock.res,
      );

      expect(mock.getStatus()).toBe(200);
      const payload = mock.getBody() as {
        token: string;
        user: { username: string; role: string };
      };
      expect(payload.user).toEqual({ username: "biblio_admin", role: "admin" });

      const verified = await verifyAdminBearerToken(
        { authorization: `Bearer ${payload.token}` },
        TEST_JWT_SECRET,
      );
      expect(verified?.username).toBe("biblio_admin");
      expect(verified?.role).toBe("admin");
    });
  });

  describe("POST /api/session/access", () => {
    it("rejects non-POST methods with 405", async () => {
      const handler = createSessionAccessHandler(() => client);
      const mock = createMockResponse();
      await handler({ method: "GET" }, mock.res);
      expect(mock.getStatus()).toBe(405);
    });

    it.each([
      { label: "non-object body", body: [] },
      { label: "malformed sessionId", body: { sessionId: "bad", deviceType: "mobile", mode: "vr" } },
      { label: "unsupported mode", body: { sessionId: SESSION_A, deviceType: "mobile", mode: "3d" } },
      { label: "empty deviceType", body: { sessionId: SESSION_A, deviceType: "   ", mode: "vr" } },
      {
        label: "oversized deviceType",
        body: { sessionId: SESSION_A, deviceType: "x".repeat(65), mode: "2d" },
      },
    ])("rejects $label with 400", async ({ body }) => {
      const handler = createSessionAccessHandler(() => client);
      const mock = createMockResponse();
      await handler({ method: "POST", body }, mock.res);
      expect(mock.getStatus()).toBe(400);
    });

    it("returns 404 when sessionId does not exist in visitor_sessions", async () => {
      const handler = createSessionAccessHandler(() => client);
      const mock = createMockResponse();
      await handler(
        {
          method: "POST",
          body: { sessionId: MISSING_SESSION, deviceType: "mobile", mode: "vr" },
        },
        mock.res,
      );
      expect(mock.getStatus()).toBe(404);
    });

    it("persists access log entry for an existing visitor session (201)", async () => {
      const now = Date.now();
      await client.execute({
        sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 0)",
        args: [SESSION_A, now, now],
      });

      const handler = createSessionAccessHandler(() => client);
      const mock = createMockResponse();
      await handler(
        {
          method: "POST",
          body: {
            sessionId: SESSION_A.toUpperCase(),
            deviceType: " mobile ",
            mode: "vr",
          },
        },
        mock.res,
      );

      expect(mock.getStatus()).toBe(201);
      const logs = await client.execute(
        "SELECT session_uuid, device_type, mode FROM access_logs",
      );
      expect(logs.rows).toHaveLength(1);
      expect(logs.rows[0].session_uuid).toBe(SESSION_A);
      expect(logs.rows[0].device_type).toBe("mobile");
      expect(logs.rows[0].mode).toBe("vr");
    });
  });

  describe("GET /api/admin/stats", () => {
    it("rejects non-GET methods with 405", async () => {
      const handler = createAdminStatsHandler({
        resolveDb: () => client,
        verifyToken: (h) => verifyAdminBearerToken(h, TEST_JWT_SECRET),
      });
      const mock = createMockResponse();
      await handler({ method: "POST", headers: {} }, mock.res);
      expect(mock.getStatus()).toBe(405);
    });

    it("returns 401 when Bearer token is missing or invalid", async () => {
      const handler = createAdminStatsHandler({
        resolveDb: () => client,
        verifyToken: (h) => verifyAdminBearerToken(h, TEST_JWT_SECRET),
      });
      const mock = createMockResponse();
      await handler({ method: "GET", headers: {} }, mock.res);
      expect(mock.getStatus()).toBe(401);
    });

    it("aggregates active sessions, UTC-7 24h buckets across UTC midnight, average rating, and joined viewMode", async () => {
      // Fixed museum clock: 2026-11-17 18:30:00 UTC-7 = 2026-11-18T01:30:00Z
      const fixedNowMs = Date.UTC(2026, 10, 18, 1, 30, 0);
      const hour18Ms = Date.UTC(2026, 10, 18, 1, 10, 0); // 18:10 UTC-7 on Nov 17
      const hour09Ms = Date.UTC(2026, 10, 17, 16, 5, 0); // 09:05 UTC-7 on Nov 17
      const prevDayMs = Date.UTC(2026, 10, 17, 6, 59, 0); // 23:59 UTC-7 on Nov 16 (excluded)

      await client.batch(
        [
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 2)",
            args: [SESSION_A, hour18Ms, fixedNowMs - 5_000], // active (< 30s)
          },
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: [SESSION_B, hour09Ms, fixedNowMs - 90_000], // inactive (> 30s)
          },
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: [SESSION_C, prevDayMs, prevDayMs], // previous museum day
          },
          {
            sql: "INSERT INTO access_logs (session_uuid, device_type, mode) VALUES (?, 'mobile', 'vr')",
            args: [SESSION_A],
          },
          {
            sql: "INSERT INTO access_logs (session_uuid, device_type, mode) VALUES (?, 'mobile', '2d')",
            args: [SESSION_A],
          },
          {
            sql: "INSERT INTO surveys (session_uuid, rating, feedback) VALUES (?, 5, 'Excelente')",
            args: [SESSION_A],
          },
          {
            sql: "INSERT INTO surveys (session_uuid, rating, feedback) VALUES (?, 3, NULL)",
            args: [SESSION_B],
          },
        ],
        "write",
      );

      const handler = createAdminStatsHandler({
        resolveDb: () => client,
        verifyToken: (h) => verifyAdminBearerToken(h, TEST_JWT_SECRET),
        now: () => fixedNowMs,
      });

      const token = await signAdminToken(
        { id: 1, username: "admin", role: "admin" },
        TEST_JWT_SECRET,
      );
      const mock = createMockResponse();
      await handler(
        { method: "GET", headers: { authorization: `Bearer ${token}` } },
        mock.res,
      );

      expect(mock.getStatus()).toBe(200);
      const payload = mock.getBody() as {
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
      expect(payload.hourlyAttendance.labels).toHaveLength(24);
      expect(payload.hourlyAttendance.values[9]).toBe(1);
      expect(payload.hourlyAttendance.values[18]).toBe(1);
      expect(payload.hourlyAttendance.values.reduce((a, b) => a + b, 0)).toBe(2);
      expect(payload.hourlyAttendance.peak).toBe(1);
      expect(payload.averageRating).toBe(4);
      expect(payload.totalSurveys).toBe(2);
      expect(payload.surveys).toHaveLength(2);
      expect(payload.surveys[0].viewMode).toBeNull();
      expect(payload.surveys[1].viewMode).toBe("2d");
      expect(payload.surveys[1].feedback).toBe("Excelente");
    });

    it("aggregates week (7 days), month (30 days), and year (12 months) ranges in UTC-7", async () => {
      // Museum clock: 2026-01-10 18:00:00 UTC-7 = 2026-01-11T01:00:00Z
      const fixedNowMs = Date.UTC(2026, 0, 11, 1, 0, 0);
      const sixDaysAgoMs = Date.UTC(2026, 0, 4, 20, 0, 0); // 2026-01-04 13:00 UTC-7 (in week & month)
      const twentyDaysAgoMs = Date.UTC(2025, 11, 21, 19, 0, 0); // 2025-12-21 12:00 UTC-7 (month + year Dec 25)
      const prevYearMs = Date.UTC(2025, 1, 15, 19, 0, 0); // 2025-02-15 12:00 UTC-7 (year Feb 25)
      const outsideYearMs = Date.UTC(2025, 0, 15, 19, 0, 0); // 2025-01-15 12:00 UTC-7 (excluded from 12-month window)

      await client.batch(
        [
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: [SESSION_A, fixedNowMs - 60_000, fixedNowMs],
          },
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: [SESSION_B, sixDaysAgoMs, sixDaysAgoMs],
          },
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: [SESSION_C, twentyDaysAgoMs, twentyDaysAgoMs],
          },
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: ["00000000-0000-4000-8000-000000000004", prevYearMs, prevYearMs],
          },
          {
            sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
            args: ["00000000-0000-4000-8000-000000000005", outsideYearMs, outsideYearMs],
          },
        ],
        "write",
      );

      const handler = createAdminStatsHandler({
        resolveDb: () => client,
        verifyToken: (h) => verifyAdminBearerToken(h, TEST_JWT_SECRET),
        now: () => fixedNowMs,
      });
      const token = await signAdminToken(
        { id: 1, username: "admin", role: "admin" },
        TEST_JWT_SECRET,
      );

      // Week (7 days: Jan 4..Jan 10)
      const weekMock = createMockResponse();
      await handler(
        {
          method: "GET",
          url: "/api/admin/stats?range=week",
          headers: { authorization: `Bearer ${token}` },
        },
        weekMock.res,
      );
      expect(weekMock.getStatus()).toBe(200);
      const weekBody = weekMock.getBody() as {
        range: string;
        hourlyAttendance: { labels: string[]; values: number[]; peak: number };
      };
      expect(weekBody.range).toBe("week");
      expect(weekBody.hourlyAttendance.labels).toHaveLength(7);
      expect(weekBody.hourlyAttendance.values[0]).toBe(1); // Jan 4
      expect(weekBody.hourlyAttendance.values[6]).toBe(1); // Jan 10
      expect(
        weekBody.hourlyAttendance.values.reduce((a, b) => a + b, 0),
      ).toBe(2);

      // Month (30 days)
      const monthMock = createMockResponse();
      await handler(
        {
          method: "GET",
          query: { range: "month" },
          headers: { authorization: `Bearer ${token}` },
        },
        monthMock.res,
      );
      const monthBody = monthMock.getBody() as {
        range: string;
        hourlyAttendance: { labels: string[]; values: number[]; peak: number };
      };
      expect(monthBody.range).toBe("month");
      expect(monthBody.hourlyAttendance.labels).toHaveLength(30);
      expect(
        monthBody.hourlyAttendance.values.reduce((a, b) => a + b, 0),
      ).toBe(3);

      // Year (12 months: Feb 2025..Jan 2026)
      const yearMock = createMockResponse();
      await handler(
        {
          method: "GET",
          query: { range: "year" },
          headers: { authorization: `Bearer ${token}` },
        },
        yearMock.res,
      );
      const yearBody = yearMock.getBody() as {
        range: string;
        hourlyAttendance: { labels: string[]; values: number[]; peak: number };
      };
      expect(yearBody.range).toBe("year");
      expect(yearBody.hourlyAttendance.labels).toHaveLength(12);
      expect(yearBody.hourlyAttendance.values[0]).toBe(1); // Feb 2025
      expect(yearBody.hourlyAttendance.values[10]).toBe(1); // Dec 2025
      expect(yearBody.hourlyAttendance.values[11]).toBe(2); // Jan 2026 (fixedNowMs + sixDaysAgoMs)
      expect(yearBody.hourlyAttendance.peak).toBe(2);

      // Invalid range falls back safely to day (24h)
      const invalidMock = createMockResponse();
      await handler(
        {
          method: "GET",
          query: { range: "invalid" },
          headers: { authorization: `Bearer ${token}` },
        },
        invalidMock.res,
      );
      const invalidBody = invalidMock.getBody() as {
        range: string;
        hourlyAttendance: { labels: string[]; values: number[]; peak: number };
      };
      expect(invalidBody.range).toBe("day");
      expect(invalidBody.hourlyAttendance.labels).toHaveLength(24);
    });

    it("supports server-backed survey filtering, sorting, and pagination (10 per page) while preserving global average", async () => {
      const fixedNowMs = Date.UTC(2026, 10, 18, 18, 0, 0);
      const setupStatements: Array<{ sql: string; args: (string | number | null)[] }> = [];

      // Insert 12 distinct visitor_sessions (1 survey per session) across vr (1..7), 2d (8..10), and unknown (11..12)
      for (let i = 1; i <= 12; i += 1) {
        const sessionId = `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`;
        setupStatements.push({
          sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 1)",
          args: [sessionId, fixedNowMs, fixedNowMs],
        });
        if (i <= 7) {
          setupStatements.push({
            sql: "INSERT INTO access_logs (session_uuid, device_type, mode) VALUES (?, 'headset', 'vr')",
            args: [sessionId],
          });
        } else if (i <= 10) {
          setupStatements.push({
            sql: "INSERT INTO access_logs (session_uuid, device_type, mode) VALUES (?, 'mobile', '2d')",
            args: [sessionId],
          });
        }
        const rating = i % 2 === 0 ? 5 : i === 3 ? 2 : 4;
        const feedback = i % 3 === 0 ? `Comentario ${i}` : null;
        setupStatements.push({
          sql: "INSERT INTO surveys (session_uuid, rating, feedback) VALUES (?, ?, ?)",
          args: [sessionId, rating, feedback],
        });
      }
      await client.batch(setupStatements, "write");

      const handler = createAdminStatsHandler({
        resolveDb: () => client,
        verifyToken: (h) => verifyAdminBearerToken(h, TEST_JWT_SECRET),
        now: () => fixedNowMs,
      });
      const token = await signAdminToken(
        { id: 1, username: "admin", role: "admin" },
        TEST_JWT_SECRET,
      );

      // Default page 1 => 10 items, totalItems 12, totalPages 2
      const page1Mock = createMockResponse();
      await handler(
        {
          method: "GET",
          url: "/api/admin/stats",
          headers: { authorization: `Bearer ${token}` },
        },
        page1Mock.res,
      );
      const page1Body = page1Mock.getBody() as {
        surveys: Array<{ id: string; rating: number; viewMode: string | null }>;
        totalSurveys: number;
        averageRating: number;
        surveysPagination: {
          page: number;
          pageSize: number;
          totalItems: number;
          totalPages: number;
        };
      };
      expect(page1Body.surveys).toHaveLength(10);
      expect(page1Body.surveysPagination).toEqual({
        page: 1,
        pageSize: 10,
        totalItems: 12,
        totalPages: 2,
      });
      expect(page1Body.totalSurveys).toBe(12);

      // Page 2 => remaining 2 oldest surveys
      const page2Mock = createMockResponse();
      await handler(
        {
          method: "GET",
          url: "/api/admin/stats?surveyPage=2",
          headers: { authorization: `Bearer ${token}` },
        },
        page2Mock.res,
      );
      const page2Body = page2Mock.getBody() as {
        surveys: Array<{ id: string }>;
        surveysPagination: { page: number; totalItems: number; totalPages: number };
      };
      expect(page2Body.surveys).toHaveLength(2);
      expect(page2Body.surveysPagination.page).toBe(2);

      // Filter by VR + feedback only + sort oldest, preserving global averageRating
      const filteredMock = createMockResponse();
      await handler(
        {
          method: "GET",
          url: "/api/admin/stats?surveyMode=vr&surveyHasFeedback=1&surveySort=rating_asc",
          headers: { authorization: `Bearer ${token}` },
        },
        filteredMock.res,
      );
      const filteredBody = filteredMock.getBody() as {
        surveys: Array<{ id: string; rating: number; feedback: string; viewMode: string | null }>;
        averageRating: number;
        totalSurveys: number;
        surveysPagination: { page: number; totalItems: number; totalPages: number };
      };
      // Session A has i=1..7 -> with comment i%3===0 => i=3 (rating 2) and i=6 (rating 5)
      expect(filteredBody.surveys).toHaveLength(2);
      expect(filteredBody.surveys[0].rating).toBe(2);
      expect(filteredBody.surveys[1].rating).toBe(5);
      expect(filteredBody.surveys.every((s) => s.viewMode === "vr" && s.feedback.length > 0)).toBe(true);
      expect(filteredBody.surveysPagination.totalItems).toBe(2);
      expect(filteredBody.totalSurveys).toBe(12);
      expect(filteredBody.averageRating).toBe(page1Body.averageRating);
    });
  });
});
