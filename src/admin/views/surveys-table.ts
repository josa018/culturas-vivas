import { AdminDashboardStore } from "../admin-dashboard-store";
import type { SurveyLogEntry } from "../admin-dashboard-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

export class SurveysTableWidget {
  private container: HTMLElement | null = null;
  private tbodyElement: HTMLElement | null = null;
  private avgBadgeElement: HTMLElement | null = null;
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
    card.className = `${ADMIN_UI_CLASSES.CARD} ${ADMIN_UI_CLASSES.SURVEY_WIDGET}`;

    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.SURVEY_TITLE;

    const avgBadge = document.createElement("span");
    avgBadge.className = ADMIN_UI_CLASSES.SURVEY_AVG_BADGE;
    this.avgBadgeElement = avgBadge;

    header.append(title, avgBadge);

    const body = document.createElement("div");
    body.className = `${ADMIN_UI_CLASSES.CARD_BODY} ${ADMIN_UI_CLASSES.SURVEY_TABLE_WRAPPER}`;

    const table = document.createElement("table");
    table.className = ADMIN_UI_CLASSES.SURVEY_TABLE;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const colTitles = [
      ADMIN_UI_TEXT.TABLE_COL_TIME,
      ADMIN_UI_TEXT.TABLE_COL_MODE,
      ADMIN_UI_TEXT.TABLE_COL_RATING,
      ADMIN_UI_TEXT.TABLE_COL_FEEDBACK,
    ];

    for (const titleText of colTitles) {
      const th = document.createElement("th");
      th.className = ADMIN_UI_CLASSES.TABLE_TH;
      th.textContent = titleText;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    this.tbodyElement = tbody;

    table.append(thead, tbody);
    body.appendChild(table);
    card.append(header, body);

    parent.appendChild(card);
    this.container = card;

    this.renderRows(this.store.getState().surveys);
    this.renderAverage();

    this.unsubscribe = this.store.subscribe((state) => {
      this.renderRows(state.surveys);
      this.renderAverage();
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
    this.tbodyElement = null;
    this.avgBadgeElement = null;
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  private renderAverage(): void {
    if (!this.avgBadgeElement) {
      return;
    }
    const avg = this.store.getAverageRating();
    this.avgBadgeElement.textContent = `★ ${ADMIN_UI_TEXT.SURVEY_AVG_PREFIX} ${avg.toFixed(1)} / 5.0`;
  }

  private renderRows(surveys: readonly SurveyLogEntry[]): void {
    if (!this.tbodyElement) {
      return;
    }

    // Clear existing rows
    while (this.tbodyElement.children.length > 0) {
      this.tbodyElement.children[0].remove();
    }

    if (surveys.length === 0) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.className = ADMIN_UI_CLASSES.TABLE_TD;
      emptyCell.setAttribute("colspan", "4");
      emptyCell.textContent = ADMIN_UI_TEXT.NO_SURVEYS;
      emptyRow.appendChild(emptyCell);
      this.tbodyElement.appendChild(emptyRow);
      return;
    }

    for (const item of surveys) {
      const row = document.createElement("tr");

      // Time
      const timeCell = document.createElement("td");
      timeCell.className = ADMIN_UI_CLASSES.TABLE_TD;
      timeCell.textContent = this.formatTime(item.timestamp);

      // Mode
      const modeCell = document.createElement("td");
      modeCell.className = ADMIN_UI_CLASSES.TABLE_TD;
      const modeBadge = document.createElement("span");
      modeBadge.className = ADMIN_UI_CLASSES.TABLE_MODE_BADGE;
      modeBadge.textContent = item.viewMode.toUpperCase();
      modeCell.appendChild(modeBadge);

      // Rating (stars)
      const ratingCell = document.createElement("td");
      ratingCell.className = `${ADMIN_UI_CLASSES.TABLE_TD} ${ADMIN_UI_CLASSES.TABLE_STARS}`;
      ratingCell.textContent =
        "★".repeat(item.rating) + "☆".repeat(5 - item.rating);

      // Feedback
      const feedbackCell = document.createElement("td");
      feedbackCell.className = ADMIN_UI_CLASSES.TABLE_TD;
      feedbackCell.textContent = item.feedback || "—";

      row.append(timeCell, modeCell, ratingCell, feedbackCell);
      this.tbodyElement.appendChild(row);
    }
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}
