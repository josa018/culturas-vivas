import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";
import { ExhibitRoomBuilder } from "../experience/room-builder";

interface AFrameSceneElement extends HTMLElement {
  play?: () => void;
  pause?: () => void;
  resize?: () => void;
  enterVR?: () => Promise<void> | void;
  exitVR?: () => Promise<void> | void;
  is?: (state: string) => boolean;
}

export class ExperienceScreenView implements ScreenView {
  public readonly id = ScreenId.EXPERIENCE_3D;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private viewMode: string = "vr";

  constructor(dispatch: NavigationDispatcher, viewMode: string = "vr") {
    this.dispatch = dispatch;
    this.viewMode = viewMode;
  }

  public setViewMode(viewMode: string): void {
    this.viewMode = viewMode;
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
      if (scene.classList && typeof scene.classList.add === "function") {
        scene.classList.add(UI_CLASSES.SCENE_ACTIVE);
      }
      ExhibitRoomBuilder.ensureRoom(scene, this.viewMode);
      if (typeof scene.play === "function") {
        scene.play();
      }
      if (this.viewMode === "vr") {
        if (typeof scene.enterVR === "function") {
          try {
            const result = scene.enterVR();
            if (
              result &&
              typeof (result as Promise<void>).catch === "function"
            ) {
              (result as Promise<void>).catch((err: unknown) => {
                console.warn("[ExperienceScreenView] enterVR rejected:", err);
              });
            }
          } catch (err: unknown) {
            console.warn("[ExperienceScreenView] enterVR error:", err);
          }
        }
      } else {
        if (
          typeof scene.exitVR === "function" &&
          (typeof scene.is !== "function" || scene.is("vr-mode"))
        ) {
          try {
            const result = scene.exitVR();
            if (
              result &&
              typeof (result as Promise<void>).catch === "function"
            ) {
              (result as Promise<void>).catch(() => {});
            }
          } catch {
            // Ignore exitVR errors
          }
        }
      }
      if (this.viewMode === "2d") {
        this.synchronizeViewport(scene);
      }
    } else {
      if (
        typeof scene.exitVR === "function" &&
        (typeof scene.is !== "function" || scene.is("vr-mode"))
      ) {
        try {
          const result = scene.exitVR();
          if (result && typeof (result as Promise<void>).catch === "function") {
            (result as Promise<void>).catch(() => {});
          }
        } catch {
          // Ignore exitVR errors
        }
      }
      scene.style.display = "none";
      if (scene.classList && typeof scene.classList.remove === "function") {
        scene.classList.remove(UI_CLASSES.SCENE_ACTIVE);
      }
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    }
  }

  private synchronizeViewport(scene: AFrameSceneElement): void {
    const triggerResize = () => {
      if (typeof scene.resize === "function") {
        scene.resize();
      }
      if (
        typeof window !== "undefined" &&
        typeof window.dispatchEvent === "function"
      ) {
        try {
          window.dispatchEvent(new Event("resize"));
        } catch {
          // Gracefully ignore in non-browser testing contexts
        }
      }
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(triggerResize);
    } else {
      triggerResize();
    }
  }
}
