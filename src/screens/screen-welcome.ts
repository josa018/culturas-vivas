import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

export class WelcomeScreenView implements ScreenView {
  public readonly id = ScreenId.WELCOME;
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
    element.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--welcome`;
    element.setAttribute("data-screen-id", this.id);

    const card = document.createElement("div");
    card.className = "cv-welcome-card";

    const title = document.createElement("h1");
    title.className = "cv-title";
    title.textContent = UI_TEXT.WELCOME_TITLE;

    const description = document.createElement("p");
    description.className = "cv-description";
    description.textContent = UI_TEXT.WELCOME_DESCRIPTION;

    const buttonStack = document.createElement("div");
    buttonStack.className = "cv-button-stack";

    const vrButton = document.createElement("button");
    vrButton.type = "button";
    vrButton.className = UI_CLASSES.BUTTON_PRIMARY;
    vrButton.setAttribute("data-action", "vr");

    const vrIcon = document.createElement("span");
    vrIcon.className = "cv-btn-icon";
    vrIcon.textContent = "🥽";

    const vrLabel = document.createElement("span");
    vrLabel.textContent = UI_TEXT.WELCOME_BTN_VR;

    vrButton.append(vrIcon, vrLabel);
    vrButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.SELECT_VR);
    });

    const touchButton = document.createElement("button");
    touchButton.type = "button";
    touchButton.className = UI_CLASSES.BUTTON_SECONDARY;
    touchButton.setAttribute("data-action", "2d");

    const touchIcon = document.createElement("span");
    touchIcon.className = "cv-btn-icon";
    touchIcon.textContent = "📱";

    const touchLabel = document.createElement("span");
    touchLabel.textContent = UI_TEXT.WELCOME_BTN_2D;

    touchButton.append(touchIcon, touchLabel);
    touchButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.SELECT_2D);
    });

    buttonStack.append(vrButton, touchButton);
    card.append(title, description, buttonStack);
    element.appendChild(card);

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
