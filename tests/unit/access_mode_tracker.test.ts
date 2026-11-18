import { describe, it, expect } from "vitest";
import { ViewMode } from "../../src/navigation/types";
import { SESSION_CONSTANTS } from "../../src/session/constants";
import { AccessModeTracker } from "../../src/session/access-mode-tracker";
import type {
  SessionNetworkFetcher,
  SessionStorageAdapter,
} from "../../src/session/visitor-session-manager";

class MockStorage implements SessionStorageAdapter {
  private readonly store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

class MockFetcher implements SessionNetworkFetcher {
  public readonly calls: Array<{ url: string; body?: unknown }> = [];
  public shouldFail = false;

  public async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.calls.push({ url, body });
    if (this.shouldFail) {
      throw new Error("Network down");
    }
    return { ok: true } as T;
  }
}

describe("AccessModeTracker", () => {
  it("dispatches normalized sessionId, deviceType, and mode to /api/session/access", async () => {
    const storage = new MockStorage();
    storage.setItem(
      SESSION_CONSTANTS.STORAGE_KEY,
      "3F2B8C1E-5A4D-4E7B-9C12-8D6F0A1B2C3D",
    );
    const fetcher = new MockFetcher();
    const tracker = new AccessModeTracker(
      storage,
      fetcher,
      () => SESSION_CONSTANTS.DEVICE_TYPES.MOBILE,
    );

    const vrResult = await tracker.track(ViewMode.VR);
    expect(vrResult).toEqual({ status: "recorded" });

    const touchResult = await tracker.track(ViewMode.TOUCH_2D);
    expect(touchResult).toEqual({ status: "recorded" });

    expect(fetcher.calls).toEqual([
      {
        url: SESSION_CONSTANTS.ENDPOINTS.ACCESS,
        body: {
          sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
          deviceType: "mobile",
          mode: "vr",
        },
      },
      {
        url: SESSION_CONSTANTS.ENDPOINTS.ACCESS,
        body: {
          sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
          deviceType: "mobile",
          mode: "2d",
        },
      },
    ]);
  });

  it("skips network request when visitor sessionId is absent or malformed", async () => {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    const tracker = new AccessModeTracker(storage, fetcher);

    expect(await tracker.track(ViewMode.VR)).toEqual({
      status: "skipped_no_session",
    });
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, "invalid-id");
    expect(await tracker.track(ViewMode.TOUCH_2D)).toEqual({
      status: "skipped_no_session",
    });
    expect(fetcher.calls.length).toBe(0);
  });

  it("suppresses network exceptions gracefully", async () => {
    const storage = new MockStorage();
    storage.setItem(
      SESSION_CONSTANTS.STORAGE_KEY,
      "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
    );
    const fetcher = new MockFetcher();
    fetcher.shouldFail = true;
    const tracker = new AccessModeTracker(storage, fetcher);

    expect(await tracker.track(ViewMode.VR)).toEqual({ status: "failed" });
  });
});
