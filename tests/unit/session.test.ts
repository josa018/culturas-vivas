import { describe, it, expect } from "vitest";
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

describe("VisitorSessionManager", () => {
  it("generates new session via endpoint and persists in storage", async () => {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    const sessionId = await manager.start();
    expect(sessionId).toBe(fetcher.startResponseId);
    expect(storage.getItem(SESSION_CONSTANTS.STORAGE_KEY)).toBe(
      fetcher.startResponseId
    );
    expect(fetcher.postCalls.length).toBe(1);
    expect(fetcher.postCalls[0].url).toBe(SESSION_CONSTANTS.ENDPOINTS.START);
    expect(manager.isTracking()).toBe(true);

    manager.stop();
    expect(manager.isTracking()).toBe(false);
  });

  it("reuses existing valid session ID from storage without calling start", async () => {
    const storage = new MockStorage();
    const existingId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, existingId);

    const fetcher = new MockFetcher();
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    const sessionId = await manager.start();
    expect(sessionId).toBe(existingId);
    expect(fetcher.postCalls.length).toBe(0);
    expect(manager.isTracking()).toBe(true);

    manager.stop();
  });

  it("falls back to UUID v4 generation when network endpoint fails", async () => {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    fetcher.shouldFailStart = true;
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    const sessionId = await manager.start();
    expect(sessionId).toBeTruthy();
    expect(sessionId).toMatch(SESSION_CONSTANTS.REGEX.UUID_V4);
    expect(storage.getItem(SESSION_CONSTANTS.STORAGE_KEY)).toBe(sessionId);

    manager.stop();
  });

  it("dispatches heartbeat ping with correct payload structure", async () => {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    await manager.start();
    const pingOk = await manager.sendPing();

    expect(pingOk).toBe(true);
    expect(fetcher.postCalls.length).toBe(2);
    const pingCall = fetcher.postCalls[1];
    expect(pingCall.url).toBe(SESSION_CONSTANTS.ENDPOINTS.PING);
    expect(pingCall.body).toEqual({ sessionId: fetcher.startResponseId });

    manager.stop();
  });

  it("handles ping error without uncaught exceptions", async () => {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    fetcher.shouldFailPing = true;
    const manager = new VisitorSessionManager(storage, fetcher, 100);

    await manager.start();
    const pingOk = await manager.sendPing();
    expect(pingOk).toBe(false);

    manager.stop();
  });

  it("validates UUID v4 regex pattern correctly", () => {
    expect(
      SESSION_CONSTANTS.REGEX.UUID_V4.test(
        "123e4567-e89b-42d3-a456-426614174000"
      )
    ).toBe(true);
    expect(
      SESSION_CONSTANTS.REGEX.UUID_V4.test(
        "123e4567-e89b-12d3-a456-426614174000"
      )
    ).toBe(false);
    expect(SESSION_CONSTANTS.REGEX.UUID_V4.test("invalid-uuid-string")).toBe(
      false
    );
  });

  it("validates serverless ping endpoint request method and payload", async () => {
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

    // Rejection of non-POST
    await pingHandler({ method: "GET" }, mockRes);
    expect(statusCode).toBe(405);

    // Rejection of missing sessionId
    await pingHandler({ method: "POST", body: {} }, mockRes);
    expect(statusCode).toBe(400);

    // Rejection of non-UUID v4
    await pingHandler(
      { method: "POST", body: { sessionId: "invalid-uuid" } },
      mockRes
    );
    expect(statusCode).toBe(400);
    expect((jsonBody as { error: string }).error).toContain("Must be UUID v4");
  });

  it("validates serverless start endpoint method rejection", async () => {
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
    expect(statusCode).toBe(405);
  });
});
