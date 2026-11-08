import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT, CULTURAL_ASSETS } from "./constants";

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
    card.className = `${UI_CLASSES.NIERIKA_CARD} cv-welcome-card`;

    // Header branding with Culturas Vivas logo
    const headerRow = document.createElement("div");
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.gap = "8px";

    const logoIcon = document.createElement("img");
    logoIcon.src = CULTURAL_ASSETS.LOGO;
    logoIcon.alt = "Culturas Vivas";
    logoIcon.style.width = "26px";
    logoIcon.style.height = "26px";
    logoIcon.style.objectFit = "contain";

    const brandName = document.createElement("span");
    brandName.textContent = "CULTURAS VIVAS";
    brandName.style.fontSize = "12px";
    brandName.style.fontWeight = "700";
    brandName.style.letterSpacing = "0.08em";
    brandName.style.color = "var(--cv-color-text-bone)";

    headerRow.append(logoIcon, brandName);

    const title = document.createElement("h1");
    title.className = "cv-title";
    title.textContent = UI_TEXT.WELCOME_HERO;

    const description = document.createElement("p");
    description.className = "cv-description";
    description.textContent = UI_TEXT.WELCOME_SUBTITLE;

    const buttonStack = document.createElement("div");
    buttonStack.className = "cv-button-stack";

    // Mode Card 1: VR Mode
    const vrButton = document.createElement("button");
    vrButton.type = "button";
    vrButton.className = UI_CLASSES.MODE_CARD_VR;
    vrButton.setAttribute("data-action", "vr");

    const vrIconBox = document.createElement("div");
    vrIconBox.className = "cv-mode-card__icon-box";
    const vrIcon = document.createElement("img");
    vrIcon.src = CULTURAL_ASSETS.MODE_VR_ICON;
    vrIcon.alt = "Visor VR";
    vrIconBox.appendChild(vrIcon);

    const vrInfo = document.createElement("div");
    vrInfo.className = "cv-mode-card__info";

    const vrBadge = document.createElement("span");
    vrBadge.className = "cv-mode-card__badge";
    vrBadge.textContent = UI_TEXT.WELCOME_VR_BADGE;

    const vrTitle = document.createElement("span");
    vrTitle.className = "cv-mode-card__title";
    vrTitle.textContent = UI_TEXT.WELCOME_BTN_VR;

    const vrDesc = document.createElement("span");
    vrDesc.className = "cv-mode-card__desc";
    vrDesc.textContent = UI_TEXT.WELCOME_VR_DESC;

    vrInfo.append(vrBadge, vrTitle, vrDesc);
    vrButton.append(vrIconBox, vrInfo);

    vrButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.SELECT_VR);
    });

    // Mode Card 2: Touch / Giro Mode
    const touchButton = document.createElement("button");
    touchButton.type = "button";
    touchButton.className = UI_CLASSES.MODE_CARD_TOUCH;
    touchButton.setAttribute("data-action", "2d");

    const touchIconBox = document.createElement("div");
    touchIconBox.className = "cv-mode-card__icon-box";
    const touchIcon = document.createElement("img");
    touchIcon.src = CULTURAL_ASSETS.MODE_TOUCH_ICON;
    touchIcon.alt = "Modo Táctil";
    touchIconBox.appendChild(touchIcon);

    const touchInfo = document.createElement("div");
    touchInfo.className = "cv-mode-card__info";

    const touchTitle = document.createElement("span");
    touchTitle.className = "cv-mode-card__title";
    touchTitle.textContent = UI_TEXT.WELCOME_TOUCH_TITLE;

    const touchDesc = document.createElement("span");
    touchDesc.className = "cv-mode-card__desc";
    touchDesc.textContent = UI_TEXT.WELCOME_TOUCH_DESC;

    touchInfo.append(touchTitle, touchDesc);
    touchButton.append(touchIconBox, touchInfo);

    touchButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.SELECT_2D);
    });

    buttonStack.append(vrButton, touchButton);
    card.append(headerRow, title, description, buttonStack);
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
