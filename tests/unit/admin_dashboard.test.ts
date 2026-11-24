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
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  AdminLoginModalView,
  AdminHeaderWidget,
  SurveysTableWidget,
  AttendanceChartWidget,
  AdminDashboardView,
  AdminMediaStore,
  AdminController,
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

  it("AdminDashboardView switches tabs between telemetry and MediaManagerWidget while keeping telemetry polling active", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const authStore = new AdminAuthStore(
      new InMemoryStorage(),
      new StubAdminFetcher(),
    );
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
    expect(itemCards[0]?.textContent).toContain("Crédito: María Cruz");

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

    // Delete item w-2
    const deleteBtn = mediaPanel.querySelector(
      '[data-item-id="w-2"] [data-action="delete"]',
    ) as HTMLButtonElement;
    deleteBtn.click();
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
});
