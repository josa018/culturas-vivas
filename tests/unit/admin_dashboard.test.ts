import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppRoute, RouteMatcher } from "../../src/navigation/route-matcher";

vi.mock("chart.js", () => {
  class MockChart {
    static register = vi.fn();
    data = { datasets: [{ data: [] }] };
    update = vi.fn();
    destroy = vi.fn();
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

describe("Admin Dashboard Full Vertical Slice (M3 Redesign)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        activeSessions: 5,
      }),
    } as unknown as Response);
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

  it("AdminAuthStore manages lifecycle, authentication, and persistence", () => {
    const storage = new InMemoryStorage();
    const authStore = new AdminAuthStore(storage);

    // Initial state
    const initial = authStore.getState();
    expect(initial.isAuthenticated).toBe(false);
    expect(initial.token).toBeNull();
    expect(initial.user).toBeNull();

    // Invalid credentials
    const failedLogin = authStore.login({
      username: "invalid_librarian",
      password: "wrong_password",
    });
    expect(failedLogin).toBe(false);
    expect(authStore.getState().isAuthenticated).toBe(false);

    // Subscription listener check
    let listenerCalled = false;
    const unsubscribe = authStore.subscribe((state) => {
      listenerCalled = true;
      expect(state.isAuthenticated).toBe(true);
    });

    // Valid credentials login
    const successLogin = authStore.login({
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      password: ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    });
    expect(successLogin).toBe(true);
    expect(listenerCalled).toBe(true);

    const activeState = authStore.getState();
    expect(activeState.isAuthenticated).toBe(true);
    expect(
      activeState.token?.startsWith(ADMIN_AUTH_CONSTANTS.MOCK_TOKEN_PREFIX)
    ).toBe(true);
    expect(activeState.user?.username).toBe(
      ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME
    );
    expect(activeState.user?.role).toBe(ADMIN_AUTH_CONSTANTS.DEFAULT_ROLE);

    // Persistence reload test
    const reloadedStore = new AdminAuthStore(storage);
    const reloadedState = reloadedStore.getState();
    expect(reloadedState.isAuthenticated).toBe(true);
    expect(reloadedState.token).toBe(activeState.token);

    // Logout
    unsubscribe();
    authStore.logout();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(authStore.getState().token).toBeNull();
    expect(authStore.getState().user).toBeNull();

    // Check storage cleared
    expect(storage.getItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY)).toBeNull();
  });

  it("AdminDashboardStore handles counter and bounds clamping", () => {
    const store = new AdminDashboardStore(7);
    expect(store.getState().activeVisitorsCount).toBe(7);

    store.setVisitorCount(8);
    expect(store.getState().activeVisitorsCount).toBe(8);

    store.setVisitorCount(7);
    expect(store.getState().activeVisitorsCount).toBe(7);

    // Negative clamp protection
    store.setVisitorCount(-5);
    expect(store.getState().activeVisitorsCount).toBe(
      ADMIN_DASHBOARD_CONSTANTS.MIN_VISITOR_COUNT
    );

    // Subscription notification on visitor change
    let notifiedCount = 0;
    const unsub = store.subscribe((state) => {
      notifiedCount = state.activeVisitorsCount;
    });
    store.setVisitorCount(15);
    expect(notifiedCount).toBe(15);
    unsub();

    // Polling toggle lifecycle
    expect(store.isPolling()).toBe(false);
    store.startPolling();
    expect(store.isPolling()).toBe(true);
    store.stopPolling();
    expect(store.isPolling()).toBe(false);
  });

  it("computes survey metrics and average rating correctly", () => {
    const store = new AdminDashboardStore(5);
    expect(store.getState().surveys.length).toBe(4);

    const initialAvg = store.getAverageRating();
    expect(initialAvg).toBeGreaterThanOrEqual(1);
    expect(initialAvg).toBeLessThanOrEqual(5);

    // Add survey entry dynamically
    store.addSurvey({
      id: "srv-test-new",
      timestamp: Date.now(),
      rating: 5,
      feedback: "Impresionante experiencia",
      viewMode: "vr",
    });

    expect(store.getState().surveys.length).toBe(5);
    expect(store.getState().surveys[0].id).toBe("srv-test-new");

    // Empty surveys average rating fallback
    const emptyStore = new AdminDashboardStore(0, []);
    expect(emptyStore.getAverageRating()).toBe(0);
  });

  it("generates hourly attendance dataset conforming to chart contract", () => {
    const store = new AdminDashboardStore();
    const dataset = store.getState().hourlyAttendance;

    expect(dataset.labels.length).toBe(
      ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS.length
    );
    expect(dataset.values.length).toBe(
      ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_ATTENDANCE.length
    );

    for (const val of dataset.values) {
      expect(typeof val).toBe("number");
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  it("validates AdminLoginModalView lifecycle and authentication flow", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const authStore = new AdminAuthStore(new InMemoryStorage());
    let loginSucceeded = false;
    let returnedToTour = false;

    const modal = new AdminLoginModalView({
      authStore,
      onLoginSuccess: () => {
        loginSucceeded = true;
      },
      onReturnToTour: () => {
        returnedToTour = true;
      },
    });

    modal.mount(parent);
    const modalElement = modal.getElement();
    expect(modalElement).not.toBeNull();

    // Initial state: inputs blank
    const initialInputs = modal.getInputs();
    expect(initialInputs.user).toBe("");
    expect(initialInputs.pass).toBe("");

    // Show and Hide display checks
    modal.show();
    expect(modalElement!.style.display).toBe("flex");
    modal.hide();
    expect(modalElement!.style.display).toBe("none");

    // Return to public tour action check
    const formElement = modalElement!.children[0].children[1] as HTMLFormElement;
    expect(formElement).not.toBeNull();
    const returnBtn = formElement.children[4] as HTMLElement;
    expect(returnBtn.textContent).toBe(ADMIN_UI_TEXT.LOGIN_RETURN_LINK);
    returnBtn.click();
    expect(returnedToTour).toBe(true);

    // Failed login submission
    modal.show();
    modal.setCredentials("invalid_user", "bad_password");
    formElement.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(loginSucceeded).toBe(false);
    expect(authStore.getState().isAuthenticated).toBe(false);

    // Successful login submission
    modal.setCredentials(
      ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD
    );
    formElement.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(loginSucceeded).toBe(true);
    expect(authStore.getState().isAuthenticated).toBe(true);
    const clearedInputs = modal.getInputs();
    expect(clearedInputs.user).toBe("");
    expect(clearedInputs.pass).toBe("");

    // Unmount
    modal.unmount();
    expect(modal.getElement()).toBeNull();
  });

  it("mounts AdminHeaderWidget and triggers logout & return-to-tour", () => {
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
    expect(el).not.toBeNull();

    // Brand title
    const brand = el.children[0];
    expect(brand.children[0].children[0].textContent).toBe(
      ADMIN_UI_TEXT.HEADER_TITLE
    );

    // Actions: child 0 is exit button, child 1 is logout button
    const actions = el.children[1];
    const exitBtn = actions.children[0] as HTMLElement;
    expect(exitBtn.textContent).toBe(ADMIN_UI_TEXT.HEADER_EXIT_BTN);
    exitBtn.click();
    expect(returnedToTour).toBe(true);

    const logoutBtn = actions.children[1] as HTMLElement;
    expect(logoutBtn.textContent).toBe(ADMIN_UI_TEXT.HEADER_LOGOUT_BTN);
    logoutBtn.click();
    expect(loggedOut).toBe(true);

    header.unmount();
    expect(header.getElement()).toBeNull();
  });

  it("updates AttendanceChartWidget KPI row reactively", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const store = new AdminDashboardStore(5);

    const chartWidget = new AttendanceChartWidget(store);
    chartWidget.mount(parent);

    const el = chartWidget.getElement()!;
    expect(el).not.toBeNull();

    const kpiRow = el.children[1];
    const valueSpan = kpiRow.children[0];
    expect(valueSpan.textContent).toBe("5");

    store.setVisitorCount(6);
    expect(store.getState().activeVisitorsCount).toBe(6);
    expect(valueSpan.textContent).toBe("6");

    store.setVisitorCount(5);
    expect(store.getState().activeVisitorsCount).toBe(5);
    expect(valueSpan.textContent).toBe("5");

    chartWidget.unmount();
    expect(chartWidget.getElement()).toBeNull();
  });

  it("renders SurveysTableWidget rows and updates reactively", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const store = new AdminDashboardStore(5);

    const tableWidget = new SurveysTableWidget(store);
    tableWidget.mount(parent);

    const el = tableWidget.getElement()!;
    expect(el).not.toBeNull();

    const avgBadge = el.children[0].children[1];
    expect(avgBadge.textContent).toContain(ADMIN_UI_TEXT.SURVEY_AVG_PREFIX);
    expect(avgBadge.textContent).toContain(ADMIN_UI_TEXT.RATING_SCALE_SUFFIX);

    const tbody = el.children[1].children[0].children[1];
    expect(tbody.children.length).toBeGreaterThan(0);

    const firstRowModeChip = tbody.children[0].children[1].children[0];
    expect(
      firstRowModeChip.textContent === ADMIN_UI_TEXT.VIEW_MODE_VR ||
        firstRowModeChip.textContent === ADMIN_UI_TEXT.VIEW_MODE_2D
    ).toBe(true);

    const initialRowsCount = tbody.children.length;
    store.addSurvey({
      id: "srv-dynamic-99",
      timestamp: Date.now(),
      rating: 5,
      feedback: "Dynamic test review",
      viewMode: "vr",
    });
    expect(tbody.children.length).toBe(initialRowsCount + 1);

    tableWidget.unmount();
    expect(tableWidget.getElement()).toBeNull();
  });

  it("handles AttendanceChartWidget canvas mounting and lifecycle", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const store = new AdminDashboardStore(5);

    const chartWidget = new AttendanceChartWidget(store);
    chartWidget.mount(parent);

    const el = chartWidget.getElement()!;
    expect(el).not.toBeNull();

    const header = el.children[0];
    const peakBadge = header.children[1];
    expect(peakBadge.textContent).toContain(ADMIN_UI_TEXT.PEAK_LABEL_PREFIX);

    const kpiRow = el.children[1];
    const valueSpan = kpiRow.children[0];
    expect(valueSpan.textContent).toBe("5");

    const canvas = el.children[2].children[0];
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBe(ADMIN_UI_TEXT.CHART_TITLE);

    store.setVisitorCount(6);
    expect(valueSpan.textContent).toBe("6");

    chartWidget.unmount();
    expect(chartWidget.getElement()).toBeNull();
  });

  it("suppresses 3D canvas and orchestrates AdminController state and restore lifecycle", () => {
    const sceneMock = document.createElement("a-scene") as HTMLElement & {
      isPlaying: boolean;
      play: () => void;
      pause: () => void;
    };
    sceneMock.isPlaying = false;
    sceneMock.play = () => {
      sceneMock.isPlaying = true;
    };
    sceneMock.pause = () => {
      sceneMock.isPlaying = false;
    };
    sceneMock.play();
    expect(sceneMock.isPlaying).toBe(true);

    const rootMock = document.createElement("div");
    document.body.appendChild(sceneMock);
    document.body.appendChild(rootMock);

    const authStore = new AdminAuthStore(new InMemoryStorage());
    const dashboardStore = new AdminDashboardStore(7);

    const controller = new AdminController(
      rootMock,
      authStore,
      dashboardStore
    );

    // 3D scene must be suppressed and paused
    expect(sceneMock.style.display).toBe("none");
    expect(sceneMock.isPlaying).toBe(false);

    // Initially unauthenticated -> login modal mounted
    expect(authStore.getState().isAuthenticated).toBe(false);

    // Login transition
    authStore.login({
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      password: ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    });
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(dashboardStore.isPolling()).toBe(true);

    // Logout transition
    authStore.logout();
    expect(authStore.getState().isAuthenticated).toBe(false);
    expect(dashboardStore.isPolling()).toBe(false);

    // Destroy restores 3D scene display and play status
    controller.destroy();
    expect(sceneMock.style.display).toBe("");
    expect(sceneMock.isPlaying).toBe(true);
  });

  it("strictly adheres CSS class tokens to design system namespaces", () => {
    for (const [key, className] of Object.entries(ADMIN_UI_CLASSES)) {
      expect(typeof className).toBe("string");
      expect(className.length).toBeGreaterThan(0);
      expect(
        className.includes("cv-admin") || className.includes("cv-")
      ).toBe(true);
    }
  });

  it("maintains consistent responsive capacity threshold hierarchy", () => {
    expect(ADMIN_THRESHOLDS.MAX_CAPACITY).toBeGreaterThanOrEqual(20);
    expect(ADMIN_THRESHOLDS.CAPACITY_OPTIMAL_MAX).toBeGreaterThan(0);
    expect(ADMIN_THRESHOLDS.CAPACITY_MODERATE_MAX).toBeGreaterThan(
      ADMIN_THRESHOLDS.CAPACITY_OPTIMAL_MAX
    );
  });
});
