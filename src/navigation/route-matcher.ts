export const AppRoute = {
  VISITOR: "VISITOR",
  ADMIN: "ADMIN",
} as const;

export type AppRoute = (typeof AppRoute)[keyof typeof AppRoute];

export const ROUTE_PATHS = {
  ADMIN_PATH: "/admin",
  ADMIN_PATH_SLASH: "/admin/",
  ADMIN_HASH: "#/admin",
  ADMIN_HASH_SLASH: "#/admin/",
  ROOT_PATH: "/",
} as const;

export class RouteMatcher {
  public static match(pathname: string, hash: string): AppRoute {
    const normalizedPath = pathname.toLowerCase().trim();
    const normalizedHash = hash.toLowerCase().trim();

    if (
      normalizedPath === ROUTE_PATHS.ADMIN_PATH ||
      normalizedPath === ROUTE_PATHS.ADMIN_PATH_SLASH ||
      normalizedHash === ROUTE_PATHS.ADMIN_HASH ||
      normalizedHash === ROUTE_PATHS.ADMIN_HASH_SLASH
    ) {
      return AppRoute.ADMIN;
    }

    return AppRoute.VISITOR;
  }

  public static getCurrentRoute(): AppRoute {
    if (typeof window === "undefined") {
      return AppRoute.VISITOR;
    }
    return RouteMatcher.match(window.location.pathname, window.location.hash);
  }
}
