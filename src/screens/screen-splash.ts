import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import {
  UI_CLASSES,
  UI_TEXT,
  CULTURAL_ASSETS,
  PARTNER_LOGOS,
  SPLASH_DEVELOPERS,
  SPLASH_TIMING,
} from "./constants";
import {
  ScenePreloadManager,
  getCriticalRoomAssets,
} from "../experience/preload-manager";

export class SplashScreenView implements ScreenView {
  public readonly id = ScreenId.SPLASH;
  private container: HTMLElement | null = null;
  private spinner: HTMLElement | null = null;
  private progressFill: HTMLElement | null = null;
  private statusText: HTMLElement | null = null;
  private enterBtn: HTMLElement | null = null;
  private isReady = false;
  private readonly dispatch: NavigationDispatcher;
  private readonly preloadManager: ScenePreloadManager;

  constructor(
    dispatch: NavigationDispatcher,
    preloadManager?: ScenePreloadManager,
  ) {
    this.dispatch = dispatch;
    this.preloadManager =
      preloadManager ??
      new ScenePreloadManager({
        onProgress: (progress) => {
          if (this.statusText && !this.isReady) {
            this.statusText.textContent = `${UI_TEXT.SPLASH_LOADING} (${progress.percentage}%)`;
          }
          if (this.progressFill) {
            this.progressFill.style.width = `${progress.percentage}%`;
          }
        },
      });
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const element = document.createElement("section");
    element.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--splash`;
    element.setAttribute("data-screen-id", this.id);

    const shell = document.createElement("div");
    shell.className = UI_CLASSES.SPLASH_SHELL;

    const hero = document.createElement("div");
    hero.className = UI_CLASSES.SPLASH_HERO;

    // Culturas Vivas 4-Cultures Logo Emblem Container
    const tsikuriBox = document.createElement("div");
    tsikuriBox.className = "cv-tsikuri-loader";
    const tsikuriImg = document.createElement("img");
    tsikuriImg.src = CULTURAL_ASSETS.LOGO;
    tsikuriImg.alt = UI_TEXT.SPLASH_TITLE;
    tsikuriImg.className = "cv-tsikuri-mandala-img";
    tsikuriBox.appendChild(tsikuriImg);

    const headerGroup = document.createElement("div");
    headerGroup.className = UI_CLASSES.SPLASH_HEADER_GROUP;

    const title = document.createElement("h1");
    title.className = "cv-title";
    title.textContent = UI_TEXT.SPLASH_TITLE;

    const subtitle = document.createElement("p");
    subtitle.className = "cv-subtitle cv-splash-tagline";
    subtitle.textContent = UI_TEXT.SPLASH_TAGLINE;

    headerGroup.append(title, subtitle);

    // Fixed-height action slot prevents layout shift between loading bar and Enter CTA
    const actionSlot = document.createElement("div");
    actionSlot.className = UI_CLASSES.SPLASH_ACTION_SLOT;

    const spinner = document.createElement("div");
    spinner.className = "cv-progress-container";
    spinner.setAttribute("role", "progressbar");
    spinner.setAttribute("aria-label", UI_TEXT.SPLASH_LOADING);

    const progressBar = document.createElement("div");
    progressBar.className = "cv-progress-bar";
    const progressFill = document.createElement("div");
    progressFill.className = "cv-progress-bar__fill";
    progressBar.appendChild(progressFill);
    spinner.appendChild(progressBar);

    const statusText = document.createElement("p");
    statusText.className = "cv-caption cv-splash-status";
    statusText.textContent = UI_TEXT.SPLASH_LOADING;

    const enterBtn = document.createElement("button");
    enterBtn.type = "button";
    enterBtn.className = `${UI_CLASSES.BUTTON_PRIMARY} cv-splash-enter-btn`;
    enterBtn.setAttribute("data-action", "enter");
    enterBtn.textContent = UI_TEXT.SPLASH_BTN_ENTER;
    enterBtn.style.display = "none";

    enterBtn.addEventListener("click", (evt: Event) => {
      evt.stopPropagation();
      this.dispatch(NavigationAction.FINISH_LOADING);
    });

    actionSlot.append(spinner, statusText, enterBtn);
    hero.append(tsikuriBox, headerGroup, actionSlot);

    const footer = this.buildFooter();
    shell.append(hero, footer);
    element.appendChild(shell);

    parent.appendChild(element);
    this.container = element;
    this.spinner = spinner;
    this.progressFill = progressFill;
    this.statusText = statusText;
    this.enterBtn = enterBtn;

    void this.startPreload();
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.spinner = null;
      this.progressFill = null;
      this.statusText = null;
      this.enterBtn = null;
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

  public setReady(): void {
    if (this.isReady) {
      return;
    }
    this.isReady = true;

    if (this.spinner) {
      this.spinner.style.display = "none";
    }
    if (this.statusText) {
      this.statusText.style.display = "none";
    }
    if (this.enterBtn) {
      this.enterBtn.style.display = "inline-block";
    }
  }

  public isReadyState(): boolean {
    return this.isReady;
  }

  private buildFooter(): HTMLElement {
    const footer = document.createElement("footer");
    footer.className = UI_CLASSES.SPLASH_FOOTER;

    const partnersRow = document.createElement("div");
    partnersRow.className = UI_CLASSES.SPLASH_PARTNERS;

    for (const partner of PARTNER_LOGOS) {
      const logo = document.createElement("img");
      logo.src = partner.src;
      logo.alt = partner.alt;
      logo.decoding = "async";
      logo.setAttribute("data-partner-id", partner.id);
      logo.setAttribute("data-partner-variant", partner.variant);
      logo.className =
        partner.variant === "emblem"
          ? `${UI_CLASSES.SPLASH_PARTNER_LOGO} ${UI_CLASSES.SPLASH_PARTNER_EMBLEM}`
          : UI_CLASSES.SPLASH_PARTNER_LOGO;
      partnersRow.appendChild(logo);
    }

    const credits = document.createElement("div");
    credits.className = UI_CLASSES.SPLASH_CREDITS;

    const creditsLabel = document.createElement("p");
    creditsLabel.className = UI_CLASSES.SPLASH_CREDITS_LABEL;
    creditsLabel.textContent = UI_TEXT.SPLASH_CREDITS_LABEL;

    const creditsList = document.createElement("ul");
    creditsList.className = UI_CLASSES.SPLASH_CREDITS_LIST;

    for (const developer of SPLASH_DEVELOPERS) {
      const item = document.createElement("li");
      item.className = UI_CLASSES.SPLASH_CREDITS_ITEM;
      item.textContent = developer;
      creditsList.appendChild(item);
    }

    credits.append(creditsLabel, creditsList);
    footer.append(partnersRow, credits);
    return footer;
  }

  private async startPreload(): Promise<void> {
    const sceneEl =
      typeof document !== "undefined"
        ? (document.querySelector("a-scene") as HTMLElement | null)
        : null;

    const roomAssets = getCriticalRoomAssets();
    await this.preloadManager.preloadAll(roomAssets);

    if (sceneEl) {
      await this.preloadManager.waitForSceneLoaded(
        sceneEl,
        SPLASH_TIMING.SCENE_LOADED_TIMEOUT_MS,
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, SPLASH_TIMING.POST_LOAD_REVEAL_DELAY_MS),
    );
    this.setReady();
  }
}
