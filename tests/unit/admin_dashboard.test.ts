import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppRoute, RouteMatcher } from "../../src/navigation/route-matcher";

vi.mock("chart.js", () => {
  class MockChart {
    static register = vi.fn();
    data: { labels: string[]; datasets: Array<{ data: number[] }> };
    update = vi.fn();
    destroy = vi.fn();

    constructor(_canvas: unknown, config: { data: { labels: string[]; datasets: Array<{ data: number[] }> } }) {
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
  ADMIN_THRESHOLDS,
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

  public clear(): void {
    this.store.clear();
  }
}

class MockAdminFetcher implements AdminNetworkFetcher {
  public getCalls: Array<{ url: string; headers?: Record<string, string> }> = [];
  public postCalls: Array<{ url: string; body?: unknown }> = [];
  public loginResult: { token: string; user: { username: string; role: string } } | Error = {
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
        rating: 4,
        feedback: "",
        viewMode: null,
      },
    ],
    averageRating: 4.5,
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

describe("Admin Dashboard Real Telemetry Vertical Slice", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("RouteMatcher accurately detects admin vs visitor routes", () => {
    expect(RouteMatcher.match("/admin", "")).toBe(AppRoute.ADMIN);
    expect(RouteMatcher.match("/admin/", "")).toBe(AppRoute.ADMIN);
    expect(RouteMatcher.match("/", "#/admin")).toBe(AppRoute.ADMIN);
    expect(RouteMatcher.match("", "#/admin/")).toBe(AppRoute.ADMIN);
    expect(RouteMatcher.match("/ADMIN", "")).toBe(AppRoute.ADMIN);
    expect(RouteMatcher.match("/", "")).toBe(AppRoute.VISITOR);
    expect(RouteMatcher.match("/experience", "")).toBe(AppRoute.VISITOR);
    expect(RouteMatcher.match("/", "#/welcome")).toBe(AppRoute.VISITOR);
  });

  it("AdminAuthStore authenticates asynchronously via /api/admin/login and persists JWT", async () => {
    const storage = new InMemoryStorage();
    const fetcher = new MockAdminFetcher();
    const authStore = new AdminAuthStore(storage, fetcher);

    expect(authStore.getState().isAuthenticated).toBe(false);

    // Reject empty credentials locally without hitting server
    expect(await authStore.login({ username: "   ", password: "abc" })).toBe(false);
    expect(fetcher.postCalls.length).toBe(0);

    // Reject server 401
    fetcher.loginResult = new AdminHttpError(401, "Invalid credentials");
    expect(
      await authStore.login({ username: "admin", password: "wrong" }),
    ).toBe(false);
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getLastError()).toBe("invalid_credentials");

    // Distinguish 404/500 service unavailability from bad credentials
    fetcher.loginResult = new AdminHttpError(404, "Not found");
    expect(
      await authStore.login({ username: "admin", password: "secret" }),
    ).toBe(false);
    expect(authStore.getLastError()).toBe("service_unavailable");

    // Successful login
    fetcher.loginResult = {
      token: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      user: { username: "bibliotecario", role: "librarian" },
    };
    let notified = false;
    const unsub = authStore.subscribe((state) => {
      notified = true;
      expect(state.isAuthenticated).toBe(true);
    });

    expect(
      await authStore.login({ username: " bibliotecario ", password: "secret" }),
    ).toBe(true);
    expect(notified).toBe(true);
    expect(fetcher.postCalls[2]).toEqual({
      url: ADMIN_AUTH_CONSTANTS.ENDPOINTS.LOGIN,
      body: { username: "bibliotecario", password: "secret" },
    });

    // Reload from storage
    const reloaded = new AdminAuthStore(storage, fetcher);
    expect(reloaded.getState()).toEqual({
      isAuthenticated: true,
      token: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      user: { username: "bibliotecario", role: "librarian" },
    });
    expect(authStore.getLastError()).toBeNull();

    unsub();
    authStore.logout();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(storage.getItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY)).toBeNull();
  });

  it("AdminDashboardStore starts empty without mocks and hydrates real /api/admin/stats payloads", async () => {
    const fetcher = new MockAdminFetcher();
    let unauthorizedCalls = 0;
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token-123",
      fetcher,
      onUnauthorized: () => {
        unauthorizedCalls++;
      },
    });

    // Zero mocked surveys or mocked hourly counts before fetching
    expect(store.getState().surveys).toEqual([]);
    expect(store.getAverageRating()).toBe(0);
    expect(store.getDailyPeak()).toBe(0);
    expect(store.getState().hourlyAttendance.labels.length).toBe(24);
    expect(store.getState().hourlyAttendance.values.every((v) => v === 0)).toBe(
      true,
    );

    await store.fetchStats();

    expect(fetcher.getCalls[0]).toEqual({
      url: ADMIN_DASHBOARD_CONSTANTS.ENDPOINTS.STATS,
      headers: { Authorization: "Bearer jwt-token-123" },
    });
    expect(store.getState().connected).toBe(true);
    expect(store.getState().activeVisitorsCount).toBe(4);
    expect(store.getDailyPeak()).toBe(9);
    expect(store.getAverageRating()).toBe(4.5);
    expect(store.getState().surveys.length).toBe(2);

    // 401 triggers unauthorized callback and disconnects
    fetcher.statsResult = new AdminHttpError(401, "Expired");
    await store.fetchStats();
    expect(store.getState().connected).toBe(false);
    expect(unauthorizedCalls).toBe(1);
  });

  it("AttendanceChartWidget syncs both labels and values, peak badge, and CSS connection status", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const fetcher = new MockAdminFetcher();
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
    });

    const chartWidget = new AttendanceChartWidget(store);
    chartWidget.mount(parent);

    const el = chartWidget.getElement()!;
    const statusEl = el.querySelector(
      '[data-admin-metric="connection-status"]',
    ) as HTMLElement;
    expect(
      statusEl.classList.contains(ADMIN_UI_CLASSES.CONNECTION_OFFLINE),
    ).toBe(true);
    expect(statusEl.textContent).toBe(ADMIN_UI_TEXT.CONNECTION_OFFLINE);

    await store.fetchStats();

    expect(
      statusEl.classList.contains(ADMIN_UI_CLASSES.CONNECTION_ONLINE),
    ).toBe(true);
    expect(statusEl.textContent).toBe(ADMIN_UI_TEXT.CONNECTION_ONLINE);

    const chart = chartWidget.getChartInstance() as unknown as {
      data: { labels: string[]; datasets: Array<{ data: number[] }> };
      update: ReturnType<typeof vi.fn>;
    };
    expect(chart.data.labels.length).toBe(24);
    expect(chart.data.datasets[0].data[11]).toBe(9);
    expect(chart.update).toHaveBeenCalled();

    const peakBadge = el.querySelector(
      `.${ADMIN_UI_CLASSES.CHART_PEAK_BADGE}`,
    ) as HTMLElement;
    expect(peakBadge.textContent).toContain("9");

    chartWidget.unmount();
  });

  it("SurveysTableWidget renders empty state and vr / 2d / null modalities", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const fetcher = new MockAdminFetcher();
    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
    });

    const tableWidget = new SurveysTableWidget(store);
    tableWidget.mount(parent);
    const el = tableWidget.getElement()!;
    const tbody = el.querySelector("tbody")!;

    // Empty initial state
    expect(tbody.children.length).toBe(1);
    expect(tbody.textContent).toContain(ADMIN_UI_TEXT.NO_SURVEYS);

    await store.fetchStats();
    expect(tbody.children.length).toBe(2);
    expect(tbody.children[0].children[1].textContent).toBe(
      ADMIN_UI_TEXT.VIEW_MODE_VR,
    );
    expect(tbody.children[1].children[1].textContent).toBe(
      ADMIN_UI_TEXT.VIEW_MODE_UNKNOWN,
    );

    tableWidget.unmount();
  });

  it("AdminLoginModalView handles async submit states cleanly", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    let resolveLogin!: (value: unknown) => void;
    const fetcher: AdminNetworkFetcher = {
      get: async <T = unknown>() => ({}) as T,
      post: async <T = unknown>() =>
        (await new Promise((resolve) => {
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
    await new Promise((r) => setTimeout(r, 0));

    expect(loginSucceeded).toBe(true);
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent).toBe(ADMIN_UI_TEXT.LOGIN_SUBMIT_LABEL);

    // Verify service_unavailable error message vs invalid credentials message
    const failFetcher: AdminNetworkFetcher = {
      get: async <T = unknown>() => ({}) as T,
      post: async () => {
        throw new AdminHttpError(500, "Server down");
      },
    };
    const failAuthStore = new AdminAuthStore(new InMemoryStorage(), failFetcher);
    const failModal = new AdminLoginModalView({ authStore: failAuthStore });
    failModal.mount(parent);
    failModal.show();
    failModal.setCredentials("admin", "12341234");
    const failForm = failModal.getElement()!.querySelector("form")!;
    failForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(failModal.getElement()!.textContent).toContain(
      ADMIN_UI_TEXT.LOGIN_SERVICE_ERROR_MESSAGE,
    );
    failModal.unmount();
    modal.unmount();
  });

  it("AdminHeaderWidget triggers logout & return-to-tour", () => {
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
    const el = header.getElement()!;
    const actions = el.children[1];
    (actions.children[0] as HTMLElement).click();
    (actions.children[1] as HTMLElement).click();

    expect(returnedToTour).toBe(true);
    expect(loggedOut).toBe(true);
    header.unmount();
  });

  it("suppresses 3D canvas and orchestrates AdminController auth & polling lifecycle", async () => {
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

    const fetcher = new MockAdminFetcher();
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
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(dashboardStore.isPolling()).toBe(true);

    authStore.logout();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(dashboardStore.isPolling()).toBe(false);

    controller.destroy();
    expect(sceneMock.style.display).toBe("");
    expect(sceneMock.isPlaying).toBe(true);
  });

  it("strictly adheres CSS class tokens to design system namespaces", () => {
    for (const className of Object.values(ADMIN_UI_CLASSES)) {
      expect(typeof className).toBe("string");
      expect(className.length).toBeGreaterThan(0);
      expect(className.includes("cv-admin") || className.includes("cv-")).toBe(
        true,
      );
    }
    expect(ADMIN_THRESHOLDS.MAX_CAPACITY).toBeGreaterThanOrEqual(20);
  });
});
