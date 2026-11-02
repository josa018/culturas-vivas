import { SESSION_CONSTANTS } from "./constants";

export interface SessionStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionNetworkFetcher {
  post<T = unknown>(url: string, body?: unknown): Promise<T>;
}

export function createBrowserStorageAdapter(): SessionStorageAdapter {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return {
      getItem: (k: string) => window.sessionStorage.getItem(k),
      setItem: (k: string, v: string) => window.sessionStorage.setItem(k, v),
      removeItem: (k: string) => window.sessionStorage.removeItem(k),
    };
  }

  const memoryStore = new Map<string, string>();
  return {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => memoryStore.set(k, v),
    removeItem: (k: string) => memoryStore.delete(k),
  };
}

export function createDefaultFetcher(): SessionNetworkFetcher {
  return {
    post: async <T = unknown>(url: string, body?: unknown): Promise<T> => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} from ${url}`);
      }

      return (await response.json()) as T;
    },
  };
}

export interface SessionStartResponse {
  sessionId?: string;
}

export interface SessionPingResponse {
  ok?: boolean;
}

/**
 * VisitorSessionManager handles anonymous visitor tracking and heartbeat pings.
 * Designed via composition for headless unit testing without DOM dependencies.
 */
export class VisitorSessionManager {
  private readonly storage: SessionStorageAdapter;
  private readonly fetcher: SessionNetworkFetcher;
  private readonly pingIntervalMs: number;
  private sessionId: string | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(
    storage: SessionStorageAdapter = createBrowserStorageAdapter(),
    fetcher: SessionNetworkFetcher = createDefaultFetcher(),
    pingIntervalMs: number = SESSION_CONSTANTS.HEARTBEAT_INTERVAL_MS
  ) {
    this.storage = storage;
    this.fetcher = fetcher;
    this.pingIntervalMs = pingIntervalMs;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public isTracking(): boolean {
    return this.intervalTimer !== null;
  }

  public async start(): Promise<string | null> {
    if (this.sessionId && this.intervalTimer !== null) {
      return this.sessionId;
    }

    if (this.isProcessing) {
      return this.sessionId;
    }

    this.isProcessing = true;

    try {
      let storedId = this.storage.getItem(SESSION_CONSTANTS.STORAGE_KEY);

      if (!storedId || !SESSION_CONSTANTS.REGEX.UUID_V4.test(storedId)) {
        try {
          const res = await this.fetcher.post<SessionStartResponse>(
            SESSION_CONSTANTS.ENDPOINTS.START
          );
          if (res?.sessionId && SESSION_CONSTANTS.REGEX.UUID_V4.test(res.sessionId)) {
            storedId = res.sessionId;
          } else {
            storedId = this.generateFallbackUuid();
          }
        } catch {
          storedId = this.generateFallbackUuid();
        }

        this.storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, storedId);
      }

      this.sessionId = storedId;
      this.ensureHeartbeat();
      return this.sessionId;
    } finally {
      this.isProcessing = false;
    }
  }

  public async sendPing(): Promise<boolean> {
    if (!this.sessionId) {
      return false;
    }

    try {
      const res = await this.fetcher.post<SessionPingResponse>(
        SESSION_CONSTANTS.ENDPOINTS.PING,
        { sessionId: this.sessionId }
      );
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }

  public stop(): void {
    if (this.intervalTimer !== null) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private ensureHeartbeat(): void {
    if (this.intervalTimer !== null) {
      return;
    }

    this.intervalTimer = setInterval(() => {
      void this.sendPing();
    }, this.pingIntervalMs);
  }

  private generateFallbackUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const val = char === "x" ? rand : (rand & 0x3) | 0x8;
      return val.toString(16);
    });
  }
}
