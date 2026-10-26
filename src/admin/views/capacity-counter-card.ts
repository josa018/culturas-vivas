import { AdminDashboardStore } from "../admin-dashboard-store";
import {
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
} from "../constants";

export class CapacityCounterCardWidget {
  private container: HTMLElement | null = null;
  private valueElement: HTMLElement | null = null;
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

    // Header (Title only, no subtitle)
    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.COUNTER_TITLE;

    titleGroup.appendChild(title);
    header.appendChild(titleGroup);

    // Body: Centered metric display (Number only)
    const body = document.createElement("div");
    body.className = ADMIN_UI_CLASSES.CARD_BODY;

    const metricContainer = document.createElement("div");
    metricContainer.className = ADMIN_UI_CLASSES.COUNTER_METRIC_CONTAINER;

    const valueSpan = document.createElement("span");
    valueSpan.className = ADMIN_UI_CLASSES.COUNTER_VALUE;
    valueSpan.setAttribute("data-admin-metric", "active-online-users");
    this.valueElement = valueSpan;

    metricContainer.appendChild(valueSpan);
    body.appendChild(metricContainer);
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
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  private updateDisplay(count: number): void {
    if (this.valueElement) {
      this.valueElement.textContent = String(count);
    }
  }
}
