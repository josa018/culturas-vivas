import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

export class SplashScreenView implements ScreenView {
  public readonly id = ScreenId.SPLASH;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const element = document.createElement("section");
    element.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--splash`;
    element.setAttribute("data-screen-id", this.id);

    const content = document.createElement("div");
    content.className = "cv-splash-content";

    const logo = document.createElement("div");
    logo.className = "cv-logo-placeholder";
    logo.textContent = "CV";

    const title = document.createElement("h1");
    title.className = "cv-title";
    title.textContent = UI_TEXT.SPLASH_TITLE;

    const subtitle = document.createElement("p");
    subtitle.className = "cv-subtitle";
    subtitle.textContent = UI_TEXT.SPLASH_SUBTITLE;

    const spinner = document.createElement("div");
    spinner.className = "cv-loader-spinner";
    spinner.setAttribute("role", "progressbar");
    spinner.setAttribute("aria-label", UI_TEXT.SPLASH_LOADING);

    const prompt = document.createElement("p");
    prompt.className = "cv-caption";
    prompt.textContent = UI_TEXT.SPLASH_TAP_PROMPT;

    content.append(logo, title, subtitle, spinner, prompt);
    element.appendChild(content);

    element.addEventListener("click", () => {
      this.dispatch(NavigationAction.FINISH_LOADING);
    });

    parent.appendChild(element);
    this.container = element;
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
  }

  public hide(): void {
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}
