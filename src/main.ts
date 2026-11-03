import "aframe";
import "./experience/components/inspectable";
import "./experience/components/stereo-media";
import "./style.css";
import { AppRouter } from "./app";
import { AppRoute, RouteMatcher } from "./navigation/route-matcher";
import { AdminController } from "./admin/index";
import { VisitorSessionManager } from "./session/visitor-session-manager";

// Defensive runtime guard for A-Frame look-controls on mobile devices
if (
  typeof AFRAME !== "undefined" &&
  AFRAME.components &&
  AFRAME.components["look-controls"]
) {
  const lookControlsProto = AFRAME.components["look-controls"].Component
    .prototype as {
    setupMagicWindowControls?: () => void;
  };
  const originalSetupMagicWindowControls =
    lookControlsProto.setupMagicWindowControls;
  if (typeof originalSetupMagicWindowControls === "function") {
    lookControlsProto.setupMagicWindowControls = function (this: {
      el?: {
        sceneEl?: {
          components?: Record<
            string,
            { permissionGranted?: boolean; updateProperties?: () => void }
          >;
        };
      };
    }) {
      const scene = this.el?.sceneEl;
      let mockInjected = false;
      if (scene) {
        scene.components = scene.components || {};
        if (!scene.components["device-orientation-permission-ui"]) {
          scene.components["device-orientation-permission-ui"] = {
            permissionGranted: false,
            updateProperties: () => {},
          };
          mockInjected = true;
        }
      }
      try {
        originalSetupMagicWindowControls.call(this);
      } catch (err: unknown) {
        console.warn(
          "[LookControls] Handled setupMagicWindowControls error:",
          err,
        );
      } finally {
        if (mockInjected && scene?.components) {
          delete scene.components["device-orientation-permission-ui"];
        }
      }
    };
  }
}

// Production component for QA & Accessibility sensor fallback
AFRAME.registerComponent("control-sensores-qa", {
  init: function () {
    this.el.addEventListener("enter-vr", () => {
      this.evaluarSensoresDispositivo();
    });
  },

  evaluarSensoresDispositivo: function () {
    const fallbackTimeout = setTimeout(() => {
      this.activarFallbackTactil("Tiempo de espera agotado para el sensor.");
    }, 1000);

    if (
      typeof (
        DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        }
      ).requestPermission === "function"
    ) {
      (
        DeviceOrientationEvent as unknown as {
          requestPermission: () => Promise<string>;
        }
      )
        .requestPermission()
        .then((permissionState: string) => {
          clearTimeout(fallbackTimeout);
          if (permissionState === "granted") {
            console.log("[QA] Giroscopio autorizado con éxito.");
          } else {
            this.activarFallbackTactil("Permiso denegado por el usuario.");
          }
        })
        .catch((error: unknown) => {
          clearTimeout(fallbackTimeout);
          console.error("[QA] Error al solicitar sensores:", error);
          this.activarFallbackTactil("Error de hardware/sensores.");
        });
    } else {
      clearTimeout(fallbackTimeout);
      if (navigator.userAgent.indexOf("Mobile") === -1) {
        this.activarFallbackTactil(
          "Entorno de escritorio detectado sin hardware de movimiento.",
        );
      } else {
        console.log("[QA] Giroscopio activo directamente (Android u otros).");
      }
    }
  },

  activarFallbackTactil: function (motivo: string) {
    console.warn(`[QA Fallback Activo] Motivo: ${motivo}`);
    const statusContenedor = document.getElementById("vr-status-message");
    if (statusContenedor) {
      statusContenedor.innerText =
        "Sensores no disponibles. Activando visualización táctil 2D";
      statusContenedor.setAttribute("role", "status");
      statusContenedor.setAttribute("aria-live", "polite");
      statusContenedor.style.display = "block";
      statusContenedor.style.position = "absolute";
      statusContenedor.style.top = "20px";
      statusContenedor.style.left = "50%";
      statusContenedor.style.transform = "translateX(-50%)";
      statusContenedor.style.zIndex = "99999";
    }
  },
});

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

    const sessionManager = new VisitorSessionManager();
    void sessionManager.start();
    (
      window as unknown as { __CV_SESSION__?: VisitorSessionManager }
    ).__CV_SESSION__ = sessionManager;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
