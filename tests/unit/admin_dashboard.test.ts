import { assert } from "../helpers/assert";
import { MockStorage } from "../helpers/mock_storage";
import { MockElement, setupMockDocument } from "../helpers/mock_dom";
import { AppRoute, RouteMatcher } from "../../src/navigation/route-matcher";
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
  AdminDashboardView,
  AdminController,
} from "../../src/admin/index";

function runAdminDashboardUnitTests(): void {
  console.log(
    "--- [UNIT TEST] Admin Dashboard Full Vertical Slice (M3 Redesign) ---",
  );

  // Test 1: RouteMatcher matching patterns
  {
    assert.equal(RouteMatcher.match("/admin", ""), AppRoute.ADMIN);
    assert.equal(RouteMatcher.match("/admin/", ""), AppRoute.ADMIN);
    assert.equal(RouteMatcher.match("/", "#/admin"), AppRoute.ADMIN);
    assert.equal(RouteMatcher.match("", "#/admin/"), AppRoute.ADMIN);
    assert.equal(RouteMatcher.match("/ADMIN", ""), AppRoute.ADMIN);
    assert.equal(RouteMatcher.match("/", ""), AppRoute.VISITOR);
    assert.equal(RouteMatcher.match("/experience", ""), AppRoute.VISITOR);
    assert.equal(RouteMatcher.match("/", "#/welcome"), AppRoute.VISITOR);
    console.log(
      "✓ Test 1 Passed: RouteMatcher accurately detects admin vs visitor routes",
    );
  }

  // Test 2: AdminAuthStore lifecycle and state transitions
  {
    const storage = new MockStorage();
    const authStore = new AdminAuthStore(storage);

    // Initial state
    const initial = authStore.getState();
    assert.equal(initial.isAuthenticated, false);
    assert.equal(initial.token, null);
    assert.equal(initial.user, null);

    // Invalid credentials
    const failedLogin = authStore.login({
      username: "invalid_librarian",
      password: "wrong_password",
    });
    assert.equal(failedLogin, false);
    assert.equal(authStore.getState().isAuthenticated, false);

    // Subscription listener check
    let listenerCalled = false;
    const unsubscribe = authStore.subscribe((state) => {
      listenerCalled = true;
      assert.equal(state.isAuthenticated, true);
    });

    // Valid credentials login
    const successLogin = authStore.login({
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      password: ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    });
    assert.equal(successLogin, true);
    assert.equal(listenerCalled, true);

    const activeState = authStore.getState();
    assert.equal(activeState.isAuthenticated, true);
    assert.ok(
      activeState.token?.startsWith(ADMIN_AUTH_CONSTANTS.MOCK_TOKEN_PREFIX),
    );
    assert.equal(
      activeState.user?.username,
      ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
    );
    assert.equal(activeState.user?.role, ADMIN_AUTH_CONSTANTS.DEFAULT_ROLE);

    // Persistence reload test (simulating page reload with existing session)
    const reloadedStore = new AdminAuthStore(storage);
    const reloadedState = reloadedStore.getState();
    assert.equal(reloadedState.isAuthenticated, true);
    assert.equal(reloadedState.token, activeState.token);

    // Logout
    unsubscribe();
    authStore.logout();
    assert.equal(authStore.getState().isAuthenticated, false);
    assert.equal(authStore.getState().token, null);
    assert.equal(authStore.getState().user, null);

    // Check storage cleared
    assert.equal(storage.getItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY), null);
    console.log(
      "✓ Test 2 Passed: AdminAuthStore authentication and persistence valid",
    );
  }

  // Test 3: AdminDashboardStore counter and bounds clamping
  {
    const store = new AdminDashboardStore(7);
    assert.equal(store.getState().activeVisitorsCount, 7);

    // Set count
    store.setVisitorCount(8);
    assert.equal(store.getState().activeVisitorsCount, 8);

    store.setVisitorCount(7);
    assert.equal(store.getState().activeVisitorsCount, 7);

    // Negative clamp protection
    store.setVisitorCount(-5);
    assert.equal(
      store.getState().activeVisitorsCount,
      ADMIN_DASHBOARD_CONSTANTS.MIN_VISITOR_COUNT,
    );

    // Subscription notification on visitor change
    let notifiedCount = 0;
    const unsub = store.subscribe((state) => {
      notifiedCount = state.activeVisitorsCount;
    });
    store.setVisitorCount(15);
    assert.equal(notifiedCount, 15);
    unsub();

    // Polling toggle lifecycle
    assert.equal(store.isPolling(), false);
    store.startPolling();
    assert.equal(store.isPolling(), true);
    store.stopPolling();
    assert.equal(store.isPolling(), false);

    console.log(
      "✓ Test 3 Passed: AdminDashboardStore counter and clamp operations valid",
    );
  }

  // Test 4: Survey metrics and rating calculation
  {
    const store = new AdminDashboardStore(5);
    assert.equal(store.getState().surveys.length, 4);

    const initialAvg = store.getAverageRating();
    assert.ok(initialAvg >= 1 && initialAvg <= 5);

    // Add survey entry dynamically
    store.addSurvey({
      id: "srv-test-new",
      timestamp: Date.now(),
      rating: 5,
      feedback: "Impresionante experiencia",
      viewMode: "vr",
    });

    assert.equal(store.getState().surveys.length, 5);
    assert.equal(store.getState().surveys[0].id, "srv-test-new");

    // Empty surveys average rating fallback
    const emptyStore = new AdminDashboardStore(0, []);
    assert.equal(emptyStore.getAverageRating(), 0);

    console.log(
      "✓ Test 4 Passed: Survey calculations and ordering valid",
    );
  }

  // Test 5: Hourly attendance data conforming to chart contracts
  {
    const store = new AdminDashboardStore();
    const dataset = store.getState().hourlyAttendance;

    assert.equal(
      dataset.labels.length,
      ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS.length,
    );
    assert.equal(
      dataset.values.length,
      ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_ATTENDANCE.length,
    );

    for (const val of dataset.values) {
      assert.ok(typeof val === "number" && val >= 0);
    }

    console.log(
      "✓ Test 5 Passed: Hourly attendance dataset conforms to chart contract",
    );
  }

  // Test 6: AdminLoginModalView lifecycle and authentication flow
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
    const authStore = new AdminAuthStore(new MockStorage());
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
    assert.ok(modalElement !== null);

    // Initial state: inputs blank
    const initialInputs = modal.getInputs();
    assert.equal(initialInputs.user, "");
    assert.equal(initialInputs.pass, "");

    // Show and Hide display checks
    modal.show();
    assert.equal(modalElement.style.display, "flex");
    modal.hide();
    assert.equal(modalElement.style.display, "none");

    // Return to public tour action check
    const formElement = (modalElement as unknown as MockElement).children[0]
      .children[1];
    assert.ok(formElement !== null);
    const returnBtn = formElement.children[4];
    assert.equal(returnBtn.textContent, ADMIN_UI_TEXT.LOGIN_RETURN_LINK);
    returnBtn.dispatchEvent("click");
    assert.equal(returnedToTour, true);

    // Failed login submission
    modal.show();
    modal.setCredentials("invalid_user", "bad_password");
    formElement.dispatchEvent("submit");
    assert.equal(loginSucceeded, false);
    assert.equal(authStore.getState().isAuthenticated, false);

    // Successful login submission
    modal.setCredentials(
      ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    );
    formElement.dispatchEvent("submit");

    assert.equal(loginSucceeded, true);
    assert.equal(authStore.getState().isAuthenticated, true);
    const clearedInputs = modal.getInputs();
    assert.equal(clearedInputs.user, "");
    assert.equal(clearedInputs.pass, "");

    // Unmount
    modal.unmount();
    assert.equal(modal.getElement(), null);
    console.log(
      "✓ Test 6 Passed: AdminLoginModalView lifecycle and authentication flow valid",
    );
  }

  // Test 7: AdminHeaderWidget presentation, return-to-tour, and logout triggers
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
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
    const el = header.getElement() as unknown as MockElement;
    assert.ok(el !== null);

    // Verify brand title and subtitle
    const brand = el.children[0];
    assert.equal(
      brand.children[0].children[0].textContent,
      ADMIN_UI_TEXT.HEADER_TITLE,
    );

    // Actions: child 0 is exit button, child 1 is logout button
    const actions = el.children[1];
    const exitBtn = actions.children[0];
    assert.equal(exitBtn.textContent, ADMIN_UI_TEXT.HEADER_EXIT_BTN);
    exitBtn.dispatchEvent("click");
    assert.equal(returnedToTour, true);

    const logoutBtn = actions.children[1];
    assert.equal(logoutBtn.textContent, ADMIN_UI_TEXT.HEADER_LOGOUT_BTN);
    logoutBtn.dispatchEvent("click");
    assert.equal(loggedOut, true);

    header.unmount();
    assert.equal(header.getElement(), null);
    console.log(
      "✓ Test 7 Passed: AdminHeaderWidget mounts clean M3 top bar and triggers logout & return",
    );
  }

  // Test 8: AttendanceChartWidget active metric display and reactive updates
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
    const store = new AdminDashboardStore(5);

    const chartWidget = new AttendanceChartWidget(store);
    chartWidget.mount(parent);

    const el = chartWidget.getElement() as unknown as MockElement;
    assert.ok(el !== null);

    const kpiRow = el.children[1];
    const valueSpan = kpiRow.children[0];
    assert.equal(valueSpan.textContent, "5");

    // Direct store fluctuation reactivity
    store.setVisitorCount(6);
    assert.equal(store.getState().activeVisitorsCount, 6);
    assert.equal(valueSpan.textContent, "6");

    store.setVisitorCount(5);
    assert.equal(store.getState().activeVisitorsCount, 5);
    assert.equal(valueSpan.textContent, "5");

    chartWidget.unmount();
    assert.equal(chartWidget.getElement(), null);
    console.log(
      "✓ Test 8 Passed: AttendanceChartWidget M3 metric display and reactive updates valid",
    );
  }

  // Test 9: SurveysTableWidget row rendering and average badge
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
    const store = new AdminDashboardStore(5);

    const tableWidget = new SurveysTableWidget(store);
    tableWidget.mount(parent);

    const el = tableWidget.getElement() as unknown as MockElement;
    assert.ok(el !== null);

    const avgBadge = el.children[0].children[1];
    assert.ok(avgBadge.textContent.includes(ADMIN_UI_TEXT.SURVEY_AVG_PREFIX));
    assert.ok(avgBadge.textContent.includes(ADMIN_UI_TEXT.RATING_SCALE_SUFFIX));

    const tbody = el.children[1].children[0].children[1];
    assert.ok(tbody.children.length > 0);

    // Verify mode chip uses centralized token text
    const firstRowModeChip = tbody.children[0].children[1].children[0];
    assert.ok(
      firstRowModeChip.textContent === ADMIN_UI_TEXT.VIEW_MODE_VR ||
      firstRowModeChip.textContent === ADMIN_UI_TEXT.VIEW_MODE_2D,
    );

    // Adding a survey dynamically triggers table re-render
    const initialRowsCount = tbody.children.length;
    store.addSurvey({
      id: "srv-dynamic-99",
      timestamp: Date.now(),
      rating: 5,
      feedback: "Dynamic test review",
      viewMode: "vr",
    });
    assert.equal(tbody.children.length, initialRowsCount + 1);

    tableWidget.unmount();
    assert.equal(tableWidget.getElement(), null);
    console.log(
      "✓ Test 9 Passed: SurveysTableWidget reactive table updates valid",
    );
  }

  // Test 10: AttendanceChartWidget lifecycle and safe unmount
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
    const store = new AdminDashboardStore(5);

    const chartWidget = new AttendanceChartWidget(store);
    chartWidget.mount(parent);

    const el = chartWidget.getElement() as unknown as MockElement;
    assert.ok(el !== null);

    const header = el.children[0];
    const peakBadge = header.children[1];
    assert.ok(peakBadge.textContent.includes(ADMIN_UI_TEXT.PEAK_LABEL_PREFIX));

    const kpiRow = el.children[1];
    const valueSpan = kpiRow.children[0];
    assert.equal(valueSpan.textContent, "5");

    const canvas = el.children[2].children[0];
    assert.equal(canvas.getAttribute("role"), "img");
    assert.equal(canvas.getAttribute("aria-label"), ADMIN_UI_TEXT.CHART_TITLE);

    // Reactivity check on live visitor change
    store.setVisitorCount(6);
    assert.equal(valueSpan.textContent, "6");

    chartWidget.unmount();
    assert.equal(chartWidget.getElement(), null);
    console.log(
      "✓ Test 10 Passed: AttendanceChartWidget canvas mounting and unmount valid",
    );
  }

  // Test 11: AdminController state orchestration & 3D canvas suppression with pause/play lifecycle
  {
    const sceneMock = new MockElement("a-scene");
    sceneMock.play();
    assert.equal(sceneMock.isPlaying, true);

    const rootMock = new MockElement("div");
    setupMockDocument(rootMock, sceneMock);

    const authStore = new AdminAuthStore(new MockStorage());
    const dashboardStore = new AdminDashboardStore(7);

    const controller = new AdminController(
      rootMock as unknown as HTMLElement,
      authStore,
      dashboardStore,
    );

    // 3D scene must be suppressed and paused
    assert.equal(sceneMock.style.display, "none");
    assert.equal(sceneMock.isPlaying, false);

    // Initially unauthenticated -> login modal mounted
    assert.equal(authStore.getState().isAuthenticated, false);

    // Login transition
    authStore.login({
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      password: ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    });
    assert.equal(authStore.getState().isAuthenticated, true);
    assert.equal(dashboardStore.isPolling(), true);

    // Logout transition
    authStore.logout();
    assert.equal(authStore.getState().isAuthenticated, false);
    assert.equal(dashboardStore.isPolling(), false);

    // Destroy restores 3D scene display and play status
    controller.destroy();
    assert.equal(sceneMock.style.display, "");
    assert.equal(sceneMock.isPlaying, true);

    console.log(
      "✓ Test 11 Passed: AdminController canvas suppression and auth orchestration valid",
    );
  }

  // Test 12: CSS class token contract consistency
  {
    for (const [key, className] of Object.entries(ADMIN_UI_CLASSES)) {
      assert.ok(
        typeof className === "string" && className.length > 0,
        `CSS class for ${key} must not be empty`,
      );
      assert.ok(
        className.includes("cv-admin") || className.includes("cv-"),
        `Class token for ${key} must use standard design token namespace prefix ('${className}')`,
      );
    }
    console.log(
      "✓ Test 12 Passed: CSS class tokens strictly adhere to design system namespaces",
    );
  }

  // Test 13: Responsive thresholds consistency
  {
    assert.ok(ADMIN_THRESHOLDS.MAX_CAPACITY >= 20);
    assert.ok(ADMIN_THRESHOLDS.CAPACITY_OPTIMAL_MAX > 0);
    assert.ok(
      ADMIN_THRESHOLDS.CAPACITY_MODERATE_MAX >
        ADMIN_THRESHOLDS.CAPACITY_OPTIMAL_MAX,
    );
    console.log(
      "✓ Test 13 Passed: Dashboard capacity threshold hierarchy valid",
    );
  }

  console.log("All M3 Redesign unit tests passed successfully.");
}

runAdminDashboardUnitTests();
