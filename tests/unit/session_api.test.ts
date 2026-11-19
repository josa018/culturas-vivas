import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let activeClient: Client;

vi.mock("../../api/_db", () => ({
  getDb: () => activeClient,
  ensureSessionsTable: async () => {
    await activeClient.execute("PRAGMA foreign_keys = ON;");
  },
}));

import startHandler from "../../api/session/start";
import pingHandler from "../../api/session/ping";

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

describe("Visitor Session Serverless API (/api/session/start & /api/session/ping)", () => {
  beforeEach(async () => {
    activeClient = createClient({ url: ":memory:" });
    await applyAllMigrations(activeClient);
  });

  afterEach(() => {
    activeClient.close();
  });

  it("POST /api/session/start rejects non-POST methods with 405", async () => {
    const mock = createMockResponse();
    await startHandler({ method: "GET" }, mock.res);
    expect(mock.getStatus()).toBe(405);
  });

  it("POST /api/session/start persists a new UUID v4 visitor_sessions row with ping_count=0", async () => {
    const mock = createMockResponse();
    await startHandler({ method: "POST" }, mock.res);

    expect(mock.getStatus()).toBe(201);
    const payload = mock.getBody() as { sessionId: string };
    expect(payload.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const rows = await activeClient.execute({
      sql: "SELECT id, ping_count FROM visitor_sessions WHERE id = ?",
      args: [payload.sessionId],
    });
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].ping_count)).toBe(0);
  });

  it("POST /api/session/ping rejects non-POST methods with 405", async () => {
    const mock = createMockResponse();
    await pingHandler({ method: "GET" }, mock.res);
    expect(mock.getStatus()).toBe(405);
  });

  it.each([
    { label: "empty object", body: {} },
    { label: "malformed UUID", body: { sessionId: "not-a-uuid" } },
    { label: "UUID v1 instead of v4", body: { sessionId: "123e4567-e89b-12d3-a456-426614174000" } },
    { label: "invalid JSON string", body: "{broken" },
  ])("POST /api/session/ping rejects $label with 400", async ({ body }) => {
    const mock = createMockResponse();
    await pingHandler({ method: "POST", body }, mock.res);
    expect(mock.getStatus()).toBe(400);
  });

  it("POST /api/session/ping returns 404 when sessionId does not exist", async () => {
    const mock = createMockResponse();
    await pingHandler(
      {
        method: "POST",
        body: { sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d" },
      },
      mock.res,
    );

    expect(mock.getStatus()).toBe(404);
    expect(mock.getBody()).toEqual({ error: "Session not found." });
  });

  it("POST /api/session/ping increments ping_count and updates last_ping for an existing session", async () => {
    const sessionId = "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d";
    await activeClient.execute({
      sql: "INSERT INTO visitor_sessions (id, created_at, last_ping, ping_count) VALUES (?, 1000, 1000, 0)",
      args: [sessionId],
    });

    const mock = createMockResponse();
    await pingHandler(
      { method: "POST", body: { sessionId: ` ${sessionId.toUpperCase()} ` } },
      mock.res,
    );

    expect(mock.getStatus()).toBe(200);
    expect(mock.getBody()).toEqual({ ok: true });

    const updated = await activeClient.execute({
      sql: "SELECT ping_count, last_ping FROM visitor_sessions WHERE id = ?",
      args: [sessionId],
    });
    expect(Number(updated.rows[0].ping_count)).toBe(1);
    expect(Number(updated.rows[0].last_ping)).toBeGreaterThan(1000);
  });
});
