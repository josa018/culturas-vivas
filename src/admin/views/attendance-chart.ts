import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
import { AdminDashboardStore } from "../admin-dashboard-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

// Strict tree-shaking registration
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const CHART_THEME_TOKENS = {
  BAR_BG_COLOR: "rgba(208, 188, 255, 0.85)",
  BAR_HOVER_COLOR: "#d0bcff",
  BAR_BORDER_RADIUS: 6,
  GRID_COLOR: "rgba(67, 71, 78, 0.25)",
  TICK_COLOR: "#8d9199",
  TOOLTIP_BG: "#282a2f",
  TOOLTIP_TITLE_COLOR: "#e6e1e5",
  TOOLTIP_BODY_COLOR: "#7ddcde",
} as const;

export class AttendanceChartWidget {
  private container: HTMLElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
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

    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.CHART_TITLE;

    const subtitle = document.createElement("p");
    subtitle.className = ADMIN_UI_CLASSES.CARD_SUBTITLE;
    subtitle.textContent = ADMIN_UI_TEXT.CHART_SUBTITLE;

    titleGroup.append(title, subtitle);
    header.appendChild(titleGroup);

    const body = document.createElement("div");
    body.className = `${ADMIN_UI_CLASSES.CARD_BODY} ${ADMIN_UI_CLASSES.CHART_CONTAINER}`;

    const canvas = document.createElement("canvas");
    canvas.className = ADMIN_UI_CLASSES.CHART_CANVAS;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", ADMIN_UI_TEXT.CHART_TITLE);
    this.canvasElement = canvas;

    body.appendChild(canvas);
    card.append(header, body);
    parent.appendChild(card);
    this.container = card;

    this.renderChart();

    this.unsubscribe = this.store.subscribe((state) => {
      this.updateChart(state.hourlyAttendance.values);
    });
  }

  public unmount(): void {
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
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  public getChartInstance(): Chart | null {
    return this.chartInstance;
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
            maxBarThickness: 34,
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
            padding: 10,
            cornerRadius: 8,
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
                family: "inherit",
                size: 12,
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
                family: "inherit",
                size: 12,
              },
            },
          },
        },
      },
    });
  }

  private updateChart(newValues: readonly number[]): void {
    if (!this.chartInstance) {
      return;
    }
    this.chartInstance.data.datasets[0].data = [...newValues];
    this.chartInstance.update();
  }
}
