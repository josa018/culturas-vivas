
export const ADMIN_DASHBOARD_CONSTANTS = {
  DEFAULT_INITIAL_VISITOR_COUNT: 0,
  MIN_VISITOR_COUNT: 0,
  DEFAULT_HOURLY_LABELS: [
    "09:00", "10:00", "11:00", "12:00", "13:00",
    "14:00", "15:00", "16:00", "17:00", "18:00",
  ],
  DEFAULT_HOURLY_ATTENDANCE: [3, 8, 14, 19, 12, 10, 16, 22, 15, 6],
} as const;

export type ViewModeKind = "vr" | "2d";

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
  readonly surveys: readonly SurveyLogEntry[];
  readonly hourlyAttendance: HourlyAttendanceDataset;
  readonly connected: boolean;
}

export type DashboardListener = (state: DashboardState) => void;

export const INITIAL_MOCK_SURVEYS: readonly SurveyLogEntry[] = [
  {
    id: "srv-001",
    timestamp: Date.now() - 1000 * 60 * 18,
    rating: 5,
    feedback: "Excelente recorrido inmersivo, muy intuitivo.",
    viewMode: "vr",
  },
  {
    id: "srv-002",
    timestamp: Date.now() - 1000 * 60 * 42,
    rating: 4,
    feedback: "Buena fluidez en pantalla táctil, texto muy legible.",
    viewMode: "2d",
  },
  {
    id: "srv-003",
    timestamp: Date.now() - 1000 * 60 * 75,
    rating: 5,
    feedback: "Los hotspots culturales son claros y responden al instante.",
    viewMode: "vr",
  },
  {
    id: "srv-004",
    timestamp: Date.now() - 1000 * 60 * 110,
    rating: 3,
    feedback: "Me gustaría que tuviera mayor contraste en la barra de salida.",
    viewMode: "2d",
  },
];

export class AdminDashboardStore {
  private state: DashboardState;
  private readonly listeners = new Set<DashboardListener>();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    initialVisitorsCount: number = 0,
    initialSurveys: readonly SurveyLogEntry[] = INITIAL_MOCK_SURVEYS,
    initialHourlyData: HourlyAttendanceDataset = {
      labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
      values: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_ATTENDANCE],
    },
  ) {
    this.state = {
      activeVisitorsCount: initialVisitorsCount,
      surveys: [...initialSurveys],
      hourlyAttendance: {
        labels: [...initialHourlyData.labels],
        values: [...initialHourlyData.values],
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
    if (this.pollingTimer) return;

    void this.fetchStats();

    this.pollingTimer = setInterval(() => {
      void this.fetchStats();
    }, 10000);
  }

  public stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private async fetchStats(): Promise<void> {
    try {
      const response = await fetch("/api/admin/stats", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Error consultando estadísticas");
      }

      const data = await response.json();

      const count = Number(data.activeSessions);

      if (!Number.isFinite(count) || count < 0) {
        throw new Error("Respuesta inválida del backend");
      }

      this.state = {
        ...this.state,
        activeVisitorsCount: count,
        connected: true,
      };
    } catch (error) {
      console.error("Error al sincronizar dashboard:", error);

      this.state = {
        ...this.state,
        connected: false,
      };
    }

    this.notify();
  }

  public setVisitorCount(count: number): void {
    this.state = {
      ...this.state,
      activeVisitorsCount: Math.max(0, Math.floor(count)),
    };
    this.notify();
  }

  public addSurvey(entry: SurveyLogEntry): void {
    this.state = {
      ...this.state,
      surveys: [entry, ...this.state.surveys],
    };
    this.notify();
  }

  public getAverageRating(): number {
    if (this.state.surveys.length === 0) return 0;

    const sum = this.state.surveys.reduce(
      (accum, item) => accum + item.rating,
      0,
    );

    return Number((sum / this.state.surveys.length).toFixed(1));
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
