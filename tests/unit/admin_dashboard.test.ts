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
  CapacityCounterCardWidget,
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

    // Invalid login attempt
    let notified = false;
    authStore.subscribe(() => {
      notified = true;
    });

    const failed = authStore.login({ username: "unknown", password: "wrong" });
    assert.equal(failed, false);
    assert.equal(notified, false);
    assert.equal(authStore.getState().isAuthenticated, false);

    // Successful login
    const success = authStore.login({
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      password: ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    });
    assert.equal(success, true);
    assert.equal(notified, true);

    const loggedIn = authStore.getState();
    assert.equal(loggedIn.isAuthenticated, true);
    assert.ok(
      loggedIn.token !== null &&
        loggedIn.token.startsWith(ADMIN_AUTH_CONSTANTS.MOCK_TOKEN_PREFIX),
    );
    assert.equal(
      loggedIn.user?.username,
      ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
    );
    assert.equal(loggedIn.user?.role, ADMIN_AUTH_CONSTANTS.DEFAULT_ROLE);

    // Persistence across sessions
    const restoredStore = new AdminAuthStore(storage);
    const restoredState = restoredStore.getState();
    assert.equal(restoredState.isAuthenticated, true);
    assert.equal(restoredState.token, loggedIn.token);

    // Logout
    let logoutNotified = false;
    restoredStore.subscribe(() => {
      logoutNotified = true;
    });
    restoredStore.logout();

    assert.equal(logoutNotified, true);
    assert.equal(restoredStore.getState().isAuthenticated, false);
    assert.equal(restoredStore.getState().token, null);
    assert.equal(storage.getItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY), null);
    console.log(
      "✓ Test 2 Passed: AdminAuthStore authentication and persistence valid",
    );
  }

  // Test 3: AdminDashboardStore capacity counter logic
  {
    const store = new AdminDashboardStore(5);
    assert.equal(store.getState().activeVisitorsCount, 5);

    let updatesCount = 0;
    store.subscribe(() => {
      updatesCount += 1;
    });

    store.incrementVisitor();
    assert.equal(store.getState().activeVisitorsCount, 6);
    assert.equal(updatesCount, 1);

    store.decrementVisitor();
    assert.equal(store.getState().activeVisitorsCount, 5);
    assert.equal(updatesCount, 2);

    // Clamping at zero floor
    store.setVisitorCount(0);
    assert.equal(store.getState().activeVisitorsCount, 0);

    store.decrementVisitor();
    assert.equal(store.getState().activeVisitorsCount, 0); // Must remain clamped at 0

    // Fluctuation logic
    store.fluctuateVisitors();
    assert.ok(store.getState().activeVisitorsCount >= 0);

    // Simulation lifecycle
    assert.equal(store.isSimulating(), false);
    store.startSimulation(100);
    assert.equal(store.isSimulating(), true);
    store.stopSimulation();
    assert.equal(store.isSimulating(), false);

    console.log(
      "✓ Test 3 Passed: AdminDashboardStore counter and clamp operations valid",
    );
  }

  // Test 4: AdminDashboardStore survey feed and metric calculations
  {
    const store = new AdminDashboardStore(
      ADMIN_DASHBOARD_CONSTANTS.DEFAULT_INITIAL_VISITOR_COUNT,
      [],
    );
    assert.equal(store.getAverageRating(), 0);

    store.addSurvey({
      id: "test-1",
      timestamp: Date.now(),
      rating: 4,
      feedback: "Good",
      viewMode: "vr",
    });
    assert.equal(store.getAverageRating(), 4.0);

    store.addSurvey({
      id: "test-2",
      timestamp: Date.now(),
      rating: 5,
      feedback: "Great",
      viewMode: "2d",
    });
    assert.equal(store.getAverageRating(), 4.5);
    assert.equal(store.getState().surveys.length, 2);
    assert.equal(store.getState().surveys[0].id, "test-2"); // Recent prepended
    console.log("✓ Test 4 Passed: Survey calculations and ordering valid");
  }

  // Test 5: Attendance dataset structure for chart rendering
  {
    const store = new AdminDashboardStore();
    const hourly = store.getState().hourlyAttendance;

    assert.equal(hourly.labels.length, hourly.values.length);
    assert.ok(hourly.labels.length > 0);
    assert.equal(typeof hourly.labels[0], "string");
    assert.equal(typeof hourly.values[0], "number");
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
    const modal = new AdminLoginModalView({
      authStore,
      onLoginSuccess: () => {
        loginSucceeded = true;
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

    // Failed login submission
    modal.show();
    modal.setCredentials("invalid_user", "bad_password");
    const formElement = (modalElement as unknown as MockElement).children[0]
      .children[1];
    assert.ok(formElement !== null);

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

  // Test 7: AdminHeaderWidget presentation and logout trigger
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
    let loggedOut = false;

    const header = new AdminHeaderWidget({
      username: "alfredo",
      role: "librarian",
      onLogout: () => {
        loggedOut = true;
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

    // Actions: child 0 is avatar chip, child 1 is logout button
    const actions = el.children[1];
    const logoutBtn = actions.children[1];
    assert.equal(logoutBtn.textContent, ADMIN_UI_TEXT.HEADER_LOGOUT_BTN);

    logoutBtn.dispatchEvent("click");
    assert.equal(loggedOut, true);

    header.unmount();
    assert.equal(header.getElement(), null);
    console.log(
      "✓ Test 7 Passed: AdminHeaderWidget mounts clean M3 top bar and triggers logout",
    );
  }

  // Test 8: CapacityCounterCardWidget active metric display and reactive updates
  {
    setupMockDocument();
    const parent = new MockElement("div") as unknown as HTMLElement;
    const store = new AdminDashboardStore(5);

    const counter = new CapacityCounterCardWidget(store);
    counter.mount(parent);

    const el = counter.getElement() as unknown as MockElement;
    assert.ok(el !== null);

    const cardBody = el.children[1];
    const metricContainer = cardBody.children[0];
    const valueSpan = metricContainer.children[0];

    assert.equal(valueSpan.textContent, "5");

    // Direct store fluctuation reactivity
    store.incrementVisitor();
    assert.equal(store.getState().activeVisitorsCount, 6);
    assert.equal(valueSpan.textContent, "6");

    store.decrementVisitor();
    assert.equal(store.getState().activeVisitorsCount, 5);
    assert.equal(valueSpan.textContent, "5");

    counter.unmount();
    assert.equal(counter.getElement(), null);
    console.log(
      "✓ Test 8 Passed: CapacityCounterCardWidget M3 metric display and reactive updates valid",
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
    assert.ok(avgBadge.textContent.includes("★"));

    const tbody = el.children[1].children[0].children[1];
    assert.ok(tbody.children.length > 0);

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

    const canvas = el.children[1].children[0];
    assert.equal(canvas.getAttribute("role"), "img");
    assert.equal(canvas.getAttribute("aria-label"), ADMIN_UI_TEXT.CHART_TITLE);

    chartWidget.unmount();
    assert.equal(chartWidget.getElement(), null);
    console.log(
      "✓ Test 10 Passed: AttendanceChartWidget canvas mounting and unmount valid",
    );
  }

  // Test 11: AdminController state orchestration & 3D canvas suppression
  {
    const sceneMock = new MockElement("a-scene");
    const rootMock = new MockElement("div");
    setupMockDocument(rootMock, sceneMock);

    const authStore = new AdminAuthStore(new MockStorage());
    const dashboardStore = new AdminDashboardStore(7);

    const controller = new AdminController(
      rootMock as unknown as HTMLElement,
      authStore,
      dashboardStore,
    );

    // IA-02: 3D scene must be suppressed
    assert.equal(sceneMock.style.display, "none");

    // Initially unauthenticated -> login modal mounted
    assert.equal(authStore.getState().isAuthenticated, false);

    // Login transition
    authStore.login({
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      password: ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD,
    });
    assert.equal(authStore.getState().isAuthenticated, true);
    assert.equal(dashboardStore.isSimulating(), true);

    // Logout transition
    authStore.logout();
    assert.equal(authStore.getState().isAuthenticated, false);
    assert.equal(dashboardStore.isSimulating(), false);

    controller.destroy();
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
