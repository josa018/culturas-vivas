import "./style.css";
import "aframe";
import { AppRouter } from "./app";
import { AppRoute, RouteMatcher } from "./navigation/route-matcher";
import { AdminController } from "./admin/index";

function bootstrap(): void {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error(
      "[Culturas Vivas] Root mounting container #app not found in document.",
    );
  }

  const currentRoute = RouteMatcher.getCurrentRoute();
  if (currentRoute === AppRoute.ADMIN) {
    const admin = new AdminController(root);
    (window as unknown as { __CV_ADMIN__?: AdminController }).__CV_ADMIN__ =
      admin;
  } else {
    const router = new AppRouter(root);
    (window as unknown as { __CV_ROUTER__?: AppRouter }).__CV_ROUTER__ = router;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
