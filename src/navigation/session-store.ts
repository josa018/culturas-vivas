import {
  SESSION_STORAGE_KEY,
  ScreenId,
} from './types';
import type {
  NavigationSession,
  SurveyAnswers,
  ViewMode,
} from './types';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class InMemoryStorage implements StorageAdapter {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function resolveStorageEngine(): StorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const testKey = '__cv_storage_probe__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    }
  } catch {
    // Falls back to in-memory storage if sessionStorage is blocked
  }
  return new InMemoryStorage();
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `session_${timestamp}_${randomPart}`;
}

export class SessionStore {
  private readonly storage: StorageAdapter;

  constructor(storageAdapter?: StorageAdapter) {
    this.storage = storageAdapter ?? resolveStorageEngine();
  }

  public createInitialSession(initialScreen: ScreenId = ScreenId.SPLASH): NavigationSession {
    const now = Date.now();
    const session: NavigationSession = {
      sessionId: generateSessionId(),
      currentScreen: initialScreen,
      viewMode: null,
      startedAt: now,
      lastUpdatedAt: now,
    };
    this.save(session);
    return session;
  }

  public getSession(): NavigationSession | null {
    try {
      const raw = this.storage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as NavigationSession;
      if (!parsed.sessionId || !parsed.currentScreen) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public save(session: NavigationSession): void {
    try {
      this.storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage write exceptions suppressed to prevent app crash
    }
  }

  public updateSession(
    updates: Partial<Omit<NavigationSession, 'sessionId' | 'startedAt'>>
  ): NavigationSession {
    const existing = this.getSession() ?? this.createInitialSession();
    const updated: NavigationSession = {
      ...existing,
      ...updates,
      lastUpdatedAt: Date.now(),
    };
    this.save(updated);
    return updated;
  }

  public setViewMode(mode: ViewMode): NavigationSession {
    return this.updateSession({ viewMode: mode });
  }

  public setSurveyAnswers(answers: SurveyAnswers): NavigationSession {
    return this.updateSession({ surveyAnswers: answers });
  }

  public clear(): void {
    try {
      this.storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage clear exceptions suppressed
    }
  }
}
