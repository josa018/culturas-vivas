import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("chart.js", () => {
  class MockChart {
    static register = vi.fn();
    data: { labels: string[]; datasets: Array<{ data: number[] }> };
    update = vi.fn();
    destroy = vi.fn();

    constructor(
      _canvas: unknown,
      config: {
        data: { labels: string[]; datasets: Array<{ data: number[] }> };
      },
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
  ADMIN_HTTP_ERROR_TEXT,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  AdminLoginModalView,
  AdminHeaderWidget,
  SurveysTableWidget,
  AttendanceChartWidget,
  AdminDashboardView,
  AdminMediaStore,
  AdminController,
  mapAdminErrorMessage,
} from "../../src/admin/index";
import type { AdminMediaProcessor } from "../../src/admin/media-processor";
import { MediaManagerWidget } from "../../src/admin/views/media-manager-widget";
import { ExhibitMediaType } from "../../src/experience/constants";
import { RoomId, StandId } from "../../src/shared/room-catalog";
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
  public getCalls: Array<{ url: string; headers?: Record<string, string> }> =
    [];
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
    expect(await store.login({ username: "admin", password: "wrong" })).toBe(
      false,
    );
    expect(store.getLastError()).toBe("invalid_credentials");

    fetcher.loginResult = new AdminHttpError(500, "Server error");
    expect(await store.login({ username: "admin", password: "secret" })).toBe(
      false,
    );
    expect(store.getLastError()).toBe("service_unavailable");

    fetcher.loginResult = {
      token: "",
      user: { username: "admin", role: "admin" },
    };
    expect(await store.login({ username: "admin", password: "secret" })).toBe(
      false,
    );
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
    const unsub = store.subscribe((state) =>
      states.push(state.isAuthenticated),
    );

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
    expect(store.getState().hourlyAttendance.values.every((v) => v === 0)).toBe(
      true,
    );
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

  it("AttendanceChartWidget syncs labels, values, peak badge, hides connection indicator until offline, and switches chart ranges", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const fetcher = new StubAdminFetcher();
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
    // Hidden during initial connecting state
    expect(statusEl.hidden).toBe(true);

    await store.fetchStats();

    // Remains hidden while online
    expect(statusEl.hidden).toBe(true);

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

    // Visible only when offline
    const savedStats = fetcher.statsResult;
    fetcher.statsResult = new AdminHttpError(503, "Offline");
    await store.fetchStats();
    expect(statusEl.hidden).toBe(false);
    expect(
      statusEl.classList.contains(ADMIN_UI_CLASSES.CONNECTION_OFFLINE),
    ).toBe(true);
    expect(statusEl.textContent).toBe(ADMIN_UI_TEXT.CONNECTION_OFFLINE);

    // Clicking week timeframe requests ?range=week and hides offline indicator on recovery
    fetcher.statsResult = {
      activeSessions: 2,
      range: "week",
      hourlyAttendance: {
        labels: ["Lun 1", "Mar 2", "Mié 3", "Jue 4", "Vie 5", "Sáb 6", "Dom 7"],
        values: [3, 5, 1, 2, 4, 8, 6],
        peak: 8,
      },
      surveys: [],
      averageRating: 0,
    };
    const weekBtn = el.querySelector(
      '[data-chart-range="week"]',
    ) as HTMLButtonElement;
    expect(weekBtn).not.toBeNull();
    weekBtn.click();

    await vi.waitFor(() => {
      expect(fetcher.getCalls.some((c) => c.url.includes("range=week"))).toBe(
        true,
      );
      expect(weekBtn.getAttribute("aria-pressed")).toBe("true");
      expect(statusEl.hidden).toBe(true);
      expect(chart.data.labels).toHaveLength(7);
      expect(peakBadge.textContent).toContain("8");
    });

    fetcher.statsResult = savedStats;
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
    expect(tbody.children[0].children[1].textContent).toBe(
      ADMIN_UI_TEXT.VIEW_MODE_VR,
    );
    expect(tbody.children[0].children[2].textContent).toBe("★★★★★");
    expect(tbody.children[0].children[3].textContent).toBe("Excelente");

    expect(tbody.children[1].children[1].textContent).toBe(
      ADMIN_UI_TEXT.VIEW_MODE_2D,
    );
    expect(tbody.children[1].children[2].textContent).toBe("★★☆☆☆");
    expect(tbody.children[1].children[3].textContent).toBe(
      ADMIN_UI_TEXT.FEEDBACK_EMPTY,
    );

    expect(tbody.children[2].children[1].textContent).toBe(
      ADMIN_UI_TEXT.VIEW_MODE_UNKNOWN,
    );

    tableWidget.unmount();
  });

  it("SurveysTableWidget provides filter/sort controls and pagination controls wired to AdminDashboardStore", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const fetcher = new StubAdminFetcher();
    fetcher.statsResult = {
      activeSessions: 1,
      hourlyAttendance: {
        labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
        values: Array.from({ length: 24 }, () => 0),
        peak: 0,
      },
      surveys: [
        {
          id: "11",
          timestamp: Date.UTC(2026, 10, 23, 21, 30, 0),
          rating: 5,
          feedback: "Muy claro",
          viewMode: "vr",
        },
      ],
      averageRating: 4.5,
      totalSurveys: 12,
      surveysPagination: {
        page: 1,
        pageSize: 10,
        totalItems: 12,
        totalPages: 2,
      },
    };

    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
    });
    const tableWidget = new SurveysTableWidget(store);
    tableWidget.mount(parent);
    await store.fetchStats();

    const el = tableWidget.getElement()!;
    const modeSelect = el.querySelector(
      '[data-survey-filter="mode"]',
    ) as HTMLSelectElement;
    const ratingSelect = el.querySelector(
      '[data-survey-filter="rating"]',
    ) as HTMLSelectElement;
    const sortSelect = el.querySelector(
      '[data-survey-filter="sort"]',
    ) as HTMLSelectElement;
    const commentCheck = el.querySelector(
      '[data-survey-filter="has-feedback"]',
    ) as HTMLInputElement;
    const prevBtn = el.querySelector(
      '[data-survey-page="prev"]',
    ) as HTMLButtonElement;
    const nextBtn = el.querySelector(
      '[data-survey-page="next"]',
    ) as HTMLButtonElement;
    const pageSummary = el.querySelector(
      '[data-survey-page="summary"]',
    ) as HTMLElement;

    expect(modeSelect).not.toBeNull();
    expect(ratingSelect).not.toBeNull();
    expect(sortSelect).not.toBeNull();
    expect(commentCheck).not.toBeNull();
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);
    expect(pageSummary.textContent).toContain("1");
    expect(pageSummary.textContent).toContain("2");

    // Advance to page 2
    fetcher.statsResult = {
      ...(fetcher.statsResult as Record<string, unknown>),
      surveysPagination: { page: 2, pageSize: 10, totalItems: 12, totalPages: 2 },
    };
    nextBtn.click();
    await vi.waitFor(() => {
      expect(fetcher.getCalls.some((c) => c.url.includes("surveyPage=2"))).toBe(
        true,
      );
      expect(prevBtn.disabled).toBe(false);
      expect(nextBtn.disabled).toBe(true);
    });

    // Changing filter resets page back to 1
    modeSelect.value = "vr";
    modeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      const lastCall = fetcher.getCalls[fetcher.getCalls.length - 1];
      expect(lastCall.url).toContain("surveyMode=vr");
      expect(lastCall.url).not.toContain("surveyPage=2");
    });

    commentCheck.checked = true;
    commentCheck.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      const lastCall = fetcher.getCalls[fetcher.getCalls.length - 1];
      expect(lastCall.url).toContain("surveyHasFeedback=1");
    });

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
    const submitBtn = el.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;

    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
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
      expect(el.textContent).toContain(
        ADMIN_UI_TEXT.LOGIN_SERVICE_ERROR_MESSAGE,
      );
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

  it("AdminHeaderWidget omits return-to-tour button and triggers logout callback", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    let loggedOut = false;
    const header = new AdminHeaderWidget({
      username: "alfredo",
      role: "librarian",
      onLogout: () => {
        loggedOut = true;
      },
      onReturnToTour: () => {},
    });

    header.mount(parent);
    const headerEl = header.getElement()!;
    expect(headerEl.querySelector(".cv-admin-btn-exit")).toBeNull();
    const actions = headerEl.children[1];
    const logoutBtn = actions.querySelector(".cv-admin-btn-logout") as HTMLElement;
    expect(logoutBtn).not.toBeNull();
    logoutBtn.click();

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

  it("AdminDashboardView switches tabs between telemetry and MediaManagerWidget while keeping telemetry polling active", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const authFetcher = new StubAdminFetcher();
    authFetcher.loginResult = {
      token: "signed.jwt.token",
      user: { username: "maria_biblio", role: "librarian" },
    };
    const authStore = new AdminAuthStore(new InMemoryStorage(), authFetcher);
    await authStore.login({ username: "librarian", password: "pw" });

    const statsFetcher = new StubAdminFetcher();
    const dashboardStore = new AdminDashboardStore({
      getToken: () => authStore.getState().token,
      fetcher: statsFetcher,
      onUnauthorized: () => authStore.logout(),
    });
    dashboardStore.startPolling();

    const mediaFetcher: AdminNetworkFetcher = {
      get: vi.fn(async () => ({
        items: [
          {
            id: "w-1",
            roomId: RoomId.WIXARIKA,
            standId: StandId.ARTE,
            mediaType: ExhibitMediaType.IMAGE_2D,
            title: "Estambre Ceremonial",
            creatorName: "María Cruz",
            description: "Tabla de estambre.",
            mediaUrl: "https://pub.r2.dev/rooms/wixarika/arte/w-1.webp",
            sortOrder: 0,
          },
          {
            id: "w-2",
            roomId: RoomId.WIXARIKA,
            standId: StandId.ARTE,
            mediaType: ExhibitMediaType.IMAGE_STEREO_SBS,
            title: "Templo SBS",
            creatorName: "",
            description: "Vista estéreo.",
            mediaUrl: "https://pub.r2.dev/rooms/wixarika/arte/w-2.webp",
            sortOrder: 1,
          },
        ],
        storageUsageBytes: 1_048_576,
        maxStorageBytes: 8_589_934_592,
      })),
      post: vi.fn(async (url: string) => {
        if (url.includes("presign")) {
          return {
            media: {
              key: "rooms/wixarika/arte/w-3.webp",
              uploadUrl: "https://r2.example.com/w-3.webp",
              headers: { "Content-Type": "image/webp" },
            },
            storageUsageBytes: 1_048_576,
            maxStorageBytes: 8_589_934_592,
          };
        }
        return {
          item: {
            id: "w-3",
            roomId: RoomId.WIXARIKA,
            standId: StandId.ARTE,
            mediaType: ExhibitMediaType.IMAGE_STEREO_SBS,
            title: "Nuevo Cuadro",
            creatorName: "Pedro",
            description: "Alta resolución.",
            mediaUrl: "https://pub.r2.dev/rooms/wixarika/arte/w-3.webp",
            sortOrder: 2,
          },
          storageUsageBytes: 1_049_600,
          maxStorageBytes: 8_589_934_592,
        };
      }),
      patch: vi.fn(async (_url: string, body: unknown) => {
        const record = body as {
          id?: string;
          title?: string;
          creatorName?: string;
        };
        if (record.id) {
          return {
            item: {
              id: record.id,
              roomId: RoomId.WIXARIKA,
              standId: StandId.ARTE,
              mediaType: ExhibitMediaType.IMAGE_2D,
              title: record.title ?? "Editado",
              creatorName: record.creatorName ?? "",
              description: "Tabla de estambre.",
              mediaUrl: "https://pub.r2.dev/rooms/wixarika/arte/w-1.webp",
              sortOrder: 0,
            },
          };
        }
        return { ok: true };
      }),
      delete: vi.fn(async () => ({ ok: true, storageUsageBytes: 512_000 })),
      putBinary: vi.fn(async () => {}),
    };

    const mockProcessor = {
      optimizeImage: vi.fn(async () => ({
        blob: new Blob(["webp"], { type: "image/webp" }),
        width: 1200,
        height: 900,
        mimeType: "image/webp" as const,
      })),
      extractVideoPoster: vi.fn(),
    } as unknown as AdminMediaProcessor;

    const mediaStore = new AdminMediaStore({
      getToken: () => authStore.getState().token,
      onUnauthorized: () => authStore.logout(),
      fetcher: mediaFetcher,
      processor: mockProcessor,
    });

    const dashboardView = new AdminDashboardView({
      authStore,
      dashboardStore,
      mediaStore,
      onLogout: () => authStore.logout(),
    });

    dashboardView.mount(parent);
    const rootEl = dashboardView.getElement()!;

    const telemetryTab = rootEl.querySelector(
      '[data-admin-tab="telemetry"]',
    ) as HTMLButtonElement;
    const mediaTab = rootEl.querySelector(
      '[data-admin-tab="media"]',
    ) as HTMLButtonElement;
    const telemetryPanel = rootEl.querySelector(
      '[data-admin-panel="telemetry"]',
    ) as HTMLElement;
    const mediaPanel = rootEl.querySelector(
      '[data-admin-panel="media"]',
    ) as HTMLElement;

    expect(telemetryTab).not.toBeNull();
    expect(mediaTab).not.toBeNull();
    expect(
      telemetryPanel.classList.contains(ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN),
    ).toBe(false);
    expect(
      mediaPanel.classList.contains(ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN),
    ).toBe(true);

    // Switch to Multimedia tab; polling stays running
    mediaTab.click();
    expect(
      telemetryPanel.classList.contains(ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN),
    ).toBe(true);
    expect(
      mediaPanel.classList.contains(ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN),
    ).toBe(false);
    expect(dashboardStore.isPolling()).toBe(true);

    await vi.waitFor(() => {
      expect(mediaFetcher.get).toHaveBeenCalledTimes(1);
    });

    expect(mediaPanel.textContent).toContain("8192 MB");

    // Filter to WIXARIKA -> ARTE
    const roomSelect = mediaPanel.querySelector(
      '[data-media-filter="room"]',
    ) as HTMLSelectElement;
    const standSelect = mediaPanel.querySelector(
      '[data-media-filter="stand"]',
    ) as HTMLSelectElement;
    roomSelect.value = RoomId.WIXARIKA;
    roomSelect.dispatchEvent(new Event("change"));
    standSelect.value = StandId.ARTE;
    standSelect.dispatchEvent(new Event("change"));

    const itemCards = mediaPanel.querySelectorAll(
      `.${ADMIN_UI_CLASSES.MEDIA_ITEM_CARD}`,
    );
    expect(itemCards).toHaveLength(2);
    expect(itemCards[0]?.textContent).toContain(
      `${ADMIN_UI_TEXT.MEDIA_CREATOR_PREFIX}María Cruz`,
    );

    // Trigger reorder down on first item
    const moveDownBtn = itemCards[0]!.querySelector(
      '[data-action="move-down"]',
    ) as HTMLButtonElement;
    moveDownBtn.click();
    await vi.waitFor(() => {
      expect(mediaFetcher.patch).toHaveBeenCalledWith(
        expect.any(String),
        {
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          orderedIds: ["w-2", "w-1"],
        },
        expect.any(Object),
      );
    });

    // Inline edit on item w-1
    const editBtn = mediaPanel.querySelector(
      '[data-item-id="w-1"] [data-action="edit"]',
    ) as HTMLButtonElement;
    editBtn.click();
    const editTitleInput = mediaPanel.querySelector(
      '[data-item-id="w-1"] [data-edit-field="title"]',
    ) as HTMLInputElement;
    editTitleInput.value = "Estambre Editado";
    const saveEditBtn = mediaPanel.querySelector(
      '[data-item-id="w-1"] [data-action="save-edit"]',
    ) as HTMLButtonElement;
    saveEditBtn.click();
    await vi.waitFor(() => {
      expect(mediaFetcher.patch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: "w-1", title: "Estambre Editado" }),
        expect.any(Object),
      );
    });

    // Delete item w-2 via two-step inline confirmation
    const deleteBtn = mediaPanel.querySelector(
      '[data-item-id="w-2"] [data-action="delete"]',
    ) as HTMLButtonElement;
    deleteBtn.click();
    expect(mediaFetcher.delete).not.toHaveBeenCalled();

    const confirmDeleteBtn = mediaPanel.querySelector(
      '[data-item-id="w-2"] [data-action="confirm-delete"]',
    ) as HTMLButtonElement;
    expect(confirmDeleteBtn).not.toBeNull();
    confirmDeleteBtn.click();
    await vi.waitFor(() => {
      expect(mediaFetcher.delete).toHaveBeenCalledWith(
        expect.stringContaining("id=w-2"),
        expect.any(Object),
      );
    });

    // Upload new item via form
    const fileInput = mediaPanel.querySelector(
      '[data-upload-field="file"]',
    ) as HTMLInputElement;
    const titleInput = mediaPanel.querySelector(
      '[data-upload-field="title"]',
    ) as HTMLInputElement;
    const creatorInput = mediaPanel.querySelector(
      '[data-upload-field="creatorName"]',
    ) as HTMLInputElement;
    const descInput = mediaPanel.querySelector(
      '[data-upload-field="description"]',
    ) as HTMLInputElement;
    const formatSelect = mediaPanel.querySelector(
      '[data-upload-field="format"]',
    ) as HTMLSelectElement;
    const uploadForm = mediaPanel.querySelector("form") as HTMLFormElement;

    const testFile = new File(["img"], "nuevo.jpg", { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", {
      value: [testFile],
      configurable: true,
    });
    titleInput.value = "Nuevo Cuadro";
    creatorInput.value = "Pedro";
    descInput.value = "Alta resolución.";
    formatSelect.value = "SBS";
    uploadForm.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(mediaFetcher.putBinary).toHaveBeenCalledTimes(1);
    });

    // Switch back to telemetry tab cleanly
    telemetryTab.click();
    expect(
      telemetryPanel.classList.contains(ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN),
    ).toBe(false);
    expect(
      mediaPanel.classList.contains(ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN),
    ).toBe(true);
    expect(dashboardStore.isPolling()).toBe(true);

    dashboardStore.stopPolling();
    dashboardView.unmount();
  });

  it("enforces 80 / 80 / 240 maxLength live counters and provides video thumbnail picker + inline poster replacement", async () => {
    const mediaFetcher = {
      get: vi.fn(async () => ({
        items: [
          {
            id: "v-1",
            roomId: RoomId.WIXARIKA,
            standId: StandId.ARTE,
            mediaType: ExhibitMediaType.VIDEO_2D,
            title: "Video Original",
            creatorName: "Autor",
            description: "Desc",
            mediaUrl: "https://pub.r2.dev/v1.mp4",
            posterUrl: "https://pub.r2.dev/v1-old.webp",
            sortOrder: 0,
          },
        ],
        storageUsageBytes: 1_000_000,
        maxStorageBytes: 8_589_934_592,
      })),
      post: vi.fn(async (url: string, body: unknown) => {
        if (
          url.includes("presign") &&
          (body as { posterOnly?: boolean }).posterOnly
        ) {
          return {
            poster: {
              key: "rooms/wixarika/arte/v1-replaced-poster.webp",
              uploadUrl: "https://r2.example.com/v1-replaced-poster.webp",
              headers: { "Content-Type": "image/webp" },
            },
          };
        }
        return {};
      }),
      patch: vi.fn(async (_url: string, body: unknown) => ({
        item: {
          id: "v-1",
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaType: ExhibitMediaType.VIDEO_2D,
          title: "Video Original",
          creatorName: "Autor",
          description: "Desc",
          mediaUrl: "https://pub.r2.dev/v1.mp4",
          posterKey: (body as { posterKey?: string }).posterKey,
          posterUrl: "https://pub.r2.dev/rooms/wixarika/arte/v1-replaced-poster.webp",
          sortOrder: 0,
        },
      })),
      delete: vi.fn(async () => ({ ok: true })),
      putBinary: vi.fn(async () => {}),
    };

    const mockProcessor = {
      optimizeImage: vi.fn(),
      optimizePosterImage: vi.fn(async () => ({
        posterBlob: new Blob(["new-poster"], { type: "image/webp" }),
        videoWidth: 1024,
        videoHeight: 576,
        posterWidth: 1024,
        posterHeight: 576,
        posterMimeType: "image/webp" as const,
      })),
      extractVideoPoster: vi.fn(async () => ({
        posterBlob: new Blob(["frame-poster"], { type: "image/webp" }),
        videoWidth: 1280,
        videoHeight: 720,
        posterWidth: 1024,
        posterHeight: 576,
        posterMimeType: "image/webp" as const,
      })),
    } as unknown as AdminMediaProcessor;

    const mediaStore = new AdminMediaStore({
      getToken: () => "jwt-token",
      onUnauthorized: () => {},
      fetcher: mediaFetcher,
      processor: mockProcessor,
    });
    const widget = new MediaManagerWidget(mediaStore);
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    widget.mount(parent);
    await mediaStore.fetchCatalog();

    const titleInput = parent.querySelector(
      '[data-upload-field="title"]',
    ) as HTMLInputElement;
    const creatorInput = parent.querySelector(
      '[data-upload-field="creatorName"]',
    ) as HTMLInputElement;
    const descInput = parent.querySelector(
      '[data-upload-field="description"]',
    ) as HTMLInputElement;

    expect(titleInput.maxLength).toBe(80);
    expect(creatorInput.maxLength).toBe(80);
    expect(descInput.maxLength).toBe(240);

    const titleCounter = parent.querySelector('[data-counter-for="title"]');
    const descCounter = parent.querySelector('[data-counter-for="description"]');
    expect(titleCounter?.textContent).toBe("0 / 80");
    expect(descCounter?.textContent).toBe("0 / 240");

    titleInput.value = "Hola";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    descInput.value = "Texto breve";
    descInput.dispatchEvent(new Event("input", { bubbles: true }));
    expect(titleCounter?.textContent).toBe("4 / 80");
    expect(descCounter?.textContent).toBe("11 / 240");

    // Selecting a video reveals timestamp & custom poster picker controls
    const fileInput = parent.querySelector(
      '[data-upload-field="file"]',
    ) as HTMLInputElement;
    const posterControls = parent.querySelector(
      "[data-video-poster-controls]",
    ) as HTMLElement;
    expect(posterControls.hidden).toBe(true);

    const videoFile = new File(["mp4"], "danza.mp4", { type: "video/mp4" });
    Object.defineProperty(fileInput, "files", {
      value: [videoFile],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(posterControls.hidden).toBe(false);

    // Capturing preview passes cropHalfSbsLeft: false in 2D mode, and toggling format to SBS auto-refreshes preview
    const captureBtn = parent.querySelector(
      '[data-action="capture-poster-preview"]',
    ) as HTMLButtonElement;
    const formatSelect = parent.querySelector(
      '[data-upload-field="format"]',
    ) as HTMLSelectElement;
    const customPosterInput = parent.querySelector(
      '[data-upload-field="customPoster"]',
    ) as HTMLInputElement;
    captureBtn.click();
    await vi.waitFor(() => {
      expect(mockProcessor.extractVideoPoster).toHaveBeenCalledWith(
        videoFile,
        0.5,
        { cropHalfSbsLeft: false },
      );
    });

    formatSelect.value = "SBS";
    formatSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => {
      expect(mockProcessor.extractVideoPoster).toHaveBeenLastCalledWith(
        videoFile,
        0.5,
        { cropHalfSbsLeft: true },
      );
    });

    // When custom poster is chosen, toggling format must not overwrite custom preview
    const callsBeforeCustom = (
      mockProcessor.extractVideoPoster as ReturnType<typeof vi.fn>
    ).mock.calls.length;
    const customThumb = new File(["img"], "custom.png", { type: "image/png" });
    Object.defineProperty(customPosterInput, "files", {
      value: [customThumb],
      configurable: true,
    });
    formatSelect.value = "2D";
    formatSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    expect(
      (mockProcessor.extractVideoPoster as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(callsBeforeCustom);

    // Inline edit on video reveals poster file replacement
    mediaStore.setSelection(RoomId.WIXARIKA, StandId.ARTE);
    const editBtn = parent.querySelector(
      '[data-item-id="v-1"] [data-action="edit"]',
    ) as HTMLButtonElement;
    editBtn.click();

    const editPosterInput = parent.querySelector(
      '[data-item-id="v-1"] [data-edit-field="posterFile"]',
    ) as HTMLInputElement;
    const replacePosterBtn = parent.querySelector(
      '[data-item-id="v-1"] [data-action="replace-poster"]',
    ) as HTMLButtonElement;
    expect(editPosterInput).not.toBeNull();

    const thumbFile = new File(["img"], "nueva.png", { type: "image/png" });
    Object.defineProperty(editPosterInput, "files", {
      value: [thumbFile],
      configurable: true,
    });
    replacePosterBtn.click();

    await vi.waitFor(() => {
      expect(mediaFetcher.patch).toHaveBeenCalledWith(
        expect.any(String),
        {
          id: "v-1",
          posterKey: "rooms/wixarika/arte/v1-replaced-poster.webp",
        },
        expect.any(Object),
      );
    });

    widget.unmount();
  });

  it("maps HTTP and network errors into plain-Spanish librarian messages without raw codes or API paths", () => {
    const tooLarge = mapAdminErrorMessage(
      new AdminHttpError(413, "HTTP 413 from /api/admin/media/presign"),
      "Error genérico",
    );
    expect(tooLarge).toBe(ADMIN_HTTP_ERROR_TEXT.PAYLOAD_TOO_LARGE);
    expect(tooLarge).not.toContain("HTTP 413");
    expect(tooLarge).not.toContain("/api/");

    const badRequest = mapAdminErrorMessage(
      new AdminHttpError(400, "HTTP 400 from /api/admin/media"),
      "Error genérico",
    );
    expect(badRequest).toBe(ADMIN_HTTP_ERROR_TEXT.BAD_REQUEST);

    const serverError = mapAdminErrorMessage(
      new AdminHttpError(500, "Binary PUT failed with HTTP 500"),
      "Error genérico",
    );
    expect(serverError).toBe(ADMIN_HTTP_ERROR_TEXT.SERVER_ERROR);

    const networkError = mapAdminErrorMessage(
      new TypeError("Failed to fetch"),
      "Error genérico",
    );
    expect(networkError).toBe(ADMIN_HTTP_ERROR_TEXT.NETWORK_ERROR);

    const domainSpanish = mapAdminErrorMessage(
      new Error("El video supera el peso máximo permitido (100 MB)."),
      "Error genérico",
    );
    expect(domainSpanish).toBe(
      "El video supera el peso máximo permitido (100 MB).",
    );
  });

  it("AdminLoginModalView renders SVG eye toggle for password visibility and hides internal API paths", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const authFetcher = new StubAdminFetcher();
    authFetcher.loginResult = {
      token: "signed.jwt.token",
      user: { username: "maria_biblio", role: "librarian" },
    };
    const authStore = new AdminAuthStore(new InMemoryStorage(), authFetcher);
    const modal = new AdminLoginModalView({ authStore });
    modal.mount(parent);
    modal.show();

    const el = modal.getElement()!;
    expect(el.textContent).toContain(ADMIN_UI_TEXT.LOGIN_TITLE);
    expect(ADMIN_UI_TEXT.LOGIN_SERVICE_ERROR_MESSAGE).not.toContain("/api/");

    const passInput = el.querySelector(
      "#cv-admin-password",
    ) as HTMLInputElement;
    const toggleBtn = el.querySelector(
      '[data-action="toggle-password"]',
    ) as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.querySelector("svg")).not.toBeNull();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(toggleBtn.getAttribute("aria-label")).toBe(
      ADMIN_UI_TEXT.LOGIN_SHOW_PASSWORD_ARIA,
    );
    expect(passInput.type).toBe("password");

    toggleBtn.click();
    expect(passInput.type).toBe("text");
    expect(toggleBtn.querySelector("svg")).not.toBeNull();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("true");
    expect(toggleBtn.getAttribute("aria-label")).toBe(
      ADMIN_UI_TEXT.LOGIN_HIDE_PASSWORD_ARIA,
    );

    toggleBtn.click();
    expect(passInput.type).toBe("password");
    expect(toggleBtn.querySelector("svg")).not.toBeNull();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");
    expect(toggleBtn.getAttribute("aria-label")).toBe(
      ADMIN_UI_TEXT.LOGIN_SHOW_PASSWORD_ARIA,
    );

    modal.unmount();
  });

  it("AdminHeaderWidget displays signed-in username and AdminDashboardView uses plain-Spanish tabs and telemetry grid", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const authFetcher = new StubAdminFetcher();
    authFetcher.loginResult = {
      token: "signed.jwt.token",
      user: { username: "maria_biblio", role: "librarian" },
    };
    const authStore = new AdminAuthStore(new InMemoryStorage(), authFetcher);
    await authStore.login({ username: "maria_biblio", password: "pw" });

    const dashboardStore = new AdminDashboardStore({
      getToken: () => authStore.getState().token,
      fetcher: new StubAdminFetcher(),
    });
    const mediaStore = new AdminMediaStore({
      getToken: () => authStore.getState().token,
      onUnauthorized: () => {},
      fetcher: new StubAdminFetcher(),
    });

    const dashboardView = new AdminDashboardView({
      authStore,
      dashboardStore,
      mediaStore,
      onLogout: () => {},
    });
    dashboardView.mount(parent);

    const el = dashboardView.getElement()!;
    const userBadge = el.querySelector(
      `.${ADMIN_UI_CLASSES.HEADER_USER_BADGE}`,
    );
    expect(userBadge).not.toBeNull();
    expect(userBadge?.textContent).toContain("maria_biblio");
    expect(el.textContent).toContain(ADMIN_UI_TEXT.HEADER_SUBTITLE);

    expect(
      el.querySelector('[data-admin-tab="telemetry"]')?.textContent,
    ).toBe(ADMIN_UI_TEXT.TAB_TELEMETRY);
    expect(el.querySelector('[data-admin-tab="media"]')?.textContent).toBe(
      ADMIN_UI_TEXT.TAB_MEDIA,
    );
    expect(
      el.querySelector('[data-admin-tab="playlists"]')?.textContent,
    ).toBe(ADMIN_UI_TEXT.TAB_PLAYLISTS);

    const telemetryGrid = el.querySelector(
      `[data-admin-panel="telemetry"] .${ADMIN_UI_CLASSES.GRID_TELEMETRY}`,
    );
    expect(telemetryGrid).not.toBeNull();

    dashboardView.unmount();
  });

  it("AttendanceChartWidget and SurveysTableWidget render plain-Spanish subtitles, date+time cells, and neutral empty rating badge", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const fetcher = new StubAdminFetcher();
    fetcher.statsResult = {
      activeSessions: 2,
      hourlyAttendance: {
        labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
        values: Array.from({ length: 24 }, () => 0),
        peak: 5,
      },
      surveys: [
        {
          id: "s-date",
          timestamp: Date.UTC(2026, 10, 23, 21, 30, 0), // 14:30 in UTC-7
          rating: 5,
          feedback: "Excelente guía",
          viewMode: "vr",
        },
      ],
      averageRating: 5,
    };

    const store = new AdminDashboardStore({
      getToken: () => "jwt-token",
      fetcher,
    });
    const chartWidget = new AttendanceChartWidget(store);
    const surveyWidget = new SurveysTableWidget(store);
    chartWidget.mount(parent);
    surveyWidget.mount(parent);

    // Empty state before hydration shows neutral rating badge
    const avgBadge = surveyWidget
      .getElement()!
      .querySelector(`.${ADMIN_UI_CLASSES.SURVEY_AVG_BADGE}`) as HTMLElement;
    expect(avgBadge.textContent).toBe(ADMIN_UI_TEXT.SURVEY_NO_RATINGS);
    expect(chartWidget.getElement()!.textContent).toContain(
      ADMIN_UI_TEXT.CHART_SUBTITLE,
    );
    expect(surveyWidget.getElement()!.textContent).toContain(
      ADMIN_UI_TEXT.SURVEY_SUBTITLE,
    );

    await store.fetchStats();

    expect(avgBadge.textContent).toBe("★ 5.0 / 5.0");
    const firstRowTimeCell = surveyWidget
      .getElement()!
      .querySelector(`tbody tr td.${ADMIN_UI_CLASSES.TABLE_TD_TIME}`);
    expect(firstRowTimeCell?.textContent).toBe("23 nov 14:30");

    chartWidget.unmount();
    surveyWidget.unmount();
  });

  it("MediaManagerWidget renders visible labels, friendly format chips, collapsible 3D hint, validation feedback, cancelable delete, and download action", async () => {
    const downloadTrigger = vi.fn();
    const mediaFetcher: AdminNetworkFetcher = {
      get: vi.fn(async (url: string) => {
        if (url.includes("downloadId=w-1")) {
          return {
            downloadUrl: "https://r2.example.com/signed-w1",
            filename: "estambre.webp",
            expiresInSeconds: 300,
          };
        }
        return {
          items: [
            {
              id: "w-1",
              roomId: RoomId.WIXARIKA,
              standId: StandId.ARTE,
              mediaType: ExhibitMediaType.IMAGE_2D,
              title: "Estambre Ceremonial",
              creatorName: "María Cruz",
              description: "Tabla.",
              mediaUrl: "https://pub.r2.dev/w-1.webp",
              sortOrder: 0,
            },
            {
              id: "w-2",
              roomId: RoomId.WIXARIKA,
              standId: StandId.ARTE,
              mediaType: ExhibitMediaType.VIDEO_STEREO_SBS,
              title: "Danza 3D",
              creatorName: "",
              description: "Video.",
              mediaUrl: "https://pub.r2.dev/w-2.mp4",
              posterUrl: "https://pub.r2.dev/w-2-poster.webp",
              sortOrder: 1,
            },
          ],
          storageUsageBytes: 1_048_576,
          maxStorageBytes: 8_589_934_592,
        };
      }),
      post: vi.fn(async () => ({})),
      patch: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({ ok: true, storageUsageBytes: 0 })),
      putBinary: vi.fn(async () => {}),
    };

    const mediaStore = new AdminMediaStore({
      getToken: () => "jwt-token",
      onUnauthorized: () => {},
      fetcher: mediaFetcher,
      downloadTrigger,
    });
    const widget = new MediaManagerWidget(mediaStore);
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    widget.mount(parent);
    await mediaStore.fetchCatalog();
    mediaStore.setSelection(RoomId.WIXARIKA, StandId.ARTE);

    // Visible labels for filters & inputs
    const labelsText = Array.from(parent.querySelectorAll("label")).map(
      (l) => l.textContent,
    );
    expect(labelsText).toContain(ADMIN_UI_TEXT.MEDIA_ROOM_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.MEDIA_STAND_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.MEDIA_FILE_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.MEDIA_TITLE_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.MEDIA_FORMAT_LABEL);

    // Friendly format chips instead of raw DB enums
    const chips = Array.from(
      parent.querySelectorAll(`.${ADMIN_UI_CLASSES.MEDIA_FORMAT_CHIP}`),
    ).map((el) => el.textContent);
    expect(chips).toEqual([
      ADMIN_UI_TEXT.MEDIA_KIND_IMAGE_2D,
      ADMIN_UI_TEXT.MEDIA_KIND_VIDEO_SBS,
    ]);
    expect(parent.textContent).not.toContain("IMAGE_2D");
    expect(parent.textContent).not.toContain("VIDEO_STEREO_SBS");

    // No bottom <details> hint in MediaManagerWidget; format help sits beside label as popover trigger
    expect(parent.querySelector("details")).toBeNull();
    const helpBtn = parent.querySelector(
      '[data-help-toggle="format"]',
    ) as HTMLButtonElement;
    const helpPopover = parent.querySelector(
      '[data-help-popover="format"]',
    ) as HTMLElement;
    expect(helpBtn).not.toBeNull();
    expect(helpPopover).not.toBeNull();
    expect(helpBtn.getAttribute("aria-expanded")).toBe("false");
    expect(helpPopover.hidden).toBe(true);
    expect(helpPopover.textContent).toContain("Half-SBS");

    helpBtn.click();
    expect(helpBtn.getAttribute("aria-expanded")).toBe("true");
    expect(helpPopover.hidden).toBe(false);

    helpBtn.click();
    expect(helpBtn.getAttribute("aria-expanded")).toBe("false");
    expect(helpPopover.hidden).toBe(true);

    // Reorder buttons include accessible aria-label
    const moveDownBtn = parent.querySelector(
      '[data-item-id="w-1"] [data-action="move-down"]',
    ) as HTMLButtonElement;
    expect(moveDownBtn.getAttribute("aria-label")).toBe(
      ADMIN_UI_TEXT.MEDIA_MOVE_DOWN_ARIA,
    );

    // Submitting form without file renders inline validation error
    const uploadForm = parent.querySelector("form") as HTMLFormElement;
    uploadForm.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(parent.textContent).toContain(ADMIN_UI_TEXT.MEDIA_MISSING_FILE_ERROR);

    // Two-step delete cancel restores normal actions without calling DELETE
    const firstDeleteBtn = parent.querySelector(
      '[data-item-id="w-1"] [data-action="delete"]',
    ) as HTMLButtonElement;
    firstDeleteBtn.click();
    const cancelDeleteBtn = parent.querySelector(
      '[data-item-id="w-1"] [data-action="cancel-delete"]',
    ) as HTMLButtonElement;
    expect(cancelDeleteBtn).not.toBeNull();
    cancelDeleteBtn.click();
    expect(
      parent.querySelector('[data-item-id="w-1"] [data-action="delete"]'),
    ).not.toBeNull();
    expect(mediaFetcher.delete).not.toHaveBeenCalled();

    // Download button triggers presigned GET and downloadTrigger
    const downloadBtn = parent.querySelector(
      '[data-item-id="w-1"] [data-action="download"]',
    ) as HTMLButtonElement;
    expect(downloadBtn).not.toBeNull();
    downloadBtn.click();
    await vi.waitFor(() => {
      expect(downloadTrigger).toHaveBeenCalledWith(
        "https://r2.example.com/signed-w1",
        "estambre.webp",
      );
    });

    // Real-time upload progress bar is hidden when idle and renders percentage while uploading
    const progressEl = parent.querySelector(
      '[data-upload-progress="media"]',
    ) as HTMLElement;
    expect(progressEl).not.toBeNull();
    expect(progressEl.hidden).toBe(true);

    let resolveUpload: (() => void) | null = null;
    (mediaFetcher.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        media: {
          key: "rooms/wixarika/arte/img.webp",
          uploadUrl: "https://r2.example.com/img.webp",
          headers: { "Content-Type": "image/webp" },
        },
      })
      .mockResolvedValueOnce({
        item: {
          id: "w-3",
          roomId: RoomId.WIXARIKA,
          standId: StandId.ARTE,
          mediaType: ExhibitMediaType.IMAGE_2D,
          title: "Nueva Foto",
          creatorName: "",
          description: "",
          mediaUrl: "https://pub.r2.dev/w-3.webp",
          sortOrder: 2,
        },
      });
    (mediaFetcher.putBinary as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (
        _url: string,
        _body: Blob,
        _headers: Record<string, string>,
        onProgress?: (p: { loaded: number; total: number; percent: number }) => void,
      ) => {
        onProgress?.({ loaded: 65, total: 100, percent: 65 });
        await new Promise<void>((resolve) => {
          resolveUpload = resolve;
        });
      },
    );

    const processorStub = {
      optimizeImage: vi.fn(async () => ({
        blob: new Blob(["webp"], { type: "image/webp" }),
        mimeType: "image/webp" as const,
        width: 800,
        height: 600,
      })),
    };
    const progressStore = new AdminMediaStore({
      getToken: () => "jwt-token",
      onUnauthorized: () => {},
      fetcher: mediaFetcher,
      processor: processorStub as never,
    });
    const progressWidget = new MediaManagerWidget(progressStore);
    const p2 = document.createElement("div");
    document.body.appendChild(p2);
    progressWidget.mount(p2);

    const uploadPromise = progressStore.uploadMedia({
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      file: new File(["img"], "nueva.jpg", { type: "image/jpeg" }),
      mediaKind: ExhibitMediaType.IMAGE_2D,
      title: "Nueva Foto",
      creatorName: "",
      description: "",
    });

    await vi.waitFor(() => {
      expect(resolveUpload).not.toBeNull();
      const bar = p2.querySelector(
        '[data-upload-progress="media"]',
      ) as HTMLElement;
      expect(bar.hidden).toBe(false);
      expect(bar.getAttribute("aria-valuenow")).toBe("65");
      expect(bar.textContent).toContain("65%");
    });

    resolveUpload?.();
    await uploadPromise;

    const finishedBar = p2.querySelector(
      '[data-upload-progress="media"]',
    ) as HTMLElement;
    expect(finishedBar.hidden).toBe(true);
    progressWidget.unmount();

    widget.unmount();
  });
});
