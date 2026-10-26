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
    const scene = document.querySelector("a-scene");
    if (scene) {
      scene.style.display = "none";
      scene.setAttribute("style", "display: none !important;");
    }
  }

  private initializeViews(): void {
    this.loginModal = new AdminLoginModalView({
      authStore: this.authStore,
      onLoginSuccess: () => {
        this.renderActiveState();
      },
    });
    this.loginModal.mount(this.rootContainer);

    this.renderActiveState();
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
        });
        this.dashboardView.mount(this.rootContainer);
      }
      this.dashboardView.show();
    } else {
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
