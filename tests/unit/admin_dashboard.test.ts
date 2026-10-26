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
  AdminLoginModalView,
} from "../../src/admin/index";

function runAdminDashboardUnitTests(): void {
  console.log(
    "--- [UNIT TEST] Admin Dashboard, Auth & Login Modal (Slices 1 & 2) ---",
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

  // Test 6: AdminLoginModalView mounting, validation failure, and success transitions (Slice 2)
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

  console.log("All Slice 1 & 2 unit tests passed successfully.");
}

runAdminDashboardUnitTests();
