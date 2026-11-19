import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
  SessionStore,
  ViewMode,
  type StorageAdapter,
} from "../../src/navigation/index";

class InMemoryStorage implements StorageAdapter {
  private readonly store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe("SessionStore", () => {
  it("creates, updates, and clears session data in storage", () => {
    const store = new SessionStore(new InMemoryStorage());

    const initial = store.createInitialSession(ScreenId.SPLASH);
    expect(initial.currentScreen).toBe(ScreenId.SPLASH);
    expect(initial.viewMode).toBeNull();
    expect(initial.sessionId.length).toBeGreaterThan(0);

    store.setViewMode(ViewMode.VR);
    expect(store.getSession()?.viewMode).toBe(ViewMode.VR);

    store.setSurveyAnswers({ rating: 5, feedback: "Excelente experiencia" });
    expect(store.getSession()?.surveyAnswers).toEqual({
      rating: 5,
      feedback: "Excelente experiencia",
    });

    store.clear();
    expect(store.getSession()).toBeNull();
  });

  it("returns null gracefully when persisted JSON is corrupted or incomplete", () => {
    const storage = new InMemoryStorage();
    const store = new SessionStore(storage);

    storage.setItem("culturas_vivas_session", "{bad-json");
    expect(store.getSession()).toBeNull();

    storage.setItem("culturas_vivas_session", JSON.stringify({ sessionId: "abc" }));
    expect(store.getSession()).toBeNull();
  });
});

describe("NavigationStateMachine", () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores existing persisted screen and viewMode on initialization", () => {
    const store = new SessionStore(storage);
    store.createInitialSession(ScreenId.EXPERIENCE_3D);
    store.setViewMode(ViewMode.TOUCH_2D);

    const fsm = new NavigationStateMachine(store);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);
  });

  it("performs full VR linear traversal (Splash -> Welcome -> Tutorial -> Experience -> Exit -> Survey -> Welcome)", () => {
    const fsm = new NavigationStateMachine(new SessionStore(storage));

    expect(fsm.getCurrentScreen()).toBe(ScreenId.SPLASH);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.WELCOME);

    fsm.dispatch(NavigationAction.SELECT_VR);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.TUTORIAL);
    expect(fsm.getSession().viewMode).toBe(ViewMode.VR);

    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);

    fsm.dispatch(NavigationAction.CONFIRM_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.SURVEY);

    fsm.dispatch(NavigationAction.COMPLETE_SURVEY, {
      surveyAnswers: { rating: 4, feedback: "Todo bien" },
    });
    expect(fsm.getCurrentScreen()).toBe(ScreenId.WELCOME);
    expect(fsm.getSession().surveyAnswers?.rating).toBe(4);
  });

  it("navigates 2D path bypassing tutorial", () => {
    const fsm = new NavigationStateMachine(new SessionStore(storage));

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_2D);

    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);
  });

  it("resumes tour from exit modal back to 3D scene", () => {
    const fsm = new NavigationStateMachine(new SessionStore(storage));

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_2D);
    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);

    fsm.dispatch(NavigationAction.RESUME_TOUR);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
  });

  it("switches to touch mode from exit modal or directly from EXPERIENCE_3D while in VR", () => {
    const fsm = new NavigationStateMachine(new SessionStore(storage));

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_VR);
    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);
    expect(fsm.canDispatch(NavigationAction.SWITCH_TO_TOUCH)).toBe(true);

    fsm.dispatch(NavigationAction.SWITCH_TO_TOUCH);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    fsm.dispatch(NavigationAction.SWITCH_TO_TOUCH);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);
  });

  it("rejects illegal transitions without mutating state", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fsm = new NavigationStateMachine(new SessionStore(storage));

    expect(fsm.canDispatch(NavigationAction.CONFIRM_EXIT)).toBe(false);
    expect(fsm.dispatch(NavigationAction.CONFIRM_EXIT)).toBe(ScreenId.SPLASH);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.SPLASH);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("notifies listeners immediately and on updates, respects unsubscribe, and supports reset()", () => {
    const fsm = new NavigationStateMachine(new SessionStore(storage));
    const emittedScreens: ScreenId[] = [];
    const unsubscribe = fsm.subscribe((screenId) => {
      emittedScreens.push(screenId);
    });

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_VR);
    unsubscribe();
    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);

    expect(emittedScreens).toEqual([
      ScreenId.SPLASH,
      ScreenId.WELCOME,
      ScreenId.TUTORIAL,
    ]);

    fsm.reset(ScreenId.WELCOME);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.WELCOME);
    expect(fsm.getSession().viewMode).toBeNull();
  });
});
