import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

export class TutorialScreenView implements ScreenView {
  public readonly id = ScreenId.TUTORIAL;
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
    element.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--tutorial`;
    element.setAttribute("data-screen-id", this.id);

    const card = document.createElement("div");
    card.className = "cv-tutorial-card";

    const title = document.createElement("h2");
    title.className = "cv-title";
    title.textContent = UI_TEXT.TUTORIAL_TITLE;

    const illustration = document.createElement("div");
    illustration.className = "cv-guide-illustration";
    illustration.setAttribute("aria-hidden", "true");

    const phone = document.createElement("div");
    phone.className = "cv-phone-silhouette";

    const notch = document.createElement("span");
    notch.className = "cv-center-notch";
    phone.appendChild(notch);
    illustration.appendChild(phone);

    const list = document.createElement("ol");
    list.className = "cv-instructions-list";

    const steps = [
      UI_TEXT.TUTORIAL_STEP_1,
      UI_TEXT.TUTORIAL_STEP_2,
      UI_TEXT.TUTORIAL_STEP_3,
    ];

    for (const stepText of steps) {
      const item = document.createElement("li");
      item.textContent = stepText;
      list.appendChild(item);
    }

    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = UI_CLASSES.BUTTON_PRIMARY;
    startButton.setAttribute("data-action", "confirm-insertion");

    const btnLabel = document.createElement("span");
    btnLabel.textContent = UI_TEXT.TUTORIAL_BTN_START;
    startButton.appendChild(btnLabel);

    startButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.CONFIRM_INSERTION);
    });

    card.append(title, illustration, list, startButton);
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
