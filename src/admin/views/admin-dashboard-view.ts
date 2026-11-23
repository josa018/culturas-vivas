import { AdminAuthStore } from "../admin-auth-store";
import { AdminAudioStore } from "../audio-store";
import { AdminDashboardStore } from "../admin-dashboard-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";
import { AdminMediaStore } from "../media-store";
import { AdminHeaderWidget } from "./admin-header";
import { AttendanceChartWidget } from "./attendance-chart";
import { MediaManagerWidget } from "./media-manager-widget";
import { PlaylistManagerWidget } from "./playlist-manager-widget";
import { SurveysTableWidget } from "./surveys-table";

export type AdminDashboardTab = "telemetry" | "media" | "playlists";

export interface AdminDashboardViewOptions {
  readonly authStore: AdminAuthStore;
  readonly dashboardStore: AdminDashboardStore;
  readonly mediaStore?: AdminMediaStore;
  readonly audioStore?: AdminAudioStore;
  readonly onLogout: () => void;
  readonly onReturnToTour?: () => void;
}

export class AdminDashboardView {
  private container: HTMLElement | null = null;
  private headerWidget: AdminHeaderWidget | null = null;
  private chartWidget: AttendanceChartWidget | null = null;
  private surveyWidget: SurveysTableWidget | null = null;
  private mediaWidget: MediaManagerWidget | null = null;
  private playlistWidget: PlaylistManagerWidget | null = null;
  private telemetryTabBtn: HTMLButtonElement | null = null;
  private mediaTabBtn: HTMLButtonElement | null = null;
  private playlistsTabBtn: HTMLButtonElement | null = null;
  private telemetryPanelEl: HTMLElement | null = null;
  private mediaPanelEl: HTMLElement | null = null;
  private playlistsPanelEl: HTMLElement | null = null;
  private activeTab: AdminDashboardTab = "telemetry";
  private readonly authStore: AdminAuthStore;
  private readonly dashboardStore: AdminDashboardStore;
  private readonly mediaStore: AdminMediaStore;
  private readonly audioStore: AdminAudioStore;
  private readonly onLogout: () => void;
  private readonly onReturnToTour?: () => void;

  constructor(options: AdminDashboardViewOptions) {
    this.authStore = options.authStore;
    this.dashboardStore = options.dashboardStore;
    this.mediaStore =
      options.mediaStore ??
      new AdminMediaStore({
        getToken: () => this.authStore.getState().token,
        onUnauthorized: () => this.authStore.logout(),
      });
    this.audioStore =
      options.audioStore ??
      new AdminAudioStore({
        getToken: () => this.authStore.getState().token,
        onUnauthorized: () => this.authStore.logout(),
      });
    this.onLogout = options.onLogout;
    this.onReturnToTour = options.onReturnToTour;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const wrapper = document.createElement("main");
    wrapper.className = ADMIN_UI_CLASSES.DASHBOARD_CONTAINER;

    const user = this.authStore.getState().user;
    this.headerWidget = new AdminHeaderWidget({
      username: user?.username ?? ADMIN_UI_TEXT.DEFAULT_HEADER_USERNAME,
      role: user?.role ?? ADMIN_UI_TEXT.DEFAULT_HEADER_ROLE,
      onLogout: this.onLogout,
      onReturnToTour: this.onReturnToTour,
    });
    this.headerWidget.mount(wrapper);

    const tabBar = document.createElement("nav");
    tabBar.className = ADMIN_UI_CLASSES.TAB_BAR;
    tabBar.setAttribute("role", "tablist");

    const telemetryBtn = document.createElement("button");
    telemetryBtn.type = "button";
    telemetryBtn.className = ADMIN_UI_CLASSES.TAB_BTN;
    telemetryBtn.textContent = ADMIN_UI_TEXT.TAB_TELEMETRY;
    telemetryBtn.setAttribute("role", "tab");
    telemetryBtn.setAttribute("data-admin-tab", "telemetry");
    telemetryBtn.addEventListener("click", () => {
      this.setActiveTab("telemetry");
    });

    const mediaBtn = document.createElement("button");
    mediaBtn.type = "button";
    mediaBtn.className = ADMIN_UI_CLASSES.TAB_BTN;
    mediaBtn.textContent = ADMIN_UI_TEXT.TAB_MEDIA;
    mediaBtn.setAttribute("role", "tab");
    mediaBtn.setAttribute("data-admin-tab", "media");
    mediaBtn.addEventListener("click", () => {
      this.setActiveTab("media");
    });

    const playlistsBtn = document.createElement("button");
    playlistsBtn.type = "button";
    playlistsBtn.className = ADMIN_UI_CLASSES.TAB_BTN;
    playlistsBtn.textContent = ADMIN_UI_TEXT.TAB_PLAYLISTS;
    playlistsBtn.setAttribute("role", "tab");
    playlistsBtn.setAttribute("data-admin-tab", "playlists");
    playlistsBtn.addEventListener("click", () => {
      this.setActiveTab("playlists");
    });

    tabBar.append(telemetryBtn, mediaBtn, playlistsBtn);
    wrapper.appendChild(tabBar);

    const telemetryPanel = document.createElement("div");
    telemetryPanel.className = ADMIN_UI_CLASSES.TAB_PANEL;
    telemetryPanel.setAttribute("role", "tabpanel");
    telemetryPanel.setAttribute("data-admin-panel", "telemetry");

    const grid = document.createElement("div");
    grid.className = ADMIN_UI_CLASSES.GRID_LAYOUT;

    this.chartWidget = new AttendanceChartWidget(this.dashboardStore);
    this.chartWidget.mount(grid);

    this.surveyWidget = new SurveysTableWidget(this.dashboardStore);
    this.surveyWidget.mount(grid);

    telemetryPanel.appendChild(grid);

    const mediaPanel = document.createElement("div");
    mediaPanel.className = ADMIN_UI_CLASSES.TAB_PANEL;
    mediaPanel.setAttribute("role", "tabpanel");
    mediaPanel.setAttribute("data-admin-panel", "media");

    const mediaGrid = document.createElement("div");
    mediaGrid.className = ADMIN_UI_CLASSES.GRID_LAYOUT;
    this.mediaWidget = new MediaManagerWidget(this.mediaStore);
    this.mediaWidget.mount(mediaGrid);
    mediaPanel.appendChild(mediaGrid);

    const playlistsPanel = document.createElement("div");
    playlistsPanel.className = ADMIN_UI_CLASSES.TAB_PANEL;
    playlistsPanel.setAttribute("role", "tabpanel");
    playlistsPanel.setAttribute("data-admin-panel", "playlists");

    const playlistsGrid = document.createElement("div");
    playlistsGrid.className = ADMIN_UI_CLASSES.GRID_LAYOUT;
    this.playlistWidget = new PlaylistManagerWidget(this.audioStore);
    this.playlistWidget.mount(playlistsGrid);
    playlistsPanel.appendChild(playlistsGrid);

    wrapper.append(telemetryPanel, mediaPanel, playlistsPanel);
    parent.appendChild(wrapper);

    this.container = wrapper;
    this.telemetryTabBtn = telemetryBtn;
    this.mediaTabBtn = mediaBtn;
    this.playlistsTabBtn = playlistsBtn;
    this.telemetryPanelEl = telemetryPanel;
    this.mediaPanelEl = mediaPanel;
    this.playlistsPanelEl = playlistsPanel;
    this.syncTabPresentation();
  }

  public setActiveTab(tab: AdminDashboardTab): void {
    this.activeTab = tab;
    this.syncTabPresentation();
    if (tab === "media") {
      void this.mediaStore.fetchCatalog();
    } else if (tab === "playlists") {
      void this.audioStore.fetchPlaylist();
    }
  }

  public getActiveTab(): AdminDashboardTab {
    return this.activeTab;
  }

  private syncTabPresentation(): void {
    const isTelemetry = this.activeTab === "telemetry";
    const isMedia = this.activeTab === "media";
    const isPlaylists = this.activeTab === "playlists";

    this.telemetryTabBtn?.classList.toggle(
      ADMIN_UI_CLASSES.TAB_BTN_ACTIVE,
      isTelemetry,
    );
    this.mediaTabBtn?.classList.toggle(
      ADMIN_UI_CLASSES.TAB_BTN_ACTIVE,
      isMedia,
    );
    this.playlistsTabBtn?.classList.toggle(
      ADMIN_UI_CLASSES.TAB_BTN_ACTIVE,
      isPlaylists,
    );
    this.telemetryTabBtn?.setAttribute("aria-selected", String(isTelemetry));
    this.mediaTabBtn?.setAttribute("aria-selected", String(isMedia));
    this.playlistsTabBtn?.setAttribute("aria-selected", String(isPlaylists));

    this.telemetryPanelEl?.classList.toggle(
      ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN,
      !isTelemetry,
    );
    this.mediaPanelEl?.classList.toggle(
      ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN,
      !isMedia,
    );
    this.playlistsPanelEl?.classList.toggle(
      ADMIN_UI_CLASSES.TAB_PANEL_HIDDEN,
      !isPlaylists,
    );
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
    if (this.mediaWidget) {
      this.mediaWidget.unmount();
      this.mediaWidget = null;
    }
    if (this.playlistWidget) {
      this.playlistWidget.unmount();
      this.playlistWidget = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.telemetryTabBtn = null;
    this.mediaTabBtn = null;
    this.playlistsTabBtn = null;
    this.telemetryPanelEl = null;
    this.mediaPanelEl = null;
    this.playlistsPanelEl = null;
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

  public getMediaWidget(): MediaManagerWidget | null {
    return this.mediaWidget;
  }
}
