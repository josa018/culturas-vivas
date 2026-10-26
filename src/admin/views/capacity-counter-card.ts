import { AdminDashboardStore } from "../admin-dashboard-store";
import {
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  ADMIN_THRESHOLDS,
} from "../constants";

export class CapacityCounterCardWidget {
  private container: HTMLElement | null = null;
  private valueElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;
  private simulationCheckbox: HTMLInputElement | null = null;
  private simulationIntervalId: ReturnType<typeof setInterval> | null = null;
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

    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.COUNTER_TITLE;

    const statusBadge = document.createElement("span");
    statusBadge.className = ADMIN_UI_CLASSES.COUNTER_STATUS_OPTIMAL;
    this.statusElement = statusBadge;

    header.append(title, statusBadge);

    const body = document.createElement("div");
    body.className = ADMIN_UI_CLASSES.CARD_BODY;

    const valueDisplay = document.createElement("div");
    valueDisplay.className = ADMIN_UI_CLASSES.COUNTER_VALUE;

    const numSpan = document.createElement("span");
    numSpan.setAttribute("data-admin-metric", "active-visitors");
    this.valueElement = numSpan;

    const unitSpan = document.createElement("small");
    unitSpan.textContent = ADMIN_UI_TEXT.COUNTER_UNIT;

    valueDisplay.append(numSpan, unitSpan);

    const controls = document.createElement("div");
    controls.className = ADMIN_UI_CLASSES.COUNTER_CONTROLS;

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = ADMIN_UI_CLASSES.COUNTER_BTN_INC;
    incBtn.textContent = ADMIN_UI_TEXT.COUNTER_BTN_INC;
    incBtn.setAttribute("data-action", "inc-visitor");
    incBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.store.incrementVisitor();
    });

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = ADMIN_UI_CLASSES.COUNTER_BTN_DEC;
    decBtn.textContent = ADMIN_UI_TEXT.COUNTER_BTN_DEC;
    decBtn.setAttribute("data-action", "dec-visitor");
    decBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.store.decrementVisitor();
    });

    controls.append(incBtn, decBtn);

    // Simulation toggle
    const simWrapper = document.createElement("label");
    simWrapper.className = ADMIN_UI_CLASSES.SIMULATION_TOGGLE;

    const simCheck = document.createElement("input");
    simCheck.type = "checkbox";
    simCheck.className = ADMIN_UI_CLASSES.SIMULATION_CHECKBOX;
    this.simulationCheckbox = simCheck;

    const simLabel = document.createElement("span");
    simLabel.textContent = ADMIN_UI_TEXT.COUNTER_AUTO_SIM_LABEL;

    simCheck.addEventListener("change", () => {
      this.toggleAutoSimulation(simCheck.checked);
    });

    simWrapper.append(simCheck, simLabel);

    body.append(valueDisplay, controls, simWrapper);
    card.append(header, body);

    parent.appendChild(card);
    this.container = card;

    this.updateDisplay(this.store.getState().activeVisitorsCount);
    this.unsubscribe = this.store.subscribe((state) => {
      this.updateDisplay(state.activeVisitorsCount);
    });
  }

  public unmount(): void {
    this.stopAutoSimulation();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.valueElement = null;
    this.statusElement = null;
    this.simulationCheckbox = null;
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  public toggleAutoSimulation(active: boolean): void {
    if (active) {
      this.startAutoSimulation();
    } else {
      this.stopAutoSimulation();
    }
  }

  private startAutoSimulation(): void {
    if (this.simulationIntervalId !== null) {
      return;
    }
    this.simulationIntervalId = setInterval(() => {
      const current = this.store.getState().activeVisitorsCount;
      // Probabilistic simulation: 60% chance to increment if low, 50% chance if moderate
      const delta = Math.random() > 0.45 ? 1 : -1;
      this.store.setVisitorCount(Math.max(0, current + delta));
    }, ADMIN_THRESHOLDS.AUTO_SIMULATION_INTERVAL_MS);
  }

  private stopAutoSimulation(): void {
    if (this.simulationIntervalId !== null) {
      clearInterval(this.simulationIntervalId);
      this.simulationIntervalId = null;
    }
    if (this.simulationCheckbox) {
      this.simulationCheckbox.checked = false;
    }
  }

  private updateDisplay(count: number): void {
    if (this.valueElement) {
      this.valueElement.textContent = String(count);
    }
    if (this.statusElement) {
      if (count <= ADMIN_THRESHOLDS.CAPACITY_OPTIMAL_MAX) {
        this.statusElement.className = ADMIN_UI_CLASSES.COUNTER_STATUS_OPTIMAL;
        this.statusElement.textContent = ADMIN_UI_TEXT.STATUS_OPTIMAL;
      } else if (count <= ADMIN_THRESHOLDS.CAPACITY_MODERATE_MAX) {
        this.statusElement.className = ADMIN_UI_CLASSES.COUNTER_STATUS_MODERATE;
        this.statusElement.textContent = ADMIN_UI_TEXT.STATUS_MODERATE;
      } else {
        this.statusElement.className = ADMIN_UI_CLASSES.COUNTER_STATUS_HIGH;
        this.statusElement.textContent = ADMIN_UI_TEXT.STATUS_HIGH;
      }
    }
  }
}
