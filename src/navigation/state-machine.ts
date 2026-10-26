import {
  NavigationAction,
  ScreenId,
  ViewMode,
} from './types';
import type {
  NavigationListener,
  NavigationSession,
  SurveyAnswers,
  Unsubscribe,
} from './types';
import { SessionStore } from './session-store';

type TransitionMap = {
  readonly [K in ScreenId]: {
    readonly [A in NavigationAction]?: ScreenId;
  };
};

const TRANSITIONS: TransitionMap = {
  [ScreenId.SPLASH]: {
    [NavigationAction.FINISH_LOADING]: ScreenId.WELCOME,
  },
  [ScreenId.WELCOME]: {
    [NavigationAction.SELECT_VR]: ScreenId.TUTORIAL,
    [NavigationAction.SELECT_2D]: ScreenId.EXPERIENCE_3D,
  },
  [ScreenId.TUTORIAL]: {
    [NavigationAction.CONFIRM_INSERTION]: ScreenId.EXPERIENCE_3D,
  },
  [ScreenId.EXPERIENCE_3D]: {
    [NavigationAction.REQUEST_EXIT]: ScreenId.EXIT_MODAL,
  },
  [ScreenId.EXIT_MODAL]: {
    [NavigationAction.RESUME_TOUR]: ScreenId.EXPERIENCE_3D,
    [NavigationAction.CONFIRM_EXIT]: ScreenId.SURVEY,
  },
  [ScreenId.SURVEY]: {
    [NavigationAction.COMPLETE_SURVEY]: ScreenId.WELCOME,
    [NavigationAction.SKIP_SURVEY]: ScreenId.WELCOME,
  },
};

type SessionUpdates = {
  -readonly [K in keyof Omit<NavigationSession, 'sessionId' | 'startedAt'>]?: NavigationSession[K];
};

export interface DispatchPayload {
  readonly viewMode?: ViewMode;
  readonly surveyAnswers?: SurveyAnswers;
}

export class NavigationStateMachine {
  private currentScreen: ScreenId;
  private session: NavigationSession;
  private readonly listeners = new Set<NavigationListener>();
  private readonly sessionStore: SessionStore;

  constructor(sessionStore: SessionStore = new SessionStore()) {
    this.sessionStore = sessionStore;
    const restoredSession = this.sessionStore.getSession();

    if (restoredSession) {
      this.session = restoredSession;
      this.currentScreen = restoredSession.currentScreen;
    } else {
      this.session = this.sessionStore.createInitialSession(ScreenId.SPLASH);
      this.currentScreen = ScreenId.SPLASH;
    }
  }

  public getCurrentScreen(): ScreenId {
    return this.currentScreen;
  }

  public getSession(): NavigationSession {
    return this.session;
  }

  public canDispatch(action: NavigationAction): boolean {
    const screenTransitions = TRANSITIONS[this.currentScreen];
    return Boolean(screenTransitions && screenTransitions[action]);
  }

  public dispatch(action: NavigationAction, payload?: DispatchPayload): ScreenId {
    const screenTransitions = TRANSITIONS[this.currentScreen];
    const nextScreen = screenTransitions?.[action];

    if (!nextScreen) {
      console.warn(
        `[NavigationStateMachine] Rejected invalid transition: action '${action}' is not valid from state '${this.currentScreen}'`
      );
      return this.currentScreen;
    }

    this.currentScreen = nextScreen;

    const updates: SessionUpdates = {
      currentScreen: nextScreen,
    };

    if (action === NavigationAction.SELECT_VR) {
      updates.viewMode = ViewMode.VR;
    } else if (action === NavigationAction.SELECT_2D) {
      updates.viewMode = ViewMode.TOUCH_2D;
    } else if (payload?.viewMode) {
      updates.viewMode = payload.viewMode;
    }

    if (payload?.surveyAnswers) {
      updates.surveyAnswers = payload.surveyAnswers;
    }

    this.session = this.sessionStore.updateSession(updates);
    this.notifyListeners();

    return this.currentScreen;
  }

  public subscribe(listener: NavigationListener): Unsubscribe {
    this.listeners.add(listener);
    // Emit immediate current state upon subscription
    listener(this.currentScreen, this.session);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(targetScreen: ScreenId = ScreenId.WELCOME): void {
    this.currentScreen = targetScreen;
    this.session = this.sessionStore.createInitialSession(targetScreen);
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentScreen, this.session);
      } catch (error) {
        console.error('[NavigationStateMachine] Error in listener execution', error);
      }
    }
  }
}
