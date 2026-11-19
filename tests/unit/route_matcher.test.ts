import { describe, it, expect, afterEach, vi } from "vitest";
import { AppRoute, RouteMatcher } from "../../src/navigation/route-matcher";

describe("RouteMatcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { pathname: "/admin", hash: "", expected: AppRoute.ADMIN },
    { pathname: "/admin/", hash: "", expected: AppRoute.ADMIN },
    { pathname: "/ADMIN", hash: "", expected: AppRoute.ADMIN },
    { pathname: " /admin ", hash: "", expected: AppRoute.ADMIN },
    { pathname: "/", hash: "#/admin", expected: AppRoute.ADMIN },
    { pathname: "", hash: "#/admin/", expected: AppRoute.ADMIN },
    { pathname: "/", hash: "#/ADMIN", expected: AppRoute.ADMIN },
    { pathname: "/", hash: "", expected: AppRoute.VISITOR },
    { pathname: "/experience", hash: "", expected: AppRoute.VISITOR },
    { pathname: "/admin/settings", hash: "", expected: AppRoute.VISITOR },
    { pathname: "/", hash: "#/welcome", expected: AppRoute.VISITOR },
  ])(
    "matches pathname='$pathname' hash='$hash' -> $expected",
    ({ pathname, hash, expected }) => {
      expect(RouteMatcher.match(pathname, hash)).toBe(expected);
    },
  );

  it("reads window.location in getCurrentRoute()", () => {
    const originalLocation = window.location;
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...originalLocation,
      pathname: "/admin",
      hash: "",
    } as Location);

    expect(RouteMatcher.getCurrentRoute()).toBe(AppRoute.ADMIN);
  });
});
