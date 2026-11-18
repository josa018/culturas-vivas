import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("chart.js", () => {
  class MockChart {
    static register = vi.fn();
    data: { labels: string[]; datasets: Array<{ data: number[] }> };
    update = vi.fn();
    destroy = vi.fn();

    constructor(
      _canvas: unknown,
      config: { data: { labels: string[]; datasets: Array<{ data: number[] }> } },
    ) {
      this.data = config.data;
    }
  }
  return {
    Chart: MockChart,
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    LinearScale: class {},
    Tooltip: class {},
  };
});

import {
  ADMIN_AUTH_CONSTANTS,
  AdminAuthStore,
  ADMIN_DASHBOARD_CONSTANTS,
  AdminDashboardStore,
  AdminHttpError,
  type AdminNetworkFetcher,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  AdminLoginModalView,
  AdminHeaderWidget,
  SurveysTableWidget,
  AttendanceChartWidget,
  AdminController,
} from "../../src/admin/index";
import type { StorageAdapter } from "../../src/navigation/index";

class InMemoryStorage implements StorageAdapter {
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

class StubAdminFetcher implements AdminNetworkFetcher {
  public getCalls: Array<{ url: string; headers?: Record<string, string> }> = [];
  public postCalls: Array<{ url: string; body?: unknown }> = [];
  public loginResult:
    | { token: string; user: { username: string; role: string } }
    | Error
    | Record<string, unknown> = {
    token: "signed.jwt.token",
    user: { username: "bibliotecario", role: "librarian" },
  };
  public statsResult: unknown | Error = {
    activeSessions: 4,
    hourlyAttendance: {
      labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
      values: Array.from({ length: 24 }, (_, idx) => (idx === 11 ? 9 : 1)),
      peak: 9,
    },
    surveys: [
      {
        id: "1",
        timestamp: 1794939780000,
        rating: 5,
        feedback: "Excelente",
        viewMode: "vr",
      },
      {
        id: "2",
        timestamp: 1794939700000,
        rating: 2,
        feedback: "",
        viewMode: "2d",
      },
      {
        id: "3",
        timestamp: 1794939600000,
        rating: 4,
        feedback: "",
        viewMode: null,
      },
    ],
    averageRating: 3.7,
  };

  public async get<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<T> {
    this.getCalls.push({ url, headers });
    if (this.statsResult instanceof Error) {
      throw this.statsResult;
    }
    return this.statsResult as T;
  }

  public async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.postCalls.push({ url, body });
    if (this.loginResult instanceof Error) {
      throw this.loginResult;
    }
    return this.loginResult as T;
  }
}

describe("AdminAuthStore", () => {
  it("rejects blank username or empty password locally without network request", async () => {
    const fetcher = new StubAdminFetcher();
    const store = new AdminAuthStore(new InMemoryStorage(), fetcher);

    expect(await store.login({ username: "   ", password: "abc" })).toBe(false);
    expect(await store.login({ username: "admin", password: "" })).toBe(false);
    expect(store.getLastError()).toBe("invalid_credentials");
    expect(fetcher.postCalls).toHaveLength(0);
  });

  it("classifies 401/400 as invalid_credentials and 404/500/malformed payload as service_unavailable", async () => {
    const fetcher = new StubAdminFetcher();
    const store = new AdminAuthStore(new InMemoryStorage(), fetcher);

    fetcher.loginResult = new AdminHttpError(401, "Invalid credentials");
    expect(await store.login({ username: "admin", password: "wrong" })).toBe(false);
    expect(store.getLastError()).toBe("invalid_credentials");

    fetcher.loginResult = new AdminHttpError(500, "Server error");
    expect(await store.login({ username: "admin", password: "secret" })).toBe(false);
    expect(store.getLastError()).toBe("service_unavailable");

    fetcher.loginResult = { token: "", user: { username: "admin", role: "admin" } };
    expect(await store.login({ username: "admin", password: "secret" })).toBe(false);
    expect(store.getLastError()).toBe("service_unavailable");
  });

  it("persists authenticated JWT session, restores on reload, and clears on logout", async () => {
    const storage = new InMemoryStorage();
    const fetcher = new StubAdminFetcher();
    fetcher.loginResult = {
      token: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      user: { username: "bibliotecario", role: "librarian" },
    };

    const store = new AdminAuthStore(storage, fetcher);
    const states: boolean[] = [];
    const unsub = store.subscribe((state) => states.push(state.isAuthenticated));

    expect(
      await store.login({ username: " bibliotecario ", password: "secret" }),
    ).toBe(true);
    expect(fetcher.postCalls[0]).toEqual({
      url: "/api/admin/login",
      body: { username: "bibliotecario", password: "secret" },
    });
    expect(states).toEqual([true]);

    const reloaded = new AdminAuthStore(storage, fetcher);
    expect(reloaded.getState()).toEqual({
      isAuthenticated: true,
      token: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      user: { username: "bibliotecario", role: "librarian" },
    });

    unsub();
    store.logout();
    expect(store.getState().isAuthenticated).toBe(false);
    expect(storage.getItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY)).toBeNull();
  });

  it("falls back to unauthenticated state when persisted storage JSON is corrupted", () => {
    const storage = new InMemoryStorage();
    storage.setItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY, "{bad-json");

    const store = new AdminAuthStore(storage, new StubAdminFetcher());
    expect(store.getState()).toEqual({
      isAuthenticated: false,
      token: null,
      user: null,
    });
  });
});

describe("AdminDashboardStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes empty without mocked data before fetching", () => {
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher: new StubAdminFetcher(),
    });

    expect(store.getState().surveys).toEqual([]);
    expect(store.getState().connected).toBe(false);
    expect(store.getAverageRating()).toBe(0);
    expect(store.getDailyPeak()).toBe(0);
    expect(store.getState().hourlyAttendance.labels).toHaveLength(24);
    expect(store.getState().hourlyAttendance.values.every((v) => v === 0)).toBe(true);
  });

  it("hydrates stats from /api/admin/stats with Bearer authorization", async () => {
    const fetcher = new StubAdminFetcher();
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token-123",
      fetcher,
    });

    await store.fetchStats();

    expect(fetcher.getCalls[0]).toEqual({
      url: "/api/admin/stats",
      headers: { Authorization: "Bearer jwt-token-123" },
    });
    expect(store.getState().connected).toBe(true);
    expect(store.getState().activeVisitorsCount).toBe(4);
    expect(store.getDailyPeak()).toBe(9);
    expect(store.getAverageRating()).toBe(3.7);
    expect(store.getState().surveys).toHaveLength(3);
  });

  it("invokes onUnauthorized and stops polling on missing token or 401 response", async () => {
    const fetcher = new StubAdminFetcher();
    let unauthorizedCount = 0;
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
      onUnauthorized: () => {
        unauthorizedCount++;
      },
      pollIntervalMs: 5000,
    });

    store.startPolling();
    await Promise.resolve();
    expect(store.isPolling()).toBe(true);

    fetcher.statsResult = new AdminHttpError(401, "Expired");
    await store.fetchStats();

    expect(store.getState().connected).toBe(false);
    expect(store.isPolling()).toBe(false);
    expect(unauthorizedCount).toBe(1);

    const noTokenStore = new AdminDashboardStore({
      getToken: () => null,
      fetcher,
      onUnauthorized: () => {
        unauthorizedCount++;
      },
    });
    await noTokenStore.fetchStats();
    expect(unauthorizedCount).toBe(2);
  });

  it("marks disconnected without triggering onUnauthorized on transient 500 or malformed payload", async () => {
    const fetcher = new StubAdminFetcher();
    let unauthorizedCount = 0;
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
      onUnauthorized: () => {
        unauthorizedCount++;
      },
    });

    fetcher.statsResult = new AdminHttpError(500, "Timeout");
    await store.fetchStats();
    expect(store.getState().connected).toBe(false);
    expect(unauthorizedCount).toBe(0);

    fetcher.statsResult = { activeSessions: -5 };
    await store.fetchStats();
    expect(store.getState().connected).toBe(false);
    expect(unauthorizedCount).toBe(0);
  });

  it("polls periodically at pollIntervalMs and stops cleanly on stopPolling()", async () => {
    const fetcher = new StubAdminFetcher();
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
      pollIntervalMs: 5000,
    });

    store.startPolling();
    expect(fetcher.getCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher.getCalls).toHaveLength(2);

    store.stopPolling();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher.getCalls).toHaveLength(2);
  });
});

describe("Admin UI Widgets & AdminController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("AttendanceChartWidget syncs labels, values, peak badge, and connection status", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher: new StubAdminFetcher(),
    });

    const chartWidget = new AttendanceChartWidget(store);
    chartWidget.mount(parent);

    const el = chartWidget.getElement()!;
    const statusEl = el.querySelector(
      '[data-admin-metric="connection-status"]',
    ) as HTMLElement;
    expect(statusEl.classList.contains(ADMIN_UI_CLASSES.CONNECTION_OFFLINE)).toBe(true);
    expect(statusEl.textContent).toBe(ADMIN_UI_TEXT.CONNECTION_OFFLINE);

    await store.fetchStats();

    expect(statusEl.classList.contains(ADMIN_UI_CLASSES.CONNECTION_ONLINE)).toBe(true);
    expect(statusEl.textContent).toBe(ADMIN_UI_TEXT.CONNECTION_ONLINE);

    const chart = chartWidget.getChartInstance() as unknown as {
      data: { labels: string[]; datasets: Array<{ data: number[] }> };
      update: ReturnType<typeof vi.fn>;
    };
    expect(chart.data.labels).toHaveLength(24);
    expect(chart.data.datasets[0].data[11]).toBe(9);
    expect(chart.update).toHaveBeenCalled();

    const peakBadge = el.querySelector(
      `.${ADMIN_UI_CLASSES.CHART_PEAK_BADGE}`,
    ) as HTMLElement;
    expect(peakBadge.textContent).toContain("9");

    chartWidget.unmount();
  });

  it("SurveysTableWidget renders empty state and vr / 2d / null modalities with stars and fallback", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher: new StubAdminFetcher(),
    });

    const tableWidget = new SurveysTableWidget(store);
    tableWidget.mount(parent);
    const tbody = tableWidget.getElement()!.querySelector("tbody")!;

    expect(tbody.children).toHaveLength(1);
    expect(tbody.textContent).toContain(ADMIN_UI_TEXT.NO_SURVEYS);

    await store.fetchStats();
    expect(tbody.children).toHaveLength(3);
    expect(tbody.children[0].children[1].textContent).toBe(ADMIN_UI_TEXT.VIEW_MODE_VR);
    expect(tbody.children[0].children[2].textContent).toBe("★★★★★");
    expect(tbody.children[0].children[3].textContent).toBe("Excelente");

    expect(tbody.children[1].children[1].textContent).toBe(ADMIN_UI_TEXT.VIEW_MODE_2D);
    expect(tbody.children[1].children[2].textContent).toBe("★★☆☆☆");
    expect(tbody.children[1].children[3].textContent).toBe(ADMIN_UI_TEXT.FEEDBACK_EMPTY);

    expect(tbody.children[2].children[1].textContent).toBe(ADMIN_UI_TEXT.VIEW_MODE_UNKNOWN);

    tableWidget.unmount();
  });

  it("AdminLoginModalView disables submit while pending and invokes onLoginSuccess on resolution", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    let resolveLogin: (value: unknown) => void = () => {};
    const fetcher: AdminNetworkFetcher = {
      get: async <T = unknown>() => ({}) as T,
      post: async <T = unknown>() =>
        (await new Promise<unknown>((resolve) => {
          resolveLogin = resolve;
        })) as T,
    };

    const authStore = new AdminAuthStore(new InMemoryStorage(), fetcher);
    let loginSucceeded = false;
    const modal = new AdminLoginModalView({
      authStore,
      onLoginSuccess: () => {
        loginSucceeded = true;
      },
    });

    modal.mount(parent);
    modal.show();
    modal.setCredentials("admin_real", "super_secret");

    const el = modal.getElement()!;
    const form = el.querySelector("form")!;
    const submitBtn = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toBe(ADMIN_UI_TEXT.LOGIN_SUBMITTING_LABEL);

    resolveLogin({
      token: "jwt-ok",
      user: { username: "admin_real", role: "admin" },
    });
    await vi.waitFor(() => expect(loginSucceeded).toBe(true));

    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toBe(ADMIN_UI_TEXT.LOGIN_SUBMIT_LABEL);
    modal.unmount();
  });

  it("AdminLoginModalView distinguishes service errors from credential errors and clears password", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const fetcher = new StubAdminFetcher();
    fetcher.loginResult = new AdminHttpError(500, "Server down");

    const authStore = new AdminAuthStore(new InMemoryStorage(), fetcher);
    const modal = new AdminLoginModalView({ authStore });
    modal.mount(parent);
    modal.show();
    modal.setCredentials("admin", "12341234");

    const el = modal.getElement()!;
    el.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(el.textContent).toContain(ADMIN_UI_TEXT.LOGIN_SERVICE_ERROR_MESSAGE);
    });
    expect(modal.getInputs().pass).toBe("");

    fetcher.loginResult = new AdminHttpError(401, "Bad password");
    modal.setCredentials("admin", "wrong_pass");
    el.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(el.textContent).toContain(ADMIN_UI_TEXT.LOGIN_ERROR_MESSAGE);
    });
    modal.unmount();
  });

  it("AdminHeaderWidget triggers logout & return-to-tour callbacks", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    let loggedOut = false;
    let returnedToTour = false;
    const header = new AdminHeaderWidget({
      username: "alfredo",
      role: "librarian",
      onLogout: () => {
        loggedOut = true;
      },
      onReturnToTour: () => {
        returnedToTour = true;
      },
    });

    header.mount(parent);
    const actions = header.getElement()!.children[1];
    (actions.children[0] as HTMLElement).click();
    (actions.children[1] as HTMLElement).click();

    expect(returnedToTour).toBe(true);
    expect(loggedOut).toBe(true);
    header.unmount();
  });

  it("AdminController suppresses 3D canvas and toggles polling across login/logout/destroy", async () => {
    const sceneMock = document.createElement("a-scene") as HTMLElement & {
      isPlaying: boolean;
      play: () => void;
      pause: () => void;
    };
    sceneMock.isPlaying = true;
    sceneMock.play = () => {
      sceneMock.isPlaying = true;
    };
    sceneMock.pause = () => {
      sceneMock.isPlaying = false;
    };

    const rootMock = document.createElement("div");
    document.body.append(sceneMock, rootMock);

    const fetcher = new StubAdminFetcher();
    const authStore = new AdminAuthStore(new InMemoryStorage(), fetcher);
    const dashboardStore = new AdminDashboardStore({
      getToken: () => authStore.getState().token,
      fetcher,
      onUnauthorized: () => authStore.logout(),
    });

    const controller = new AdminController(rootMock, authStore, dashboardStore);
    expect(sceneMock.style.display).toBe("none");
    expect(sceneMock.isPlaying).toBe(false);
    expect(dashboardStore.isPolling()).toBe(false);

    await authStore.login({ username: "librarian", password: "pw" });
    expect(dashboardStore.isPolling()).toBe(true);

    authStore.logout();
    expect(dashboardStore.isPolling()).toBe(false);

    controller.destroy();
    expect(sceneMock.style.display).toBe("");
    expect(sceneMock.isPlaying).toBe(true);
  });
});
