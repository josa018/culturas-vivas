export const ADMIN_DASHBOARD_CONSTANTS = {
  DEFAULT_INITIAL_VISITOR_COUNT: 7,
  MIN_VISITOR_COUNT: 0,
  DEFAULT_HOURLY_LABELS: [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
  ],
  DEFAULT_HOURLY_ATTENDANCE: [3, 8, 14, 19, 12, 10, 16, 22, 15, 6],
} as const;

export const ADMIN_SIMULATION_CONFIG = {
  DEFAULT_INTERVAL_MS: 4000,
  MIN_RANDOM_VISITORS: 4,
  MAX_RANDOM_VISITORS: 22,
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
  private simulationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    initialVisitorsCount: number = ADMIN_DASHBOARD_CONSTANTS.DEFAULT_INITIAL_VISITOR_COUNT,
    initialSurveys: readonly SurveyLogEntry[] = INITIAL_MOCK_SURVEYS,
    initialHourlyData: HourlyAttendanceDataset = {
      labels: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_LABELS],
      values: [...ADMIN_DASHBOARD_CONSTANTS.DEFAULT_HOURLY_ATTENDANCE],
    },
  ) {
    this.state = {
      activeVisitorsCount: Math.max(
        ADMIN_DASHBOARD_CONSTANTS.MIN_VISITOR_COUNT,
        initialVisitorsCount,
      ),
      surveys: [...initialSurveys],
      hourlyAttendance: {
        labels: [...initialHourlyData.labels],
        values: [...initialHourlyData.values],
      },
    };
  }

  public getState(): DashboardState {
    return this.state;
  }

  public isSimulating(): boolean {
    return this.simulationTimer !== null;
  }

  public startSimulation(intervalMs: number = ADMIN_SIMULATION_CONFIG.DEFAULT_INTERVAL_MS): void {
    if (this.simulationTimer) {
      return;
    }
    this.simulationTimer = setInterval(() => {
      this.fluctuateVisitors();
    }, intervalMs);
  }

  public stopSimulation(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  public fluctuateVisitors(): void {
    const deltas = [-2, -1, -1, 0, 1, 1, 2];
    const delta = deltas[Math.floor(Math.random() * deltas.length)];
    const current = this.state.activeVisitorsCount;
    const target = Math.max(
      ADMIN_SIMULATION_CONFIG.MIN_RANDOM_VISITORS,
      Math.min(ADMIN_SIMULATION_CONFIG.MAX_RANDOM_VISITORS, current + delta),
    );
    this.setVisitorCount(target);
  }

  public incrementVisitor(): void {
    this.setVisitorCount(this.state.activeVisitorsCount + 1);
  }

  public decrementVisitor(): void {
    this.setVisitorCount(this.state.activeVisitorsCount - 1);
  }

  public setVisitorCount(count: number): void {
    const clampedCount = Math.max(
      ADMIN_DASHBOARD_CONSTANTS.MIN_VISITOR_COUNT,
      Math.floor(count),
    );

    if (clampedCount === this.state.activeVisitorsCount) {
      return;
    }

    this.state = {
      ...this.state,
      activeVisitorsCount: clampedCount,
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
    if (this.state.surveys.length === 0) {
      return 0;
    }
    const sum = this.state.surveys.reduce(
      (accum, item) => accum + item.rating,
      0,
    );
    const average = sum / this.state.surveys.length;
    return Number(average.toFixed(1));
  }

  public subscribe(listener: DashboardListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
