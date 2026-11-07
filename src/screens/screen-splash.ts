import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";
import {
  ScenePreloadManager,
  PRELOAD_CONSTANTS,
  getCriticalRoomAssets,
} from "../experience/preload-manager";

export class SplashScreenView implements ScreenView {
  public readonly id = ScreenId.SPLASH;
  private container: HTMLElement | null = null;
  private spinner: HTMLElement | null = null;
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

    const statusText = document.createElement("p");
    statusText.className = "cv-caption cv-splash-status";
    statusText.textContent = UI_TEXT.SPLASH_LOADING;

    const enterBtn = document.createElement("button");
    enterBtn.className = `${UI_CLASSES.BUTTON_PRIMARY} cv-splash-enter-btn`;
    enterBtn.setAttribute("data-action", "enter");
    enterBtn.textContent = UI_TEXT.SPLASH_BTN_ENTER;
    enterBtn.style.display = "none";

    enterBtn.addEventListener("click", (evt: Event) => {
      evt.stopPropagation();
      this.dispatch(NavigationAction.FINISH_LOADING);
    });

    element.addEventListener("click", () => {
      if (this.isReady) {
        this.dispatch(NavigationAction.FINISH_LOADING);
      }
    });

    content.append(logo, title, subtitle, spinner, statusText, enterBtn);
    element.appendChild(content);

    parent.appendChild(element);
    this.container = element;
    this.spinner = spinner;
    this.statusText = statusText;
    this.enterBtn = enterBtn;

    void this.startPreload();
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
      this.spinner = null;
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
      this.statusText.textContent = UI_TEXT.SPLASH_READY;
    }
    if (this.enterBtn) {
      this.enterBtn.style.display = "inline-block";
    }
  }

  public isReadyState(): boolean {
    return this.isReady;
  }

  private async startPreload(): Promise<void> {
    const sceneEl =
      typeof document !== "undefined"
        ? (document.querySelector("a-scene") as HTMLElement | null)
        : null;

    await this.preloadManager.preloadAll(
      getCriticalRoomAssets(),
    );

    if (sceneEl) {
      await this.preloadManager.waitForSceneLoaded(sceneEl, 3000);
    }

    this.setReady();
  }
}
