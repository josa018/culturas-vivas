import {
  AdminDashboardStore,
  type SurveyLogEntry,
  type SurveyModeFilter,
  type SurveyRatingFilter,
  type SurveySortOption,
  type SurveysPagination,
  type SurveyFilters,
} from "../admin-dashboard-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

const MUSEUM_UTC_OFFSET_MS = -7 * 3_600_000;
const SPANISH_MONTH_ABBR = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export class SurveysTableWidget {
  private container: HTMLElement | null = null;
  private tbodyElement: HTMLElement | null = null;
  private avgBadgeElement: HTMLElement | null = null;
  private modeSelectElement: HTMLSelectElement | null = null;
  private ratingSelectElement: HTMLSelectElement | null = null;
  private sortSelectElement: HTMLSelectElement | null = null;
  private feedbackCheckElement: HTMLInputElement | null = null;
  private prevBtnElement: HTMLButtonElement | null = null;
  private nextBtnElement: HTMLButtonElement | null = null;
  private pageSummaryElement: HTMLElement | null = null;
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

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.SURVEY_TITLE;

    titleGroup.append(title);

    const avgBadge = document.createElement("span");
    avgBadge.className = ADMIN_UI_CLASSES.SURVEY_AVG_BADGE;
    this.avgBadgeElement = avgBadge;

    header.append(titleGroup, avgBadge);

    const controlsBar = this.buildFilterControls();

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

    const paginationBar = this.buildPaginationControls();
    card.append(header, controlsBar, body, paginationBar);

    parent.appendChild(card);
    this.container = card;

    this.syncFromState(this.store.getState());

    this.unsubscribe = this.store.subscribe((state) => {
      this.syncFromState(state);
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
    this.modeSelectElement = null;
    this.ratingSelectElement = null;
    this.sortSelectElement = null;
    this.feedbackCheckElement = null;
    this.prevBtnElement = null;
    this.nextBtnElement = null;
    this.pageSummaryElement = null;
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  private buildFilterControls(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = ADMIN_UI_CLASSES.SURVEY_CONTROLS;

    const modeSelect = this.createSelectFilter(
      "cv-survey-filter-mode",
      ADMIN_UI_TEXT.SURVEY_FILTER_MODE_LABEL,
      "mode",
      [
        { value: "all", label: ADMIN_UI_TEXT.SURVEY_FILTER_MODE_ALL },
        { value: "vr", label: ADMIN_UI_TEXT.VIEW_MODE_VR },
        { value: "2d", label: ADMIN_UI_TEXT.VIEW_MODE_2D },
      ],
      (val) => {
        void this.store.setSurveyFilters({ mode: val as SurveyModeFilter });
      },
    );
    this.modeSelectElement = modeSelect.select;

    const ratingSelect = this.createSelectFilter(
      "cv-survey-filter-rating",
      ADMIN_UI_TEXT.SURVEY_FILTER_RATING_LABEL,
      "rating",
      [
        { value: "all", label: ADMIN_UI_TEXT.SURVEY_FILTER_RATING_ALL },
        { value: "5", label: `5 ${ADMIN_UI_TEXT.STAR_FILLED}` },
        { value: "4", label: `4 ${ADMIN_UI_TEXT.STAR_FILLED}` },
        { value: "3", label: `3 ${ADMIN_UI_TEXT.STAR_FILLED}` },
        { value: "2", label: `2 ${ADMIN_UI_TEXT.STAR_FILLED}` },
        { value: "1", label: `1 ${ADMIN_UI_TEXT.STAR_FILLED}` },
      ],
      (val) => {
        void this.store.setSurveyFilters({
          rating: val as SurveyRatingFilter,
        });
      },
    );
    this.ratingSelectElement = ratingSelect.select;

    const sortSelect = this.createSelectFilter(
      "cv-survey-filter-sort",
      ADMIN_UI_TEXT.SURVEY_SORT_LABEL,
      "sort",
      [
        { value: "newest", label: ADMIN_UI_TEXT.SURVEY_SORT_NEWEST },
        { value: "oldest", label: ADMIN_UI_TEXT.SURVEY_SORT_OLDEST },
        { value: "rating_desc", label: ADMIN_UI_TEXT.SURVEY_SORT_RATING_DESC },
        { value: "rating_asc", label: ADMIN_UI_TEXT.SURVEY_SORT_RATING_ASC },
      ],
      (val) => {
        void this.store.setSurveyFilters({ sort: val as SurveySortOption });
      },
    );
    this.sortSelectElement = sortSelect.select;

    const commentLabel = document.createElement("label");
    commentLabel.className = ADMIN_UI_CLASSES.SURVEY_CHECKBOX_LABEL;
    const commentCheck = document.createElement("input");
    commentCheck.type = "checkbox";
    commentCheck.className = ADMIN_UI_CLASSES.SURVEY_CHECKBOX;
    commentCheck.setAttribute("data-survey-filter", "has-feedback");
    commentCheck.addEventListener("change", () => {
      void this.store.setSurveyFilters({
        hasFeedbackOnly: commentCheck.checked,
      });
    });
    this.feedbackCheckElement = commentCheck;
    const commentText = document.createElement("span");
    commentText.textContent = ADMIN_UI_TEXT.SURVEY_FILTER_COMMENT_LABEL;
    commentLabel.append(commentCheck, commentText);

    bar.append(
      modeSelect.group,
      ratingSelect.group,
      sortSelect.group,
      commentLabel,
    );
    return bar;
  }

  private createSelectFilter(
    id: string,
    labelText: string,
    filterAttr: string,
    options: ReadonlyArray<{ value: string; label: string }>,
    onChange: (value: string) => void,
  ): { group: HTMLElement; select: HTMLSelectElement } {
    const group = document.createElement("div");
    group.className = ADMIN_UI_CLASSES.SURVEY_CONTROL_GROUP;

    const label = document.createElement("label");
    label.className = ADMIN_UI_CLASSES.SURVEY_CONTROL_LABEL;
    label.htmlFor = id;
    label.textContent = labelText;

    const select = document.createElement("select");
    select.id = id;
    select.className = ADMIN_UI_CLASSES.SURVEY_SELECT;
    select.setAttribute("data-survey-filter", filterAttr);

    for (const opt of options) {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      select.appendChild(optionEl);
    }

    select.addEventListener("change", () => onChange(select.value));
    group.append(label, select);
    return { group, select };
  }

  private buildPaginationControls(): HTMLElement {
    const bar = document.createElement("nav");
    bar.className = ADMIN_UI_CLASSES.SURVEY_PAGINATION;
    bar.setAttribute("aria-label", ADMIN_UI_TEXT.SURVEY_TITLE);

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = ADMIN_UI_CLASSES.SURVEY_PAGE_BTN;
    prevBtn.textContent = ADMIN_UI_TEXT.SURVEY_PAGE_PREV;
    prevBtn.setAttribute("data-survey-page", "prev");
    prevBtn.addEventListener("click", () => {
      const current = this.store.getState().surveysPagination.page;
      void this.store.setSurveyPage(current - 1);
    });
    this.prevBtnElement = prevBtn;

    const summary = document.createElement("span");
    summary.className = ADMIN_UI_CLASSES.SURVEY_PAGE_INFO;
    summary.setAttribute("data-survey-page", "summary");
    this.pageSummaryElement = summary;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = ADMIN_UI_CLASSES.SURVEY_PAGE_BTN;
    nextBtn.textContent = ADMIN_UI_TEXT.SURVEY_PAGE_NEXT;
    nextBtn.setAttribute("data-survey-page", "next");
    nextBtn.addEventListener("click", () => {
      const current = this.store.getState().surveysPagination.page;
      void this.store.setSurveyPage(current + 1);
    });
    this.nextBtnElement = nextBtn;

    bar.append(prevBtn, summary, nextBtn);
    return bar;
  }

  private syncFromState(state: {
    readonly surveys: readonly SurveyLogEntry[];
    readonly surveyFilters: SurveyFilters;
    readonly surveysPagination: SurveysPagination;
    readonly totalSurveys: number;
  }): void {
    const { surveyFilters, surveysPagination, surveys, totalSurveys } = state;
    if (this.modeSelectElement) {
      this.modeSelectElement.value = surveyFilters.mode;
    }
    if (this.ratingSelectElement) {
      this.ratingSelectElement.value = surveyFilters.rating;
    }
    if (this.sortSelectElement) {
      this.sortSelectElement.value = surveyFilters.sort;
    }
    if (this.feedbackCheckElement) {
      this.feedbackCheckElement.checked = surveyFilters.hasFeedbackOnly;
    }

    const hasActiveFilter =
      surveyFilters.mode !== "all" ||
      surveyFilters.rating !== "all" ||
      surveyFilters.hasFeedbackOnly;
    this.renderRows(surveys, hasActiveFilter);
    this.renderAverage(totalSurveys, surveys.length);

    if (this.prevBtnElement) {
      this.prevBtnElement.disabled = surveysPagination.page <= 1;
    }
    if (this.nextBtnElement) {
      this.nextBtnElement.disabled =
        surveysPagination.page >= surveysPagination.totalPages;
    }
    if (this.pageSummaryElement) {
      const itemsUnit =
        surveysPagination.totalItems === 1
          ? ADMIN_UI_TEXT.SURVEY_PAGE_ITEMS_SINGULAR
          : ADMIN_UI_TEXT.SURVEY_PAGE_ITEMS_PLURAL;
      this.pageSummaryElement.textContent =
        `${ADMIN_UI_TEXT.SURVEY_PAGE_PREFIX}${surveysPagination.page}` +
        `${ADMIN_UI_TEXT.SURVEY_PAGE_OF}${surveysPagination.totalPages}` +
        `${ADMIN_UI_TEXT.SURVEY_PAGE_ITEMS_PREFIX}${surveysPagination.totalItems}${itemsUnit}`;
    }
  }

  private renderAverage(totalSurveys: number, visibleCount: number): void {
    if (!this.avgBadgeElement) {
      return;
    }
    if (totalSurveys === 0 && visibleCount === 0) {
      this.avgBadgeElement.textContent = ADMIN_UI_TEXT.SURVEY_NO_RATINGS;
      return;
    }
    const avg = this.store.getAverageRating();
    this.avgBadgeElement.textContent = `${ADMIN_UI_TEXT.SURVEY_AVG_PREFIX} ${avg.toFixed(1)}${ADMIN_UI_TEXT.RATING_SCALE_SUFFIX}`;
  }

  private renderRows(
    surveys: readonly SurveyLogEntry[],
    hasActiveFilter: boolean,
  ): void {
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
      emptyCell.textContent = hasActiveFilter
        ? ADMIN_UI_TEXT.NO_SURVEYS_FILTERED
        : ADMIN_UI_TEXT.NO_SURVEYS;
      emptyRow.appendChild(emptyCell);
      this.tbodyElement.appendChild(emptyRow);
      return;
    }

    for (const item of surveys) {
      const row = document.createElement("tr");

      // Time
      const timeCell = document.createElement("td");
      timeCell.className = `${ADMIN_UI_CLASSES.TABLE_TD} ${ADMIN_UI_CLASSES.TABLE_TD_TIME}`;
      timeCell.textContent = this.formatTime(item.timestamp);

      // Mode
      const modeCell = document.createElement("td");
      modeCell.className = `${ADMIN_UI_CLASSES.TABLE_TD} ${ADMIN_UI_CLASSES.TABLE_TD_MODE}`;
      const modeChip = document.createElement("span");
      const modeModifier =
        item.viewMode === "vr"
          ? ADMIN_UI_CLASSES.TABLE_MODE_CHIP_VR
          : item.viewMode === "2d"
            ? ADMIN_UI_CLASSES.TABLE_MODE_CHIP_2D
            : ADMIN_UI_CLASSES.TABLE_MODE_CHIP_UNKNOWN;
      modeChip.className = `${ADMIN_UI_CLASSES.TABLE_MODE_CHIP} ${modeModifier}`;
      modeChip.textContent =
        item.viewMode === "vr"
          ? ADMIN_UI_TEXT.VIEW_MODE_VR
          : item.viewMode === "2d"
            ? ADMIN_UI_TEXT.VIEW_MODE_2D
            : ADMIN_UI_TEXT.VIEW_MODE_UNKNOWN;
      modeCell.appendChild(modeChip);

      // Rating (stars)
      const clampedRating = Math.min(5, Math.max(0, Math.round(item.rating)));
      const ratingCell = document.createElement("td");
      ratingCell.className = `${ADMIN_UI_CLASSES.TABLE_TD} ${ADMIN_UI_CLASSES.TABLE_STARS} ${ADMIN_UI_CLASSES.TABLE_TD_RATING}`;
      ratingCell.textContent =
        ADMIN_UI_TEXT.STAR_FILLED.repeat(clampedRating) +
        ADMIN_UI_TEXT.STAR_EMPTY.repeat(5 - clampedRating);

      // Feedback
      const feedbackCell = document.createElement("td");
      feedbackCell.className = `${ADMIN_UI_CLASSES.TABLE_TD} ${ADMIN_UI_CLASSES.TABLE_TD_FEEDBACK}`;
      feedbackCell.textContent = item.feedback || ADMIN_UI_TEXT.FEEDBACK_EMPTY;

      row.append(timeCell, modeCell, ratingCell, feedbackCell);
      this.tbodyElement.appendChild(row);
    }
  }

  private formatTime(timestamp: number): string {
    const shifted = new Date(timestamp + MUSEUM_UTC_OFFSET_MS);
    const day = shifted.getUTCDate();
    const month = SPANISH_MONTH_ABBR[shifted.getUTCMonth()] ?? "";
    const hours = String(shifted.getUTCHours()).padStart(2, "0");
    const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
    return `${day} ${month} ${hours}:${minutes}`;
  }
}
