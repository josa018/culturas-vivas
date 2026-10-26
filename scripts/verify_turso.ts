import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { DB_CONFIG } from "./config/db_config.js";
import { createTursoClient } from "./db/turso_client.js";

interface BenchmarkStep {
  readonly step: string;
  readonly status: "PASS" | "FAIL";
  readonly durationMs: string;
  readonly details: string;
}

async function verifyTurso(): Promise<void> {
  const steps: BenchmarkStep[] = [];
  const client = createTursoClient();

  console.info("[INFO] Initializing Turso libSQL connection test...");

  try {
    // 1. Handshake Connectivity Test
    const t0 = performance.now();
    const pingResult = await client.execute("SELECT 1 AS ping;");
    const pingDuration = (performance.now() - t0).toFixed(2);

    if (pingResult.rows.length === 0 || pingResult.rows[0].ping !== 1) {
      throw new Error("Unexpected handshake response from database.");
    }

    steps.push({
      step: "1. Handshake Ping",
      status: "PASS",
      durationMs: `${pingDuration} ms`,
      details: "Connection established successfully",
    });

    // 2. Schema Migration Application
    const schemaPath = path.resolve(process.cwd(), DB_CONFIG.SCHEMA_FILE_PATH);
    const ddlContent = await fs.readFile(schemaPath, "utf-8");

    const t1 = performance.now();
    await client.executeMultiple(ddlContent);
    const ddlDuration = (performance.now() - t1).toFixed(2);

    steps.push({
      step: "2. Apply Schema DDL",
      status: "PASS",
      durationMs: `${ddlDuration} ms`,
      details: "Applied 'sessions' table and indexes",
    });

    // 3. Transient Record Insertion
    const testUuid = `${DB_CONFIG.TEST_UUID_PREFIX}${randomUUID()}`;
    const t2 = performance.now();

    await client.execute({
      sql: `INSERT INTO ${DB_CONFIG.TABLE_NAME_SESSIONS} (uuid, active) VALUES (?, ?);`,
      args: [testUuid, 1],
    });
    const insertDuration = (performance.now() - t2).toFixed(2);

    steps.push({
      step: "3. Insert Smoke Session",
      status: "PASS",
      durationMs: `${insertDuration} ms`,
      details: `Created record with UUID: ${testUuid.slice(0, 20)}...`,
    });

    // 4. Query and Update Test
    const t3 = performance.now();
    const queryResult = await client.execute({
      sql: `SELECT id, uuid, active FROM ${DB_CONFIG.TABLE_NAME_SESSIONS} WHERE uuid = ?;`,
      args: [testUuid],
    });

    if (queryResult.rows.length === 0) {
      throw new Error(`Record with UUID '${testUuid}' was not found.`);
    }

    await client.execute({
      sql: `UPDATE ${DB_CONFIG.TABLE_NAME_SESSIONS} SET last_ping = CURRENT_TIMESTAMP WHERE uuid = ?;`,
      args: [testUuid],
    });
    const queryUpdateDuration = (performance.now() - t3).toFixed(2);

    steps.push({
      step: "4. Query & Ping Update",
      status: "PASS",
      durationMs: `${queryUpdateDuration} ms`,
      details: "Read and updated last_ping timestamp",
    });

    // 5. Teardown Transient Record
    const t4 = performance.now();
    await client.execute({
      sql: `DELETE FROM ${DB_CONFIG.TABLE_NAME_SESSIONS} WHERE uuid = ?;`,
      args: [testUuid],
    });
    const teardownDuration = (performance.now() - t4).toFixed(2);

    steps.push({
      step: "5. Teardown Smoke Session",
      status: "PASS",
      durationMs: `${teardownDuration} ms`,
      details: "Deleted transient test record",
    });

    console.table(steps);
    console.info(
      "[SUCCESS] Turso database verified and sessions schema active.",
    );
  } catch (error) {
    console.table(steps);
    console.error("[FATAL] Turso verification failed:", error);
    process.exit(1);
  } finally {
    client.close();
  }
}

verifyTurso().catch((error) => {
  console.error("[FATAL] Unhandled execution error:", error);
  process.exit(1);
});
