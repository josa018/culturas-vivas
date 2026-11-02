import type { StorageAdapter } from "../navigation/session-store";

export const ADMIN_AUTH_CONSTANTS = {
  STORAGE_KEY: "culturas_vivas_admin_auth",
  MOCK_TOKEN_PREFIX: "mock_jwt_librarian_",
  DEFAULT_USERNAME: "admin",
  DEFAULT_PASSWORD: "admin123",
  DEFAULT_ROLE: "librarian",
} as const;

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

export class AdminAuthStore {
  private readonly storage: StorageAdapter;
  private state: AdminAuthState;
  private readonly listeners = new Set<AdminAuthListener>();

  constructor(storage: StorageAdapter = new DefaultBrowserStorage()) {
    this.storage = storage;
    this.state = this.loadPersistedState();
  }

  public getState(): AdminAuthState {
    return this.state;
  }

  public login(credentials: AdminAuthCredentials): boolean {
    const isValidUsername =
      credentials.username.trim() === ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME;
    const isValidPassword =
      credentials.password === ADMIN_AUTH_CONSTANTS.DEFAULT_PASSWORD;

    if (!isValidUsername || !isValidPassword) {
      return false;
    }

    const token = `${ADMIN_AUTH_CONSTANTS.MOCK_TOKEN_PREFIX}${Date.now()}`;
    const user: AdminUser = {
      username: ADMIN_AUTH_CONSTANTS.DEFAULT_USERNAME,
      role: ADMIN_AUTH_CONSTANTS.DEFAULT_ROLE,
    };

    this.state = {
      isAuthenticated: true,
      token,
      user,
    };

    this.persistState(this.state);
    this.notify();
    return true;
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
      if (parsed.isAuthenticated && parsed.token && parsed.user) {
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
