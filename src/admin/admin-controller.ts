import { AdminAuthStore } from "./admin-auth-store";
import { AdminDashboardStore } from "./admin-dashboard-store";
import { AdminLoginModalView } from "./views/admin-login-modal";
import { AdminDashboardView } from "./views/admin-dashboard-view";

export class AdminController {
  private readonly rootContainer: HTMLElement;
  private readonly authStore: AdminAuthStore;
  private readonly dashboardStore: AdminDashboardStore;
  private loginModal: AdminLoginModalView | null = null;
  private dashboardView: AdminDashboardView | null = null;
  private unsubscribeAuth: (() => void) | null = null;

  constructor(
    rootContainer: HTMLElement,
    authStore: AdminAuthStore = new AdminAuthStore(),
    dashboardStore: AdminDashboardStore = new AdminDashboardStore(),
  ) {
    this.rootContainer = rootContainer;
    this.authStore = authStore;
    this.dashboardStore = dashboardStore;
    this.suppress3DCanvas();
    this.initializeViews();
    this.subscribeToAuth();
  }

  public getAuthStore(): AdminAuthStore {
    return this.authStore;
  }

  public getDashboardStore(): AdminDashboardStore {
    return this.dashboardStore;
  }

  public destroy(): void {
    this.restore3DCanvas();
    this.dashboardStore.stopPolling();
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
    if (this.loginModal) {
      this.loginModal.unmount();
      this.loginModal = null;
    }
    if (this.dashboardView) {
      this.dashboardView.unmount();
      this.dashboardView = null;
    }
  }

  private suppress3DCanvas(): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector("a-scene") as (HTMLElement & { pause?: () => void }) | null;
    if (scene) {
      scene.style.display = "none";
      scene.setAttribute("style", "display: none !important;");
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    }
  }

  private restore3DCanvas(): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector("a-scene") as (HTMLElement & { play?: () => void }) | null;
    if (scene) {
      scene.style.display = "";
      if (typeof scene.removeAttribute === "function") {
        scene.removeAttribute("style");
      }
      if (typeof scene.play === "function") {
        scene.play();
      }
    }
  }

  private initializeViews(): void {
    this.loginModal = new AdminLoginModalView({
      authStore: this.authStore,
      onLoginSuccess: () => {
        this.renderActiveState();
      },
      onReturnToTour: () => {
        this.returnToTour();
      },
    });
    this.loginModal.mount(this.rootContainer);

    this.renderActiveState();
  }

  private returnToTour(): void {
    this.destroy();
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  }

  private subscribeToAuth(): void {
    this.unsubscribeAuth = this.authStore.subscribe(() => {
      this.renderActiveState();
    });
  }

  private renderActiveState(): void {
    const isAuthenticated = this.authStore.getState().isAuthenticated;

    if (isAuthenticated) {
      if (this.loginModal) {
        this.loginModal.hide();
      }

      if (!this.dashboardView) {
        this.dashboardView = new AdminDashboardView({
          authStore: this.authStore,
          dashboardStore: this.dashboardStore,
          onLogout: () => {
            this.authStore.logout();
          },
          onReturnToTour: () => {
            this.returnToTour();
          },
        });
        this.dashboardView.mount(this.rootContainer);
      }
      this.dashboardView.show();
     this.dashboardStore.startPolling();
    } else {
      this.dashboardStore.stopPolling();
      if (this.dashboardView) {
        this.dashboardView.unmount();
        this.dashboardView = null;
      }
      if (this.loginModal) {
        this.loginModal.show();
      }
    }
  }
}
