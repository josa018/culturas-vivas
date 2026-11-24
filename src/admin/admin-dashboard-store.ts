import {
  AdminHttpError,
  createDefaultAdminFetcher,
  type AdminNetworkFetcher,
} from "./admin-http-client";

const HOURS_IN_DAY = 24;

function buildHourlyLabels(): readonly string[] {
  return Array.from({ length: HOURS_IN_DAY }, (_, hour) =>
    `${String(hour).padStart(2, "0")}:00`,
  );
}

export const ADMIN_DASHBOARD_CONSTANTS = {
  DEFAULT_INITIAL_VISITOR_COUNT: 0,
  MIN_VISITOR_COUNT: 0,
  POLL_INTERVAL_MS: 10000,
  HOURS_IN_DAY,
  DEFAULT_SURVEY_PAGE: 1,
  DEFAULT_SURVEY_PAGE_SIZE: 10,
  ENDPOINTS: {
    STATS: "/api/admin/stats",
  },
  HTTP_STATUS: {
    UNAUTHORIZED: 401,
  },
  DEFAULT_HOURLY_LABELS: buildHourlyLabels(),
  EMPTY_HOURLY_VALUES: Array.from({ length: HOURS_IN_DAY }, () => 0),
} as const;

export type ViewModeKind = "vr" | "2d" | null;
export type ConnectionStatus = "connecting" | "online" | "offline";
export type ChartTimeRange = "day" | "week" | "month" | "year";
export type SurveyModeFilter = "all" | "vr" | "2d";
export type SurveyRatingFilter = "all" | "1" | "2" | "3" | "4" | "5";
export type SurveySortOption =
  | "newest"
  | "oldest"
  | "rating_desc"
  | "rating_asc";

export interface SurveyFilters {
  readonly mode: SurveyModeFilter;
  readonly rating: SurveyRatingFilter;
  readonly hasFeedbackOnly: boolean;
  readonly sort: SurveySortOption;
}

export interface SurveysPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface SurveyLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly rating: number;
  readonly feedback: string;
  readonly viewMode: ViewModeKind;
}

export interface HourlyAttendanceDataset {
  readonly labels: readonly string[];
  readonly values: readonly number[];
}

export interface DashboardState {
  readonly activeVisitorsCount: number;
  readonly dailyPeak: number;
  readonly averageRating: number;
  readonly totalSurveys: number;
  readonly surveys: readonly SurveyLogEntry[];
  readonly surveyFilters: SurveyFilters;
  readonly surveysPagination: SurveysPagination;
  readonly hourlyAttendance: HourlyAttendanceDataset;
  readonly selectedRange: ChartTimeRange;
  readonly connectionStatus: ConnectionStatus;
  readonly connected: boolean;
}

export type DashboardListener = (state: DashboardState) => void;

export interface AdminDashboardStoreOptions {
  readonly getToken?: () => string | null;
  readonly fetcher?: AdminNetworkFetcher;
  readonly onUnauthorized?: () => void;
  readonly pollIntervalMs?: number;
  readonly initialVisitorsCount?: number;
  readonly initialSurveys?: readonly SurveyLogEntry[];
}

interface AdminStatsPayload {
  readonly activeSessions?: unknown;
  readonly hourlyAttendance?: {
    readonly labels?: unknown;
    readonly values?: unknown;
    readonly peak?: unknown;
  };
  readonly surveys?: unknown;
  readonly surveysPagination?: {
    readonly page?: unknown;
    readonly pageSize?: unknown;
    readonly totalItems?: unknown;
    readonly totalPages?: unknown;
  };
  readonly totalSurveys?: unknown;
  readonly averageRating?: unknown;
}

function normalizeViewMode(value: unknown): ViewModeKind {
  if (value === "vr" || value === "2d") {
    return value;
  }
  return null;
}

function parseSurveyEntries(raw: unknown): SurveyLogEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: SurveyLogEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const rating = Number(record.rating);
    const timestamp = Number(record.timestamp);
    if (!Number.isFinite(rating) || !Number.isFinite(timestamp)) {
      continue;
    }
    entries.push({
      id: String(record.id ?? ""),
      timestamp,
      rating,
      feedback: typeof record.feedback === "string" ? record.feedback : "",
      viewMode: normalizeViewMode(record.viewMode),
    });
  }
  return entries;
}

function computeAverage(surveys: readonly SurveyLogEntry[]): number {
  if (surveys.length === 0) {
    return 0;
  }
  const sum = surveys.reduce((accum, item) => accum + item.rating, 0);
  return Number((sum / surveys.length).toFixed(1));
}

/**
 * Reactive dashboard store hydrated exclusively from authenticated `/api/admin/stats` responses.
 */
export class AdminDashboardStore {
  private state: DashboardState;
  private readonly listeners = new Set<DashboardListener>();
  private readonly getToken?: () => string | null;
  private readonly fetcher: AdminNetworkFetcher;
  private readonly onUnauthorized?: () => void;
  private readonly pollIntervalMs: number;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AdminDashboardStoreOptions = {}) {
    const initialSurveys = options.initialSurveys
      ? [...options.initialSurveys]
      : [];
    const initialVisitorsCount = Math.max(
      ADMIN_DASHBOARD_CONSTANTS.MIN_VISITOR_COUNT,
      Math.floor(
        options.initialVisitorsCount ??
          ADMIN_DASHBOARD_CONSTANTS.DEFAULT_INITIAL_VISITOR_COUNT,
      ),
    );

    this.getToken = options.getToken;
    this.fetcher = options.fetcher ?? createDefaultAdminFetcher();
    this.onUnauthorized = options.onUnauthorized;
    this.pollIntervalMs =
      options.pollIntervalMs ?? ADMIN_DASHBOARD_CONSTANTS.POLL_INTERVAL_MS;

    this.state = {
      activeVisitorsCount: initialVisitorsCount,
      dailyPeak: initialVisitorsCount,
      averageRating: computeAverage(initialSurveys),
      totalSurveys: initialSurveys.length,
      surveys: initialSurveys,
      surveyFilters: {
        mode: "all",
        rating: "all",
        hasFeedbackOnly: false,
        sort: "newest",
      },
      surveysPagination: {
        page: ADMIN_DASHBOARD_CONSTANTS.DEFAULT_SURVEY_PAGE,
        pageSize: ADMIN_DASHBOARD_CONSTANTS.DEFAULT_SURVEY_PAGE_SIZE,
        totalItems: initialSurveys.length,
        totalPages: 1,
      },
      hourlyAttendance: {
        labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
        values: [...ADMIN_DASHBOARD_CONSTANTS.EMPTY_HOURLY_VALUES],
      },
      selectedRange: "day",
      connectionStatus: "connecting",
      connected: false,
    };
  }

  public getState(): DashboardState {
    return this.state;
  }

  public isPolling(): boolean {
    return this.pollingTimer !== null;
  }

  public startPolling(): void {
    if (this.pollingTimer) {
      return;
    }

    void this.fetchStats();

    this.pollingTimer = setInterval(() => {
      void this.fetchStats();
    }, this.pollIntervalMs);
  }

  public stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public async setRange(range: ChartTimeRange): Promise<void> {
    if (this.state.selectedRange === range) {
      return;
    }
    this.state = {
      ...this.state,
      selectedRange: range,
    };
    this.notify();
    await this.fetchStats();
  }

  public async setSurveyFilters(
    partial: Partial<SurveyFilters>,
  ): Promise<void> {
    this.state = {
      ...this.state,
      surveyFilters: {
        ...this.state.surveyFilters,
        ...partial,
      },
      surveysPagination: {
        ...this.state.surveysPagination,
        page: ADMIN_DASHBOARD_CONSTANTS.DEFAULT_SURVEY_PAGE,
      },
    };
    this.notify();
    await this.fetchStats();
  }

  public async setSurveyPage(page: number): Promise<void> {
    const totalPages = Math.max(1, this.state.surveysPagination.totalPages);
    const clampedPage = Math.min(totalPages, Math.max(1, Math.floor(page)));
    if (clampedPage === this.state.surveysPagination.page) {
      return;
    }
    this.state = {
      ...this.state,
      surveysPagination: {
        ...this.state.surveysPagination,
        page: clampedPage,
      },
    };
    this.notify();
    await this.fetchStats();
  }

  private buildStatsUrl(): string {
    const params = new URLSearchParams();
    if (this.state.selectedRange !== "day") {
      params.set("range", this.state.selectedRange);
    }
    const { mode, rating, hasFeedbackOnly, sort } = this.state.surveyFilters;
    if (mode !== "all") {
      params.set("surveyMode", mode);
    }
    if (rating !== "all") {
      params.set("surveyRating", rating);
    }
    if (hasFeedbackOnly) {
      params.set("surveyHasFeedback", "1");
    }
    if (sort !== "newest") {
      params.set("surveySort", sort);
    }
    if (
      this.state.surveysPagination.page >
      ADMIN_DASHBOARD_CONSTANTS.DEFAULT_SURVEY_PAGE
    ) {
      params.set("surveyPage", String(this.state.surveysPagination.page));
    }
    const qs = params.toString();
    return qs.length > 0
      ? `${ADMIN_DASHBOARD_CONSTANTS.ENDPOINTS.STATS}?${qs}`
      : ADMIN_DASHBOARD_CONSTANTS.ENDPOINTS.STATS;
  }

  public async fetchStats(): Promise<void> {
    const token = this.getToken ? this.getToken() : null;
    if (!token) {
      this.state = {
        ...this.state,
        connectionStatus: "offline",
        connected: false,
      };
      this.notify();
      this.onUnauthorized?.();
      return;
    }

    try {
      const data = await this.fetcher.get<AdminStatsPayload>(
        this.buildStatsUrl(),
        { Authorization: `Bearer ${token}` },
      );

      const count = Number(data.activeSessions);
      if (!Number.isFinite(count) || count < 0) {
        throw new Error("Invalid activeSessions payload from telemetry API");
      }

      const rawLabels = Array.isArray(data.hourlyAttendance?.labels)
        ? data.hourlyAttendance.labels.map(String)
        : [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS];

      const rawValues = Array.isArray(data.hourlyAttendance?.values)
        ? data.hourlyAttendance.values.map((v) =>
            Math.max(0, Math.floor(Number(v) || 0)),
          )
        : [...ADMIN_DASHBOARD_CONSTANTS.EMPTY_HOURLY_VALUES];

      const rawPeak = Number(data.hourlyAttendance?.peak);
      const computedPeak =
        Number.isFinite(rawPeak) && rawPeak >= 0
          ? Math.floor(rawPeak)
          : rawValues.length > 0
            ? Math.max(...rawValues)
            : 0;

      const parsedSurveys = parseSurveyEntries(data.surveys);
      const rawAvg = Number(data.averageRating);
      const averageRating =
        Number.isFinite(rawAvg) && rawAvg >= 0
          ? Number(rawAvg.toFixed(1))
          : computeAverage(parsedSurveys);
      const rawTotalSurveys = Number(data.totalSurveys);
      const totalSurveys =
        Number.isFinite(rawTotalSurveys) && rawTotalSurveys >= 0
          ? Math.floor(rawTotalSurveys)
          : parsedSurveys.length;
      const rawPag = data.surveysPagination;
      const pageSize =
        Number.isFinite(Number(rawPag?.pageSize)) && Number(rawPag?.pageSize) > 0
          ? Math.floor(Number(rawPag?.pageSize))
          : this.state.surveysPagination.pageSize;
      const totalItems =
        Number.isFinite(Number(rawPag?.totalItems)) &&
        Number(rawPag?.totalItems) >= 0
          ? Math.floor(Number(rawPag?.totalItems))
          : parsedSurveys.length;
      const totalPages =
        Number.isFinite(Number(rawPag?.totalPages)) &&
        Number(rawPag?.totalPages) >= 1
          ? Math.floor(Number(rawPag?.totalPages))
          : Math.max(1, Math.ceil(totalItems / pageSize));
      const page =
        Number.isFinite(Number(rawPag?.page)) && Number(rawPag?.page) >= 1
          ? Math.min(totalPages, Math.floor(Number(rawPag?.page)))
          : Math.min(totalPages, this.state.surveysPagination.page);

      this.state = {
        ...this.state,
        activeVisitorsCount: Math.floor(count),
        dailyPeak: computedPeak,
        averageRating,
        totalSurveys,
        surveys: parsedSurveys,
        surveysPagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
        },
        hourlyAttendance: {
          labels: rawLabels,
          values: rawValues,
        },
        connectionStatus: "online",
        connected: true,
      };
      this.notify();
    } catch (error) {
      if (
        error instanceof AdminHttpError &&
        error.status === ADMIN_DASHBOARD_CONSTANTS.HTTP_STATUS.UNAUTHORIZED
      ) {
        this.stopPolling();
        this.state = {
          ...this.state,
          connectionStatus: "offline",
          connected: false,
        };
        this.notify();
        this.onUnauthorized?.();
        return;
      }

      this.state = {
        ...this.state,
        connectionStatus: "offline",
        connected: false,
      };
      this.notify();
    }
  }

  public setVisitorCount(count: number): void {
    const normalized = Math.max(
      ADMIN_DASHBOARD_CONSTANTS.MIN_VISITOR_COUNT,
      Math.floor(count),
    );
    this.state = {
      ...this.state,
      activeVisitorsCount: normalized,
      dailyPeak: Math.max(this.state.dailyPeak, normalized),
    };
    this.notify();
  }

  public addSurvey(entry: SurveyLogEntry): void {
    const updatedSurveys = [entry, ...this.state.surveys];
    this.state = {
      ...this.state,
      surveys: updatedSurveys,
      averageRating: computeAverage(updatedSurveys),
    };
    this.notify();
  }

  public getAverageRating(): number {
    return this.state.averageRating;
  }

  public getDailyPeak(): number {
    return this.state.dailyPeak;
  }

  public subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
