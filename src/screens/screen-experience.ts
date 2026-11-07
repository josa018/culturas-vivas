import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";
import { ExhibitRoomBuilder } from "../experience/room-builder";
import { RoomTransitionStateMachine } from "../experience/room-transition-state-machine";
import { RoomId } from "../experience/types";
import {
  ensureCameraCurtain,
  type CameraCurtainComponentInstance,
} from "../experience/components/camera-curtain";
import {
  PORTAL_ACTIVATED_EVENT,
  type PortalActivatedEventDetail,
} from "../experience/components/portal-waypoint";
import { getSharedInspectionController } from "../experience/components/inspectable";

interface AFrameSceneElement extends HTMLElement {
  play?: () => void;
  pause?: () => void;
  resize?: () => void;
  enterVR?: () => Promise<void> | void;
  exitVR?: () => Promise<void> | void;
  is?: (state: string) => boolean;
  removeState?: (state: string) => void;
  renderer?: {
    xr?: {
      enabled?: boolean;
    };
  };
  camera?: {
    el?: HTMLElement;
    matrixAutoUpdate?: boolean;
    updateMatrixWorld?: (force?: boolean) => void;
    updateProjectionMatrix?: () => void;
  };
}

export class ExperienceScreenView implements ScreenView {
  public readonly id = ScreenId.EXPERIENCE_3D;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private viewMode: string = "vr";
  private isProgrammaticExit: boolean = false;
  private exitVRHandler: (() => void) | null = null;
  private portalHandler: ((evt: Event) => void) | null = null;
  private readonly transitionStateMachine: RoomTransitionStateMachine;

  constructor(
    dispatch: NavigationDispatcher,
    viewMode: string = "vr",
    transitionStateMachine?: RoomTransitionStateMachine,
  ) {
    this.dispatch = dispatch;
    this.viewMode = viewMode;
    this.transitionStateMachine =
      transitionStateMachine ?? new RoomTransitionStateMachine();
  }

  public getTransitionStateMachine(): RoomTransitionStateMachine {
    return this.transitionStateMachine;
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
    this.setupSceneListeners();
  }

  public unmount(): void {
    this.teardownSceneListeners();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    this.isProgrammaticExit = false;
    if (this.container) {
      this.container.classList.add(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.remove(UI_CLASSES.SCREEN_HIDDEN);
    }
    this.setupSceneListeners();
    this.toggleSceneLifecycle(true);
  }

  public retainBackground(): void {
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene) {
      return;
    }

    scene.style.display = "block";
    if (scene.classList && typeof scene.classList.add === "function") {
      scene.classList.add(UI_CLASSES.SCENE_ACTIVE);
    }
    ExhibitRoomBuilder.ensureRoom(scene, this.viewMode);
    this.safeProgrammaticExitVR(scene, () => {
      this.sanitize2DViewport(scene);
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    });
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

  public transitionToRoom(targetRoomId: RoomId): boolean {
    if (typeof document === "undefined") {
      return false;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene) {
      return false;
    }

    const started = this.transitionStateMachine.triggerTransition(targetRoomId);
    if (!started) {
      return false;
    }

    // 1. Abort any active exhibit inspection
    getSharedInspectionController().abortActiveInspection();

    // 2. Lock cursor raycaster during transition to prevent interaction glitches
    const cursor = scene.querySelector("a-cursor");
    if (cursor) {
      cursor.setAttribute("raycaster", "objects: none");
    }

    // 3. Ensure camera curtain exists on active camera
    const cameraEl =
      scene.querySelector("a-camera") || scene.querySelector("[camera]");
    const curtainEl = cameraEl ? ensureCameraCurtain(cameraEl) : null;
    const aframeCurtain = curtainEl as unknown as {
      components?: Record<string, CameraCurtainComponentInstance>;
    };
    const curtain = aframeCurtain?.components?.["cv-camera-curtain"];

    if (curtain && typeof curtain.fadeOut === "function") {
      curtain.fadeOut(() => {
        this.transitionStateMachine.notifyFadeOutComplete();

        // 4. Mount target room and update skybox
        ExhibitRoomBuilder.mountRoom(scene, targetRoomId, this.viewMode);
        this.transitionStateMachine.notifyRoomReady();

        // 5. Fade curtain back in to reveal target room
        curtain.fadeIn(() => {
          this.transitionStateMachine.notifyFadeInComplete();
          if (cursor) {
            cursor.setAttribute("raycaster", "objects: .clickable");
          }
        });
      });
    } else {
      // Direct synchronous execution fallback (headless or no animation support)
      this.transitionStateMachine.notifyFadeOutComplete();
      ExhibitRoomBuilder.mountRoom(scene, targetRoomId, this.viewMode);
      this.transitionStateMachine.notifyRoomReady();
      this.transitionStateMachine.notifyFadeInComplete();
      if (cursor) {
        cursor.setAttribute("raycaster", "objects: .clickable");
      }
    }

    return true;
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

      // Attach curtain to camera on scene activation
      const cameraEl =
        scene.querySelector("a-camera") || scene.querySelector("[camera]");
      if (cameraEl) {
        ensureCameraCurtain(cameraEl);
      }

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
        this.safeProgrammaticExitVR(scene, () => {
          this.sanitize2DViewport(scene);
        });
      }
      if (this.viewMode === "2d") {
        this.synchronizeViewport(scene);
      }
    } else {
      this.safeProgrammaticExitVR(scene);
      scene.style.display = "none";
      if (scene.classList && typeof scene.classList.remove === "function") {
        scene.classList.remove(UI_CLASSES.SCENE_ACTIVE);
      }
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    }
  }

  private safeProgrammaticExitVR(
    scene: AFrameSceneElement,
    onComplete?: () => void,
  ): void {
    if (
      typeof scene.exitVR !== "function" ||
      (typeof scene.is === "function" && !scene.is("vr-mode"))
    ) {
      if (onComplete) {
        onComplete();
      }
      return;
    }
    this.isProgrammaticExit = true;
    try {
      const result = scene.exitVR();
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>)
          .catch((err: unknown) => {
            console.warn("[ExperienceScreenView] exitVR rejected:", err);
          })
          .finally(() => {
            this.isProgrammaticExit = false;
            if (onComplete) {
              onComplete();
            }
          });
      } else {
        this.isProgrammaticExit = false;
        if (onComplete) {
          onComplete();
        }
      }
    } catch {
      this.isProgrammaticExit = false;
      if (onComplete) {
        onComplete();
      }
    }
  }

  private setupSceneListeners(): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene || typeof scene.addEventListener !== "function") {
      return;
    }

    if (!this.exitVRHandler) {
      this.exitVRHandler = () => {
        if (this.isProgrammaticExit) {
          return;
        }
        if (this.viewMode === "vr") {
          this.dispatch(NavigationAction.REQUEST_EXIT);
        }
      };
      scene.addEventListener("exit-vr", this.exitVRHandler);
    }

    if (!this.portalHandler) {
      this.portalHandler = (evt: Event) => {
        const detail = (
          evt as CustomEvent<PortalActivatedEventDetail>
        ).detail;
        if (detail?.targetRoomId) {
          this.transitionToRoom(detail.targetRoomId);
        }
      };
      scene.addEventListener(PORTAL_ACTIVATED_EVENT, this.portalHandler);
    }
  }

  private teardownSceneListeners(): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene || typeof scene.removeEventListener !== "function") {
      return;
    }

    if (this.exitVRHandler) {
      scene.removeEventListener("exit-vr", this.exitVRHandler);
      this.exitVRHandler = null;
    }

    if (this.portalHandler) {
      scene.removeEventListener(PORTAL_ACTIVATED_EVENT, this.portalHandler);
      this.portalHandler = null;
    }
  }

  private sanitize2DViewport(scene: AFrameSceneElement): void {
    if (typeof scene.removeState === "function") {
      if (typeof scene.is === "function" && scene.is("vr-mode")) {
        scene.removeState("vr-mode");
      }
      if (typeof scene.is === "function" && scene.is("ar-mode")) {
        scene.removeState("ar-mode");
      }
    }

    if (scene.renderer?.xr) {
      scene.renderer.xr.enabled = false;
    }

    const cameraEl =
      scene.querySelector("a-camera") || scene.querySelector("[camera]");
    if (cameraEl) {
      const obj3D = (
        cameraEl as unknown as {
          object3D?: {
            matrixAutoUpdate?: boolean;
            updateMatrix?: () => void;
          };
        }
      ).object3D;
      if (obj3D) {
        obj3D.matrixAutoUpdate = true;
        if (typeof obj3D.updateMatrix === "function") {
          obj3D.updateMatrix();
        }
      }

      const aframeEl = cameraEl as unknown as {
        components?: Record<
          string,
          {
            touchStarted?: boolean;
            mouseDown?: boolean;
            data?: { touchEnabled?: boolean; enabled?: boolean };
            addEventListeners?: () => void;
          }
        >;
      };
      const lookControls = aframeEl.components?.["look-controls"];
      if (lookControls) {
        lookControls.touchStarted = false;
        lookControls.mouseDown = false;
        if (lookControls.data) {
          lookControls.data.touchEnabled = true;
          lookControls.data.enabled = true;
        }
        if (typeof lookControls.addEventListeners === "function") {
          lookControls.addEventListeners();
        }
      }
    }

    if (scene.camera) {
      scene.camera.matrixAutoUpdate = true;
      if (typeof scene.camera.updateProjectionMatrix === "function") {
        scene.camera.updateProjectionMatrix();
      }
    }
  }

  private synchronizeViewport(scene: AFrameSceneElement): void {
    this.sanitize2DViewport(scene);
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
