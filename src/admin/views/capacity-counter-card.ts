import { AdminDashboardStore } from "../admin-dashboard-store";
import {
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  ADMIN_THRESHOLDS,
} from "../constants";

export class CapacityCounterCardWidget {
  private container: HTMLElement | null = null;
  private valueElement: HTMLElement | null = null;
  private subtextElement: HTMLElement | null = null;
  private progressFillElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
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
    card.className = `${ADMIN_UI_CLASSES.CARD} ${ADMIN_UI_CLASSES.COUNTER_WIDGET}`;

    // Header
    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.COUNTER_TITLE;

    const subtitle = document.createElement("p");
    subtitle.className = ADMIN_UI_CLASSES.CARD_SUBTITLE;
    subtitle.textContent = ADMIN_UI_TEXT.COUNTER_SUBTITLE;

    titleGroup.append(title, subtitle);
    header.appendChild(titleGroup);

    // Body
    const body = document.createElement("div");
    body.className = ADMIN_UI_CLASSES.CARD_BODY;

    // Metric display container (Number + Subtext + Progress)
    const metricContainer = document.createElement("div");
    metricContainer.className = ADMIN_UI_CLASSES.COUNTER_METRIC_CONTAINER;

    const valueSpan = document.createElement("span");
    valueSpan.className = ADMIN_UI_CLASSES.COUNTER_VALUE;
    valueSpan.setAttribute("data-admin-metric", "active-visitors");
    this.valueElement = valueSpan;

    const subtext = document.createElement("span");
    subtext.className = ADMIN_UI_CLASSES.COUNTER_SUBTEXT;
    this.subtextElement = subtext;

    // M3 Linear Progress Indicator
    const progressTrack = document.createElement("div");
    progressTrack.className = ADMIN_UI_CLASSES.PROGRESS_TRACK;
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute(
      "aria-valuemax",
      String(ADMIN_THRESHOLDS.MAX_CAPACITY),
    );

    const progressFill = document.createElement("div");
    progressFill.className = ADMIN_UI_CLASSES.PROGRESS_FILL;
    this.progressFillElement = progressFill;

    progressTrack.appendChild(progressFill);
    metricContainer.append(valueSpan, subtext, progressTrack);

    // Footer with Status Chip (left) and Stepper (+ / -) (right)
    const footer = document.createElement("div");
    footer.className = ADMIN_UI_CLASSES.COUNTER_FOOTER;

    const statusBadge = document.createElement("span");
    statusBadge.className = ADMIN_UI_CLASSES.COUNTER_STATUS_OPTIMAL;
    this.statusElement = statusBadge;

    const controls = document.createElement("div");
    controls.className = ADMIN_UI_CLASSES.COUNTER_CONTROLS;

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = ADMIN_UI_CLASSES.COUNTER_STEPPER_BTN;
    decBtn.textContent = ADMIN_UI_TEXT.STEPPER_DEC_LABEL;
    decBtn.setAttribute("data-action", "dec-visitor");
    decBtn.setAttribute("aria-label", "Disminuir aforo en 1");
    decBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.store.decrementVisitor();
    });

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = ADMIN_UI_CLASSES.COUNTER_STEPPER_BTN;
    incBtn.textContent = ADMIN_UI_TEXT.STEPPER_INC_LABEL;
    incBtn.setAttribute("data-action", "inc-visitor");
    incBtn.setAttribute("aria-label", "Aumentar aforo en 1");
    incBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.store.incrementVisitor();
    });

    controls.append(decBtn, incBtn);
    footer.append(statusBadge, controls);

    body.append(metricContainer, footer);
    card.append(header, body);

    parent.appendChild(card);
    this.container = card;

    this.updateDisplay(this.store.getState().activeVisitorsCount);
    this.unsubscribe = this.store.subscribe((state) => {
      this.updateDisplay(state.activeVisitorsCount);
    });
  }

  public unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.valueElement = null;
    this.subtextElement = null;
    this.progressFillElement = null;
    this.statusElement = null;
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  private updateDisplay(count: number): void {
    const maxCapacity = ADMIN_THRESHOLDS.MAX_CAPACITY;
    const occupancyPercent = Math.min(
      100,
      Math.round((count / maxCapacity) * 100),
    );

    if (this.valueElement) {
      this.valueElement.textContent = String(count);
    }

    if (this.subtextElement) {
      this.subtextElement.textContent = `de ${maxCapacity} cupos (${occupancyPercent}% ocupación)`;
    }

    if (this.progressFillElement) {
      this.progressFillElement.style.width = `${occupancyPercent}%`;
      this.progressFillElement.parentElement?.setAttribute(
        "aria-valuenow",
        String(count),
      );
    }

    if (this.statusElement) {
      if (count <= ADMIN_THRESHOLDS.CAPACITY_OPTIMAL_MAX) {
        this.statusElement.className = ADMIN_UI_CLASSES.COUNTER_STATUS_OPTIMAL;
        this.statusElement.textContent = ADMIN_UI_TEXT.STATUS_OPTIMAL;
        if (this.progressFillElement) {
          this.progressFillElement.style.backgroundColor =
            "var(--md-custom-capacity-optimal)";
        }
      } else if (count <= ADMIN_THRESHOLDS.CAPACITY_MODERATE_MAX) {
        this.statusElement.className = ADMIN_UI_CLASSES.COUNTER_STATUS_MODERATE;
        this.statusElement.textContent = ADMIN_UI_TEXT.STATUS_MODERATE;
        if (this.progressFillElement) {
          this.progressFillElement.style.backgroundColor =
            "var(--md-custom-capacity-moderate)";
        }
      } else {
        this.statusElement.className = ADMIN_UI_CLASSES.COUNTER_STATUS_HIGH;
        this.statusElement.textContent = ADMIN_UI_TEXT.STATUS_HIGH;
        if (this.progressFillElement) {
          this.progressFillElement.style.backgroundColor =
            "var(--md-custom-capacity-high)";
        }
      }
    }
  }
}
