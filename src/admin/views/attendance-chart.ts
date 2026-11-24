import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
import { AdminDashboardStore } from "../admin-dashboard-store";
import type { ChartTimeRange, DashboardState } from "../admin-dashboard-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

const CHART_RANGE_ORDER: readonly ChartTimeRange[] = [
  "day",
  "week",
  "month",
  "year",
];

// Strict tree-shaking registration
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const CHART_THEME_TOKENS = {
  BAR_BG_COLOR: "rgba(208, 188, 255, 0.85)",
  BAR_HOVER_COLOR: "#d0bcff",
  BAR_BORDER_RADIUS: 6,
  MAX_BAR_THICKNESS: 34,
  GRID_COLOR: "rgba(67, 71, 78, 0.25)",
  TICK_COLOR: "#8d9199",
  TICK_FONT_SIZE: 12,
  TICK_FONT_FAMILY: "inherit",
  TOOLTIP_BG: "#282a2f",
  TOOLTIP_TITLE_COLOR: "#e6e1e5",
  TOOLTIP_BODY_COLOR: "#7ddcde",
  TOOLTIP_PADDING: 10,
  TOOLTIP_CORNER_RADIUS: 8,
} as const;

export class AttendanceChartWidget {
  private connectionElement: HTMLElement | null = null;
  private connectionTextElement: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private titleElement: HTMLElement | null = null;
  private subtitleElement: HTMLElement | null = null;
  private rangeButtons = new Map<ChartTimeRange, HTMLButtonElement>();
  private valueElement: HTMLElement | null = null;
  private peakElement: HTMLElement | null = null;
  private chartInstance: Chart | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly store: AdminDashboardStore;

  constructor(store: AdminDashboardStore) {
    this.store = store;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const card = document.createElement("section");
    card.className = `${ADMIN_UI_CLASSES.CARD} ${ADMIN_UI_CLASSES.CHART_WIDGET}`;

    // Header: Title (left) + Peak badge (right)
    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.CHART_TITLE;
    this.titleElement = title;

    const subtitle = document.createElement("p");
    subtitle.className = ADMIN_UI_CLASSES.CARD_SUBTITLE;
    subtitle.textContent = ADMIN_UI_TEXT.CHART_SUBTITLE;
    this.subtitleElement = subtitle;

    titleGroup.append(title, subtitle);

    const headerMeta = document.createElement("div");
    headerMeta.className = ADMIN_UI_CLASSES.CHART_HEADER_META;

    const rangeGroup = document.createElement("div");
    rangeGroup.className = ADMIN_UI_CLASSES.CHART_RANGE_GROUP;
    rangeGroup.setAttribute("role", "group");
    rangeGroup.setAttribute("aria-label", ADMIN_UI_TEXT.CHART_RANGE_ARIA);
    this.rangeButtons.clear();

    for (const range of CHART_RANGE_ORDER) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = ADMIN_UI_CLASSES.CHART_RANGE_BTN;
      btn.textContent = ADMIN_UI_TEXT.CHART_RANGE_LABELS[range];
      btn.setAttribute("data-chart-range", range);
      btn.setAttribute("aria-pressed", String(range === "day"));
      btn.addEventListener("click", () => {
        void this.store.setRange(range);
      });
      this.rangeButtons.set(range, btn);
      rangeGroup.appendChild(btn);
    }

    const peakBadge = document.createElement("span");
    peakBadge.className = ADMIN_UI_CLASSES.CHART_PEAK_BADGE;
    this.peakElement = peakBadge;

    headerMeta.append(rangeGroup, peakBadge);
    header.append(titleGroup, headerMeta);

    // KPI Summary Row: Number + Label + Connection status
    const kpiRow = document.createElement("div");
    kpiRow.className = ADMIN_UI_CLASSES.CHART_KPI_GROUP;

    const valueSpan = document.createElement("span");
    valueSpan.className = ADMIN_UI_CLASSES.COUNTER_VALUE;
    valueSpan.setAttribute("data-admin-metric", "active-online-users");
    this.valueElement = valueSpan;

    const labelSpan = document.createElement("span");
    labelSpan.className = ADMIN_UI_CLASSES.COUNTER_LABEL;
    labelSpan.textContent = ADMIN_UI_TEXT.COUNTER_LABEL;

    const connectionStatus = document.createElement("div");
    connectionStatus.className = `${ADMIN_UI_CLASSES.CONNECTION_STATUS} ${ADMIN_UI_CLASSES.CONNECTION_OFFLINE}`;
    connectionStatus.setAttribute("data-admin-metric", "connection-status");

    const connectionDot = document.createElement("span");
    connectionDot.className = ADMIN_UI_CLASSES.CONNECTION_DOT;

    const connectionText = document.createElement("span");
    connectionText.className = ADMIN_UI_CLASSES.CONNECTION_TEXT;

    connectionStatus.append(connectionDot, connectionText);
    this.connectionElement = connectionStatus;
    this.connectionTextElement = connectionText;

    kpiRow.append(valueSpan, labelSpan, connectionStatus);

    // Body: Chart Container + Canvas
    const body = document.createElement("div");
    body.className = `${ADMIN_UI_CLASSES.CARD_BODY} ${ADMIN_UI_CLASSES.CHART_CONTAINER}`;

    const canvas = document.createElement("canvas");
    canvas.className = ADMIN_UI_CLASSES.CHART_CANVAS;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", ADMIN_UI_TEXT.CHART_TITLE);
    this.canvasElement = canvas;

    body.appendChild(canvas);
    card.append(header, kpiRow, body);
    parent.appendChild(card);
    this.container = card;

    this.updateMetrics(this.store.getState());
    this.renderChart();

    this.unsubscribe = this.store.subscribe((state) => {
      this.updateMetrics(state);
      this.updateChart(
        state.hourlyAttendance.labels,
        state.hourlyAttendance.values,
      );
    });
  }

  public unmount(): void {
    this.connectionElement = null;
    this.connectionTextElement = null;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.canvasElement = null;
    this.titleElement = null;
    this.subtitleElement = null;
    this.rangeButtons.clear();
    this.valueElement = null;
    this.peakElement = null;
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  public getChartInstance(): Chart | null {
    return this.chartInstance;
  }

  private updateMetrics(state: DashboardState): void {
    if (this.titleElement) {
      this.titleElement.textContent =
        ADMIN_UI_TEXT.CHART_TITLE_BY_RANGE[state.selectedRange];
    }
    if (this.subtitleElement) {
      this.subtitleElement.textContent =
        ADMIN_UI_TEXT.CHART_SUBTITLE_BY_RANGE[state.selectedRange];
    }
    for (const [range, btn] of this.rangeButtons.entries()) {
      const isSelected = state.selectedRange === range;
      btn.classList.toggle(ADMIN_UI_CLASSES.CHART_RANGE_BTN_ACTIVE, isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    }

    if (this.valueElement) {
      this.valueElement.textContent = String(state.activeVisitorsCount);
    }
    if (this.peakElement) {
      const peak = Math.max(
        state.dailyPeak,
        state.hourlyAttendance.values.length > 0
          ? Math.max(...state.hourlyAttendance.values)
          : 0,
      );
      this.peakElement.textContent = `${ADMIN_UI_TEXT.PEAK_PREFIX_BY_RANGE[state.selectedRange]}${peak}${ADMIN_UI_TEXT.PEAK_LABEL_SUFFIX}`;
    }

    if (this.connectionElement && this.connectionTextElement) {
      const isOffline = state.connectionStatus === "offline";
      this.connectionElement.hidden = !isOffline;
      this.connectionElement.classList.toggle(
        ADMIN_UI_CLASSES.CONNECTION_ONLINE,
        false,
      );
      this.connectionElement.classList.toggle(
        ADMIN_UI_CLASSES.CONNECTION_OFFLINE,
        isOffline,
      );
      this.connectionTextElement.textContent = isOffline
        ? ADMIN_UI_TEXT.CONNECTION_OFFLINE
        : "";
    }
  }

  private renderChart(): void {
    if (!this.canvasElement) {
      return;
    }

    // Defensive check for headless testing environments
    if (typeof this.canvasElement.getContext !== "function") {
      return;
    }

    const dataset = this.store.getState().hourlyAttendance;

    this.chartInstance = new Chart(this.canvasElement, {
      type: "bar",
      data: {
        labels: [...dataset.labels],
        datasets: [
          {
            label: ADMIN_UI_TEXT.CHART_DATASET_LABEL,
            data: [...dataset.values],
            backgroundColor: CHART_THEME_TOKENS.BAR_BG_COLOR,
            hoverBackgroundColor: CHART_THEME_TOKENS.BAR_HOVER_COLOR,
            borderRadius: CHART_THEME_TOKENS.BAR_BORDER_RADIUS,
            maxBarThickness: CHART_THEME_TOKENS.MAX_BAR_THICKNESS,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            backgroundColor: CHART_THEME_TOKENS.TOOLTIP_BG,
            titleColor: CHART_THEME_TOKENS.TOOLTIP_TITLE_COLOR,
            bodyColor: CHART_THEME_TOKENS.TOOLTIP_BODY_COLOR,
            displayColors: false,
            padding: CHART_THEME_TOKENS.TOOLTIP_PADDING,
            cornerRadius: CHART_THEME_TOKENS.TOOLTIP_CORNER_RADIUS,
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            ticks: {
              color: CHART_THEME_TOKENS.TICK_COLOR,
              font: {
                family: CHART_THEME_TOKENS.TICK_FONT_FAMILY,
                size: CHART_THEME_TOKENS.TICK_FONT_SIZE,
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: CHART_THEME_TOKENS.GRID_COLOR,
            },
            ticks: {
              color: CHART_THEME_TOKENS.TICK_COLOR,
              precision: 0,
              font: {
                family: CHART_THEME_TOKENS.TICK_FONT_FAMILY,
                size: CHART_THEME_TOKENS.TICK_FONT_SIZE,
              },
            },
          },
        },
      },
    });
  }

  private updateChart(
    newLabels: readonly string[],
    newValues: readonly number[],
  ): void {
    if (!this.chartInstance) {
      return;
    }
    this.chartInstance.data.labels = [...newLabels];
    this.chartInstance.data.datasets[0].data = [...newValues];
    this.chartInstance.update();
  }
}
