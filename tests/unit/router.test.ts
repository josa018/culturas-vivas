import { describe, it, expect, beforeEach } from "vitest";
import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
  SessionStore,
  ViewMode,
  StorageAdapter,
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

  public clear(): void {
    this.store.clear();
  }
}

describe("Navigation & State Machine", () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it("handles SessionStore CRUD operations correctly", () => {
    const store = new SessionStore(storage);

    const initial = store.createInitialSession(ScreenId.SPLASH);
    expect(initial.currentScreen).toBe(ScreenId.SPLASH);
    expect(initial.viewMode).toBeNull();
    expect(initial.sessionId.length).toBeGreaterThan(0);

    store.setViewMode(ViewMode.VR);
    const updated = store.getSession();
    expect(updated?.viewMode).toBe(ViewMode.VR);

    store.setSurveyAnswers({ rating: 5, feedback: "Excelente experiencia" });
    const withSurvey = store.getSession();
    expect(withSurvey?.surveyAnswers?.rating).toBe(5);

    store.clear();
    expect(store.getSession()).toBeNull();
  });

  it("performs full VR linear traversal (Screens 1 -> 6 -> Welcome)", () => {
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

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

  it("navigates alternative 2D path bypassing tutorial", () => {
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.WELCOME);

    fsm.dispatch(NavigationAction.SELECT_2D);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);
  });

  it("resumes tour from exit modal back to 3D scene", () => {
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_2D);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);

    fsm.dispatch(NavigationAction.RESUME_TOUR);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
  });

  it("switches to touch mode from exit modal while in VR", () => {
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_VR);
    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.VR);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);

    fsm.dispatch(NavigationAction.SWITCH_TO_TOUCH);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);
  });

  it("safely rejects illegal transitions", () => {
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    expect(fsm.getCurrentScreen()).toBe(ScreenId.SPLASH);
    expect(fsm.canDispatch(NavigationAction.CONFIRM_EXIT)).toBe(false);

    const resultingState = fsm.dispatch(NavigationAction.CONFIRM_EXIT);
    expect(resultingState).toBe(ScreenId.SPLASH);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.SPLASH);
  });

  it("notifies listeners on state changes and respects unsubscribe", () => {
    const store = new SessionStore(storage);
    const fsm = new NavigationStateMachine(store);

    const emittedScreens: (typeof ScreenId)[keyof typeof ScreenId][] = [];
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
  });
});
