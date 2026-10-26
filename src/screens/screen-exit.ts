import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

export class ExitModalScreenView implements ScreenView {
  public readonly id = ScreenId.EXIT_MODAL;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;

  constructor(dispatch: NavigationDispatcher) {
    this.dispatch = dispatch;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.className = `${UI_CLASSES.SCREEN_CONTAINER} ${UI_CLASSES.MODAL_BACKDROP}`;
    backdrop.setAttribute("data-screen-id", this.id);
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = UI_CLASSES.MODAL_CARD;

    const title = document.createElement("h2");
    title.className = "cv-title";
    title.textContent = UI_TEXT.EXIT_MODAL_TITLE;

    const description = document.createElement("p");
    description.className = "cv-description";
    description.textContent = UI_TEXT.EXIT_MODAL_DESCRIPTION;

    const buttonStack = document.createElement("div");
    buttonStack.className = "cv-button-stack";

    const resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.className = UI_CLASSES.BUTTON_PRIMARY;
    resumeBtn.setAttribute("data-action", "resume-tour");

    const resumeLabel = document.createElement("span");
    resumeLabel.textContent = UI_TEXT.EXIT_MODAL_BTN_RESUME;
    resumeBtn.appendChild(resumeLabel);

    resumeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.RESUME_TOUR);
    });

    const exitBtn = document.createElement("button");
    exitBtn.type = "button";
    exitBtn.className = UI_CLASSES.BUTTON_OUTLINE;
    exitBtn.setAttribute("data-action", "confirm-exit");

    const exitLabel = document.createElement("span");
    exitLabel.textContent = UI_TEXT.EXIT_MODAL_BTN_CONFIRM;
    exitBtn.appendChild(exitLabel);

    exitBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.CONFIRM_EXIT);
    });

    buttonStack.append(resumeBtn, exitBtn);
    card.append(title, description, buttonStack);
    backdrop.appendChild(card);

    parent.appendChild(backdrop);
    this.container = backdrop;
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
