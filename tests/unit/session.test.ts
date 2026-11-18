import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  VisitorSessionManager,
  type SessionStorageAdapter,
  type SessionNetworkFetcher,
} from "../../src/session/visitor-session-manager";
import { SESSION_CONSTANTS } from "../../src/session/constants";

class InMemorySessionStorage implements SessionStorageAdapter {
  private readonly map = new Map<string, string>();
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

class StubSessionFetcher implements SessionNetworkFetcher {
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
  let activeManager: VisitorSessionManager | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    activeManager?.stop();
    activeManager = null;
    vi.useRealTimers();
  });

  it("generates a new session via /api/session/start and persists it in storage", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSessionFetcher();
    activeManager = new VisitorSessionManager(storage, fetcher, 10_000);

    const sessionId = await activeManager.start();

    expect(sessionId).toBe(fetcher.startResponseId);
    expect(activeManager.getSessionId()).toBe(fetcher.startResponseId);
    expect(storage.getItem(SESSION_CONSTANTS.STORAGE_KEY)).toBe(fetcher.startResponseId);
    expect(fetcher.postCalls).toEqual([
      { url: SESSION_CONSTANTS.ENDPOINTS.START, body: undefined },
    ]);
    expect(activeManager.isTracking()).toBe(true);
  });

  it("reuses existing valid UUID v4 sessionId from storage without calling start", async () => {
    const storage = new InMemorySessionStorage();
    const existingId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, existingId);
    const fetcher = new StubSessionFetcher();
    activeManager = new VisitorSessionManager(storage, fetcher, 10_000);

    const sessionId = await activeManager.start();

    expect(sessionId).toBe(existingId);
    expect(fetcher.postCalls).toEqual([]);
    expect(activeManager.isTracking()).toBe(true);
  });

  it("returns existing sessionId idempotently when start() is called twice while tracking", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSessionFetcher();
    activeManager = new VisitorSessionManager(storage, fetcher, 10_000);

    const first = await activeManager.start();
    const second = await activeManager.start();

    expect(second).toBe(first);
    expect(fetcher.postCalls).toHaveLength(1);
  });

  it("falls back to local UUID v4 generation when /api/session/start fails", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSessionFetcher();
    fetcher.shouldFailStart = true;
    activeManager = new VisitorSessionManager(storage, fetcher, 10_000);

    const sessionId = await activeManager.start();

    expect(sessionId).toMatch(SESSION_CONSTANTS.REGEX.UUID_V4);
    expect(storage.getItem(SESSION_CONSTANTS.STORAGE_KEY)).toBe(sessionId);
  });

  it("replaces malformed stored sessionId by requesting a fresh session", async () => {
    const storage = new InMemorySessionStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, "corrupted-id");
    const fetcher = new StubSessionFetcher();
    activeManager = new VisitorSessionManager(storage, fetcher, 10_000);

    const sessionId = await activeManager.start();

    expect(sessionId).toBe(fetcher.startResponseId);
    expect(fetcher.postCalls).toHaveLength(1);
  });

  it("dispatches periodic heartbeat pings at configured interval and halts on stop()", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSessionFetcher();
    activeManager = new VisitorSessionManager(storage, fetcher, 5_000);

    await activeManager.start();
    expect(fetcher.postCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher.postCalls).toHaveLength(2);
    expect(fetcher.postCalls[1]).toEqual({
      url: SESSION_CONSTANTS.ENDPOINTS.PING,
      body: { sessionId: fetcher.startResponseId },
    });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher.postCalls).toHaveLength(3);

    activeManager.stop();
    expect(activeManager.isTracking()).toBe(false);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher.postCalls).toHaveLength(3);
  });

  it("returns false from sendPing() before start() or when ping fails", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSessionFetcher();
    activeManager = new VisitorSessionManager(storage, fetcher, 10_000);

    expect(await activeManager.sendPing()).toBe(false);
    expect(fetcher.postCalls).toHaveLength(0);

    fetcher.shouldFailPing = true;
    await activeManager.start();
    expect(await activeManager.sendPing()).toBe(false);
  });

  it.each([
    { candidate: "123e4567-e89b-42d3-a456-426614174000", expected: true },
    { candidate: "3F2B8C1E-5A4D-4E7B-9C12-8D6F0A1B2C3D", expected: true },
    { candidate: "123e4567-e89b-12d3-a456-426614174000", expected: false },
    { candidate: "123e4567-e89b-42d3-c456-426614174000", expected: false },
    { candidate: "invalid-uuid-string", expected: false },
  ])("validates UUID v4 format for '$candidate' -> $expected", ({ candidate, expected }) => {
    expect(SESSION_CONSTANTS.REGEX.UUID_V4.test(candidate)).toBe(expected);
  });
});
