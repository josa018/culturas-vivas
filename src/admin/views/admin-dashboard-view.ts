import { AdminAuthStore } from "../admin-auth-store";
import { AdminDashboardStore } from "../admin-dashboard-store";
import { ADMIN_UI_CLASSES } from "../constants";
import { AdminHeaderWidget } from "./admin-header";
import { AttendanceChartWidget } from "./attendance-chart";
import { SurveysTableWidget } from "./surveys-table";

export interface AdminDashboardViewOptions {
  readonly authStore: AdminAuthStore;
  readonly dashboardStore: AdminDashboardStore;
  readonly onLogout: () => void;
}

export class AdminDashboardView {
  private container: HTMLElement | null = null;
  private headerWidget: AdminHeaderWidget | null = null;
  private chartWidget: AttendanceChartWidget | null = null;
  private surveyWidget: SurveysTableWidget | null = null;
  private readonly authStore: AdminAuthStore;
  private readonly dashboardStore: AdminDashboardStore;
  private readonly onLogout: () => void;

  constructor(options: AdminDashboardViewOptions) {
    this.authStore = options.authStore;
    this.dashboardStore = options.dashboardStore;
    this.onLogout = options.onLogout;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const wrapper = document.createElement("main");
    wrapper.className = ADMIN_UI_CLASSES.DASHBOARD_CONTAINER;

    const user = this.authStore.getState().user;
    this.headerWidget = new AdminHeaderWidget({
      username: user?.username ?? "admin",
      role: user?.role ?? "librarian",
      onLogout: this.onLogout,
    });
    this.headerWidget.mount(wrapper);

    const grid = document.createElement("div");
    grid.className = ADMIN_UI_CLASSES.GRID_LAYOUT;

    this.chartWidget = new AttendanceChartWidget(this.dashboardStore);
    this.chartWidget.mount(grid);

    this.surveyWidget = new SurveysTableWidget(this.dashboardStore);
    this.surveyWidget.mount(grid);

    wrapper.appendChild(grid);
    parent.appendChild(wrapper);
    this.container = wrapper;
  }

  public unmount(): void {
    if (this.headerWidget) {
      this.headerWidget.unmount();
      this.headerWidget = null;
    }
    if (this.chartWidget) {
      this.chartWidget.unmount();
      this.chartWidget = null;
    }
    if (this.surveyWidget) {
      this.surveyWidget.unmount();
      this.surveyWidget = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    if (this.container) {
      this.container.style.display = "flex";
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.style.display = "none";
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  public getChartWidget(): AttendanceChartWidget | null {
    return this.chartWidget;
  }

  public getSurveyWidget(): SurveysTableWidget | null {
    return this.surveyWidget;
  }
}
