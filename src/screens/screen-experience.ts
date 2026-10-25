import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

interface AFrameSceneElement extends HTMLElement {
  play?: () => void;
  pause?: () => void;
}

export class ExperienceScreenView implements ScreenView {
  public readonly id = ScreenId.EXPERIENCE_3D;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const hudOverlay = document.createElement("div");
    hudOverlay.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--experience`;
    hudOverlay.setAttribute("data-screen-id", this.id);

    const topBar = document.createElement("div");
    topBar.className = "cv-hud-topbar";

    const badge = document.createElement("span");
    badge.className = "cv-badge";
    badge.textContent = UI_TEXT.EXPERIENCE_SCENE_LABEL;

    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.className = `${UI_CLASSES.BUTTON_OUTLINE} cv-hud-exit-btn`;
    exitButton.setAttribute("data-action", "request-exit");

    const exitLabel = document.createElement("span");
    exitLabel.textContent = `✕ ${UI_TEXT.EXPERIENCE_EXIT_HUD}`;
    exitButton.appendChild(exitLabel);

    exitButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.REQUEST_EXIT);
    });

    topBar.append(badge, exitButton);
    hudOverlay.appendChild(topBar);

    parent.appendChild(hudOverlay);
    this.container = hudOverlay;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    if (this.container) {
      this.container.classList.add(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.remove(UI_CLASSES.SCREEN_HIDDEN);
    }
    this.toggleSceneLifecycle(true);
  }

  public hide(): void {
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
    this.toggleSceneLifecycle(false);
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  private toggleSceneLifecycle(active: boolean): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene) {
      return;
    }

    if (active) {
      scene.style.display = "block";
      scene.style.visibility = "visible";
      if (typeof scene.play === "function") {
        scene.play();
      }
    } else {
      scene.style.display = "none";
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    }
  }
}
