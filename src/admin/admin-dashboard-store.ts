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
  readonly surveys: readonly SurveyLogEntry[];
  readonly hourlyAttendance: HourlyAttendanceDataset;
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
      surveys: initialSurveys,
      hourlyAttendance: {
        labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
        values: [...ADMIN_DASHBOARD_CONSTANTS.EMPTY_HOURLY_VALUES],
      },
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

  public async fetchStats(): Promise<void> {
    const token = this.getToken ? this.getToken() : null;
    if (!token) {
      this.state = { ...this.state, connected: false };
      this.notify();
      this.onUnauthorized?.();
      return;
    }

    try {
      const data = await this.fetcher.get<AdminStatsPayload>(
        ADMIN_DASHBOARD_CONSTANTS.ENDPOINTS.STATS,
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

      this.state = {
        activeVisitorsCount: Math.floor(count),
        dailyPeak: computedPeak,
        averageRating,
        surveys: parsedSurveys,
        hourlyAttendance: {
          labels: rawLabels,
          values: rawValues,
        },
        connected: true,
      };
      this.notify();
    } catch (error) {
      if (
        error instanceof AdminHttpError &&
        error.status === ADMIN_DASHBOARD_CONSTANTS.HTTP_STATUS.UNAUTHORIZED
      ) {
        this.stopPolling();
        this.state = { ...this.state, connected: false };
        this.notify();
        this.onUnauthorized?.();
        return;
      }

      this.state = {
        ...this.state,
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
