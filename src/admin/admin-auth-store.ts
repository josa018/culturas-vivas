import type { StorageAdapter } from "../navigation/session-store";
import {
  AdminHttpError,
  createDefaultAdminFetcher,
  type AdminNetworkFetcher,
} from "./admin-http-client";

export const ADMIN_AUTH_CONSTANTS = {
  STORAGE_KEY: "culturas_vivas_admin_auth",
  ENDPOINTS: {
    LOGIN: "/api/admin/login",
  },
  HTTP_STATUS: {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
  },
} as const;

export type AdminAuthErrorKind = "invalid_credentials" | "service_unavailable";

export interface AdminUser {
  readonly username: string;
  readonly role: string;
}

export interface AdminAuthState {
  readonly isAuthenticated: boolean;
  readonly token: string | null;
  readonly user: AdminUser | null;
}

export interface AdminAuthCredentials {
  readonly username: string;
  readonly password: string;
}

export interface AdminLoginResponse {
  readonly token?: string;
  readonly user?: {
    readonly username?: string;
    readonly role?: string;
  };
}

export type AdminAuthListener = (state: AdminAuthState) => void;

class DefaultBrowserStorage implements StorageAdapter {
  public getItem(key: string): string | null {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return null;
    }
    return window.sessionStorage.getItem(key);
  }

  public setItem(key: string, value: string): void {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  }

  public removeItem(key: string): void {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  }

  public clear(): void {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  }
}

/**
 * Manages authenticated administrative session state via server-backed JWT verification.
 */
export class AdminAuthStore {
  private readonly storage: StorageAdapter;
  private readonly fetcher: AdminNetworkFetcher;
  private state: AdminAuthState;
  private lastError: AdminAuthErrorKind | null = null;
  private readonly listeners = new Set<AdminAuthListener>();

  constructor(
    storage: StorageAdapter = new DefaultBrowserStorage(),
    fetcher: AdminNetworkFetcher = createDefaultAdminFetcher(),
  ) {
    this.storage = storage;
    this.fetcher = fetcher;
    this.state = this.loadPersistedState();
  }

  public getState(): AdminAuthState {
    return this.state;
  }

  public getLastError(): AdminAuthErrorKind | null {
    return this.lastError;
  }

  public async login(credentials: AdminAuthCredentials): Promise<boolean> {
    const username = credentials.username.trim();
    const password = credentials.password;

    if (!username || !password) {
      this.lastError = "invalid_credentials";
      return false;
    }

    try {
      const response = await this.fetcher.post<AdminLoginResponse>(
        ADMIN_AUTH_CONSTANTS.ENDPOINTS.LOGIN,
        { username, password },
      );

      if (
        typeof response?.token !== "string" ||
        response.token.length === 0 ||
        typeof response.user?.username !== "string" ||
        typeof response.user?.role !== "string"
      ) {
        this.lastError = "service_unavailable";
        return false;
      }

      this.lastError = null;
      this.state = {
        isAuthenticated: true,
        token: response.token,
        user: {
          username: response.user.username,
          role: response.user.role,
        },
      };

      this.persistState(this.state);
      this.notify();
      return true;
    } catch (error) {
      if (
        error instanceof AdminHttpError &&
        (error.status === ADMIN_AUTH_CONSTANTS.HTTP_STATUS.UNAUTHORIZED ||
          error.status === ADMIN_AUTH_CONSTANTS.HTTP_STATUS.BAD_REQUEST)
      ) {
        this.lastError = "invalid_credentials";
      } else {
        this.lastError = "service_unavailable";
      }
      return false;
    }
  }

  public logout(): void {
    this.state = {
      isAuthenticated: false,
      token: null,
      user: null,
    };

    this.storage.removeItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY);
    this.notify();
  }

  public subscribe(listener: AdminAuthListener): () => void {
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

  private loadPersistedState(): AdminAuthState {
    try {
      const serialized = this.storage.getItem(ADMIN_AUTH_CONSTANTS.STORAGE_KEY);
      if (!serialized) {
        return { isAuthenticated: false, token: null, user: null };
      }
      const parsed = JSON.parse(serialized) as Partial<AdminAuthState>;
      if (
        parsed.isAuthenticated &&
        typeof parsed.token === "string" &&
        parsed.token.length > 0 &&
        parsed.user?.username &&
        parsed.user?.role
      ) {
        return {
          isAuthenticated: true,
          token: parsed.token,
          user: parsed.user,
        };
      }
    } catch {
      // Storage corrupted or unavailable; fallback to unauthenticated state
    }
    return { isAuthenticated: false, token: null, user: null };
  }

  private persistState(state: AdminAuthState): void {
    try {
      this.storage.setItem(
        ADMIN_AUTH_CONSTANTS.STORAGE_KEY,
        JSON.stringify(state),
      );
    } catch {
      // Storage quota exceeded or disabled in browser
    }
  }
}
