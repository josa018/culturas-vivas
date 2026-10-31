import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
} from "./navigation/index";
import type { DispatchPayload } from "./navigation/index";
import {
  ExperienceScreenView,
  ExitModalScreenView,
  SplashScreenView,
  SurveyScreenView,
  TutorialScreenView,
  WelcomeScreenView,
} from "./screens/index";
import type { ScreenView } from "./screens/index";

export class AppRouter {
  private readonly rootContainer: HTMLElement;
  private readonly stateMachine: NavigationStateMachine;
  private readonly screens = new Map<ScreenId, ScreenView>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    rootContainer: HTMLElement,
    stateMachine: NavigationStateMachine = new NavigationStateMachine(),
  ) {
    this.rootContainer = rootContainer;
    this.stateMachine = stateMachine;
    this.initializeScreens();
    this.mountScreens();
    this.subscribeToTransitions();
  }

  public getStateMachine(): NavigationStateMachine {
    return this.stateMachine;
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    for (const screen of this.screens.values()) {
      screen.unmount();
    }
    this.screens.clear();
  }

  private initializeScreens(): void {
    const dispatch = (action: NavigationAction, payload?: DispatchPayload) => {
      this.stateMachine.dispatch(action, payload);
    };

    const views: ScreenView[] = [
      new SplashScreenView(dispatch),
      new WelcomeScreenView(dispatch),
      new TutorialScreenView(dispatch),
      new ExperienceScreenView(dispatch),
      new ExitModalScreenView(dispatch),
      new SurveyScreenView(dispatch),
    ];

    for (const view of views) {
      this.screens.set(view.id, view);
    }
  }

  private mountScreens(): void {
    for (const view of this.screens.values()) {
      view.mount(this.rootContainer);
      view.hide();
    }
  }

  private subscribeToTransitions(): void {
    this.unsubscribe = this.stateMachine.subscribe((activeScreenId) => {
      this.updateScreenVisibility(activeScreenId);
    });
  }

  private updateScreenVisibility(activeScreenId: ScreenId): void {
    for (const [id, screen] of this.screens.entries()) {
      if (id === activeScreenId) {
        screen.show();
      } else if (
        id === ScreenId.EXPERIENCE_3D &&
        activeScreenId === ScreenId.EXIT_MODAL
      ) {
        // Retain 3D scene in the background under the exit modal
        screen.show();
      } else {
        screen.hide();
      }
    }
  }
}
