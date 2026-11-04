import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
} from "./navigation/index";
import type { DispatchPayload } from "./navigation/index";

import type { ScreenView } from "./screens/base-screen";
import { SplashScreenView } from "./screens/screen-splash";
import { WelcomeScreenView } from "./screens/screen-welcome";
import { CultureSelectScreenView } from "./screens/screen-culture-select";
import { Museum2DScreenView } from "./screens/screen-museum-2d";
import { TutorialScreenView } from "./screens/screen-tutorial";
import { ExperienceScreenView } from "./screens/screen-experience";
import { ExitModalScreenView } from "./screens/screen-exit";
import { SurveyScreenView } from "./screens/screen-survey";

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

    // 8 Pantallas registradas
    const views: ScreenView[] = [
      new SplashScreenView(dispatch),
      new WelcomeScreenView(dispatch),
      new CultureSelectScreenView(dispatch),
      new Museum2DScreenView(dispatch),
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
    this.unsubscribe = this.stateMachine.subscribe(
      (activeScreenId, session) => {
        // Sincronizar modo de visualización en la escena 3D
        if (session.viewMode) {
          const experienceScreen = this.screens.get(ScreenId.EXPERIENCE_3D) as
            | ExperienceScreenView
            | undefined;
          if (
            experienceScreen &&
            typeof experienceScreen.setViewMode === "function"
          ) {
            experienceScreen.setViewMode(session.viewMode);
          }
        }

        // Sincronizar cultura elegida en la sala Museo 2D
        if (session.selectedCulture) {
          const museum2DScreen = this.screens.get(ScreenId.MUSEUM_2D) as
            | Museum2DScreenView
            | undefined;
          if (
            museum2DScreen &&
            typeof museum2DScreen.setCulture === "function"
          ) {
            museum2DScreen.setCulture(session.selectedCulture);
          }
        }

        this.updateScreenVisibility(activeScreenId);
      },
    );
  }

  private updateScreenVisibility(activeScreenId: ScreenId): void {
    for (const [id, screen] of this.screens.entries()) {
      if (id === activeScreenId) {
        screen.show();
      } else if (
        id === ScreenId.EXPERIENCE_3D &&
        activeScreenId === ScreenId.EXIT_MODAL
      ) {
        const experienceScreen = screen as ExperienceScreenView;
        if (typeof experienceScreen.retainBackground === "function") {
          experienceScreen.retainBackground();
        } else {
          experienceScreen.show();
        }
      } else {
        screen.hide();
      }
    }
  }
}