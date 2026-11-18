import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSurveySubmitHandler } from "../../api/survey/submit";
import { SURVEY_CONSTANTS } from "../../src/survey/constants";

async function applyMigrationsToClient(client: Client): Promise<void> {
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

const VALID_SESSION_ID = "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d";
const MISSING_SESSION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("POST /api/survey/submit & Schema Migrations", () => {
  let client: Client;
  let handler: ReturnType<typeof createSurveySubmitHandler>;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await applyMigrationsToClient(client);
    const now = Date.now();
    await client.execute({
      sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, ?, ?, 0)",
      args: [VALID_SESSION_ID, now, now],
    });
    handler = createSurveySubmitHandler(() => client);
  });

  afterEach(() => {
    client.close();
  });

  it("rejects non-POST methods with 405", async () => {
    const { res, getStatus } = createMockResponse();
    await handler({ method: "GET" }, res);
    expect(getStatus()).toBe(405);
  });

  it("rejects non-object bodies, malformed sessionId, invalid rating, and oversized feedback with 400", async () => {
    const invalidPayloads: unknown[] = [
      "not-json",
      [],
      { sessionId: "bad-uuid", rating: 5 },
      { sessionId: VALID_SESSION_ID, rating: 0 },
      { sessionId: VALID_SESSION_ID, rating: 6 },
      { sessionId: VALID_SESSION_ID, rating: 4.2 },
      { sessionId: VALID_SESSION_ID, rating: "5" },
      { sessionId: VALID_SESSION_ID, rating: 5, feedback: 123 },
      {
        sessionId: VALID_SESSION_ID,
        rating: 5,
        feedback: "x".repeat(SURVEY_CONSTANTS.FEEDBACK.MAX_LENGTH + 1),
      },
    ];

    for (const payload of invalidPayloads) {
      const { res, getStatus } = createMockResponse();
      await handler({ method: "POST", body: payload }, res);
      expect(getStatus()).toBe(400);
    }
  });

  it("returns 404 when sessionId does not exist in visitor_sessions", async () => {
    const { res, getStatus, getBody } = createMockResponse();
    await handler(
      {
        method: "POST",
        body: { sessionId: MISSING_SESSION_ID, rating: 5 },
      },
      res,
    );

    expect(getStatus()).toBe(404);
    expect(getBody()).toEqual({ error: "Session not found." });

    const countRes = await client.execute("SELECT COUNT(*) AS cnt FROM surveys");
    expect(Number(countRes.rows[0].cnt)).toBe(0);
  });

  it("persists single-question survey with trimmed feedback for existing visitor_sessions row (201) and blocks duplicate (409)", async () => {
    const first = createMockResponse();
    await handler(
      {
        method: "POST",
        body: JSON.stringify({
          sessionId: VALID_SESSION_ID.toUpperCase(),
          rating: 4,
          feedback: "  Gran recorrido cultural  ",
        }),
      },
      first.res,
    );

    expect(first.getStatus()).toBe(201);
    expect(first.getBody()).toEqual({ ok: true });

    const saved = await client.execute({
      sql: "SELECT session_uuid, rating, feedback FROM surveys WHERE session_uuid = ?",
      args: [VALID_SESSION_ID],
    });
    expect(saved.rows.length).toBe(1);
    expect(saved.rows[0].rating).toBe(4);
    expect(saved.rows[0].feedback).toBe("Gran recorrido cultural");

    // Duplicate submission must return 409
    const duplicate = createMockResponse();
    await handler(
      {
        method: "POST",
        body: { sessionId: VALID_SESSION_ID, rating: 5 },
      },
      duplicate.res,
    );

    expect(duplicate.getStatus()).toBe(409);
  });

  it("enforces foreign key integrity and drops legacy idx_surveys_session_uuid", async () => {
    const idxCheck = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'surveys'",
    );
    const indexNames = idxCheck.rows.map((r) => String(r.name));
    expect(indexNames).toContain("ux_surveys_session_uuid");
    expect(indexNames).not.toContain("idx_surveys_session_uuid");

    await expect(
      client.execute({
        sql: "INSERT INTO surveys (session_uuid, rating, feedback) VALUES (?, ?, NULL)",
        args: [MISSING_SESSION_ID, 5],
      }),
    ).rejects.toThrow();
  });
});
