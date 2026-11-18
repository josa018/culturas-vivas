import { describe, it, expect, afterEach, vi } from "vitest";
import { ViewMode } from "../../src/navigation/types";
import { SESSION_CONSTANTS } from "../../src/session/constants";
import {
  AccessModeTracker,
  detectCoarseDeviceType,
} from "../../src/session/access-mode-tracker";
import type {
  SessionNetworkFetcher,
  SessionStorageAdapter,
} from "../../src/session/visitor-session-manager";

class InMemorySessionStorage implements SessionStorageAdapter {
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

class StubSessionFetcher implements SessionNetworkFetcher {
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches trimmed lowercase sessionId, deviceType, and mode to /api/session/access", async () => {
    const storage = new InMemorySessionStorage();
    storage.setItem(
      SESSION_CONSTANTS.STORAGE_KEY,
      " 3F2B8C1E-5A4D-4E7B-9C12-8D6F0A1B2C3D ",
    );
    const fetcher = new StubSessionFetcher();
    const tracker = new AccessModeTracker(storage, fetcher, () => "mobile");

    expect(await tracker.track(ViewMode.VR)).toEqual({ status: "recorded" });
    expect(await tracker.track(ViewMode.TOUCH_2D)).toEqual({ status: "recorded" });

    expect(fetcher.calls).toEqual([
      {
        url: "/api/session/access",
        body: {
          sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
          deviceType: "mobile",
          mode: "vr",
        },
      },
      {
        url: "/api/session/access",
        body: {
          sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
          deviceType: "mobile",
          mode: "2d",
        },
      },
    ]);
  });

  it("skips network request when visitor sessionId is absent or malformed", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSessionFetcher();
    const tracker = new AccessModeTracker(storage, fetcher);

    expect(await tracker.track(ViewMode.VR)).toEqual({
      status: "skipped_no_session",
    });

    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, "invalid-id");
    expect(await tracker.track(ViewMode.TOUCH_2D)).toEqual({
      status: "skipped_no_session",
    });
    expect(fetcher.calls).toHaveLength(0);
  });

  it("suppresses network exceptions gracefully", async () => {
    const storage = new InMemorySessionStorage();
    storage.setItem(
      SESSION_CONSTANTS.STORAGE_KEY,
      "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
    );
    const fetcher = new StubSessionFetcher();
    fetcher.shouldFail = true;
    const tracker = new AccessModeTracker(storage, fetcher);

    expect(await tracker.track(ViewMode.VR)).toEqual({ status: "failed" });
  });

  it.each([
    {
      ua: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 OculusBrowser/31.0",
      expected: "vr-headset",
    },
    {
      ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36",
      expected: "mobile",
    },
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
      expected: "desktop",
    },
  ])("detectCoarseDeviceType classifies user agent -> '$expected'", ({ ua, expected }) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
    expect(detectCoarseDeviceType()).toBe(expected);
  });
});
