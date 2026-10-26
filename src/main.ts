import "./style.css";
import "aframe";
import { AppRouter } from "./app";

function bootstrap(): void {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error(
      "[Culturas Vivas] Root mounting container #app not found in document.",
    );
  }

  const router = new AppRouter(root);
  (window as unknown as { __CV_ROUTER__?: AppRouter }).__CV_ROUTER__ = router;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
