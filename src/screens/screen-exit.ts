import { ScreenId, NavigationAction } from "../navigation/index";
import { ViewMode } from "../navigation/types";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";

export class ExitModalScreenView implements ScreenView {
  public readonly id = ScreenId.EXIT_MODAL;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private viewMode: string = ViewMode.VR;
  private switchModeBtnEl: HTMLButtonElement | null = null;
  private switchModeLabelEl: HTMLSpanElement | null = null;

  constructor(
    dispatch: NavigationDispatcher,
    viewMode: string = ViewMode.VR,
  ) {
    this.dispatch = dispatch;
    this.viewMode = viewMode;
  }

  public setViewMode(viewMode: string): void {
    this.viewMode = viewMode;
    this.syncSwitchModeButton();
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
    card.className = `${UI_CLASSES.MODAL_CARD} ${UI_CLASSES.NIERIKA_DIALOG}`;

    const title = document.createElement("h2");
    title.className = "cv-title";
    title.textContent = UI_TEXT.EXIT_MODAL_TITLE;

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

    const switchModeBtn = document.createElement("button");
    switchModeBtn.type = "button";
    switchModeBtn.className = UI_CLASSES.BUTTON_SECONDARY;

    const switchModeLabel = document.createElement("span");
    switchModeBtn.appendChild(switchModeLabel);

    this.switchModeBtnEl = switchModeBtn;
    this.switchModeLabelEl = switchModeLabel;
    this.syncSwitchModeButton();

    switchModeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const action =
        this.viewMode === ViewMode.TOUCH_2D
          ? NavigationAction.SWITCH_TO_VR
          : NavigationAction.SWITCH_TO_TOUCH;
      this.dispatch(action);
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

    buttonStack.append(resumeBtn, switchModeBtn, exitBtn);
    card.append(title, buttonStack);
    backdrop.appendChild(card);

    parent.appendChild(backdrop);
    this.container = backdrop;
  }

  public unmount(): void {
    this.switchModeBtnEl = null;
    this.switchModeLabelEl = null;
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    this.syncSwitchModeButton();
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

  private syncSwitchModeButton(): void {
    if (!this.switchModeBtnEl || !this.switchModeLabelEl) {
      return;
    }
    const isTouch = this.viewMode === ViewMode.TOUCH_2D;
    this.switchModeBtnEl.setAttribute(
      "data-action",
      isTouch ? "switch-to-vr" : "switch-to-touch",
    );
    this.switchModeLabelEl.textContent = isTouch
      ? UI_TEXT.EXIT_MODAL_BTN_SWITCH_VR
      : UI_TEXT.EXIT_MODAL_BTN_SWITCH_TOUCH;
  }
}
