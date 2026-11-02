import assert from "node:assert/strict";
import {
  VisitorSessionManager,
  SessionStorageAdapter,
  SessionNetworkFetcher,
} from "../../src/session/visitor-session-manager";
import { SESSION_CONSTANTS } from "../../src/session/constants";

class MockStorage implements SessionStorageAdapter {
  private map = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  public removeItem(key: string): void {
    this.map.delete(key);
  }
}

class MockFetcher implements SessionNetworkFetcher {
  public postCalls: Array<{ url: string; body?: unknown }> = [];
  public startResponseId = "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d";
  public shouldFailStart = false;
  public shouldFailPing = false;

  public async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.postCalls.push({ url, body });

    if (url === SESSION_CONSTANTS.ENDPOINTS.START) {
      if (this.shouldFailStart) {
        throw new Error("Network unreachable");
      }
      return { sessionId: this.startResponseId } as T;
    }

    if (url === SESSION_CONSTANTS.ENDPOINTS.PING) {
      if (this.shouldFailPing) {
        throw new Error("Ping failed");
      }
      return { ok: true } as T;
    }

    throw new Error(`Unexpected URL: ${url}`);
  }
}

async function runSessionTests(): Promise<void> {
  console.log("--- [UNIT TEST] VisitorSessionManager Vertical Slice ---");

  // Test 1: Generate new session via endpoint and store it
  {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    const sessionId = await manager.start();
    assert.equal(sessionId, fetcher.startResponseId, "Session ID should match server response");
    assert.equal(
      storage.getItem(SESSION_CONSTANTS.STORAGE_KEY),
      fetcher.startResponseId,
      "Session ID should be persisted in storage"
    );
    assert.equal(fetcher.postCalls.length, 1, "Should have called start endpoint exactly once");
    assert.equal(fetcher.postCalls[0].url, SESSION_CONSTANTS.ENDPOINTS.START);
    assert.equal(manager.isTracking(), true, "Heartbeat timer should be active");

    manager.stop();
    assert.equal(manager.isTracking(), false, "Heartbeat timer should be inactive after stop()");
    console.log("✓ Test 1 Passed: Initial session acquisition and storage persistence");
  }

  // Test 2: Reuse existing valid session ID from storage without calling start
  {
    const storage = new MockStorage();
    const existingId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, existingId);

    const fetcher = new MockFetcher();
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    const sessionId = await manager.start();
    assert.equal(sessionId, existingId, "Should reuse existing session ID");
    assert.equal(fetcher.postCalls.length, 0, "Must not call start endpoint when ID already in storage");
    assert.equal(manager.isTracking(), true, "Heartbeat timer should be active");

    manager.stop();
    console.log("✓ Test 2 Passed: Existing session reuse without network overhead");
  }

  // Test 3: Fallback UUID v4 generation when network endpoint fails
  {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    fetcher.shouldFailStart = true;
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    const sessionId = await manager.start();
    assert.ok(sessionId, "Fallback session ID must be generated");
    assert.match(
      sessionId,
      SESSION_CONSTANTS.REGEX.UUID_V4,
      "Fallback session ID must conform to UUID v4 pattern"
    );
    assert.equal(
      storage.getItem(SESSION_CONSTANTS.STORAGE_KEY),
      sessionId,
      "Fallback session ID must be persisted in storage"
    );

    manager.stop();
    console.log("✓ Test 3 Passed: Offline and network failure fallback to valid UUID v4");
  }

  // Test 4: Heartbeat ping transmission and payload structure
  {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    await manager.start();
    const pingOk = await manager.sendPing();

    assert.equal(pingOk, true, "Ping should return success");
    assert.equal(fetcher.postCalls.length, 2, "Expected 1 start and 1 manual ping");
    const pingCall = fetcher.postCalls[1];
    assert.equal(pingCall.url, SESSION_CONSTANTS.ENDPOINTS.PING);
    assert.deepEqual(pingCall.body, { sessionId: fetcher.startResponseId });

    manager.stop();
    console.log("✓ Test 4 Passed: Heartbeat ping payload structure and dispatch");
  }

  // Test 5: Error resilience on failed ping
  {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    fetcher.shouldFailPing = true;
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    await manager.start();
    const pingOk = await manager.sendPing();
    assert.equal(pingOk, false, "Ping should return false when endpoint fails, without throwing");

    manager.stop();
    console.log("✓ Test 5 Passed: Ping failure resilience without uncaught exceptions");
  }

  // Test 6: UUID v4 validation regex correctness
  {
    assert.ok(
      SESSION_CONSTANTS.REGEX.UUID_V4.test("123e4567-e89b-42d3-a456-426614174000"),
      "Valid UUID v4 must pass"
    );
    assert.ok(
      !SESSION_CONSTANTS.REGEX.UUID_V4.test("123e4567-e89b-12d3-a456-426614174000"),
      "UUID v1 must fail"
    );
    assert.ok(
      !SESSION_CONSTANTS.REGEX.UUID_V4.test("invalid-uuid-string"),
      "Malformed string must fail"
    );
    console.log("✓ Test 6 Passed: Strict UUID v4 regex pattern validation");
  }

  // Test 7: API ping handler method and input validation
  {
    const pingHandler = (await import("../../api/session/ping")).default;

    let statusCode = 0;
    let jsonBody: unknown = null;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: unknown) => {
            jsonBody = body;
          },
        };
      },
    };

    // Test rejection of non-POST
    await pingHandler({ method: "GET" }, mockRes);
    assert.equal(statusCode, 405, "Non-POST request should return 405");

    // Test rejection of missing sessionId
    await pingHandler({ method: "POST", body: {} }, mockRes);
    assert.equal(statusCode, 400, "Missing sessionId should return 400");

    // Test rejection of non-UUID v4
    await pingHandler({ method: "POST", body: { sessionId: "invalid-uuid" } }, mockRes);
    assert.equal(statusCode, 400, "Malformed sessionId should return 400");
    assert.ok(
      (jsonBody as { error: string }).error.includes("Must be UUID v4"),
      "Error message should indicate UUID v4 requirement"
    );

    console.log("✓ Test 7 Passed: Serverless ping endpoint request and UUID validation");
  }

  // Test 8: API start handler method rejection
  {
    const startHandler = (await import("../../api/session/start")).default;

    let statusCode = 0;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: () => {},
        };
      },
    };

    await startHandler({ method: "PUT" }, mockRes);
    assert.equal(statusCode, 405, "Non-POST request to start should return 405");
    console.log("✓ Test 8 Passed: Serverless start endpoint method validation");
  }

  console.log("All VisitorSessionManager tests passed successfully.");
}

runSessionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
