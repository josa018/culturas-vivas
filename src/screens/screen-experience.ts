import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";
import { ExhibitRoomBuilder } from "../experience/room-builder";
import {
  ScenePreloadManager,
  ROOM_ASSETS,
} from "../experience/preload-manager";

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

  // Estado Multi-Sala (Tarjeta 17)
  private currentRoom: "sala1" | "sala2" = "sala1";
  private isTransitioning: boolean = false;

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
    badge.id = "cv-current-room-badge";
    badge.textContent = `${UI_TEXT.EXPERIENCE_SCENE_LABEL} • Sala 1 (Wixárika)`;

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

    // Precarga diferida (lazy loading) de la Sala 2 en segundo plano
    ScenePreloadManager.lazyPreloadRoom(ROOM_ASSETS.SALA_2_NAAYERI).catch(
      (err) => {
        console.warn("[ExperienceScreenView] Fallo la precarga diferida de Sala 2:", err);
      },
    );
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
    this.setupMultiRoomPortal(scene);

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

  /**
   * Configura el componente de portal interactivo 3D con gaze trigger (Tarjeta 17)
   */
  private setupMultiRoomPortal(scene: HTMLElement): void {
    if (scene.querySelector("#cv-room-portal")) {
      return;
    }

    const portal = document.createElement("a-entity");
    portal.setAttribute("id", "cv-room-portal");
    portal.setAttribute("class", "clickable");
    portal.setAttribute("position", "0 1.6 3.2");
    portal.setAttribute("rotation", "0 180 0");

    // Marco exterior luminoso del portal
    const portalFrame = document.createElement("a-ring");
    portalFrame.setAttribute("radius-inner", "0.45");
    portalFrame.setAttribute("radius-outer", "0.55");
    portalFrame.setAttribute("color", "#38bdf8");
    portalFrame.setAttribute(
      "material",
      "shader: flat; opacity: 0.85; side: double; transparent: true",
    );
    portalFrame.setAttribute(
      "animation__spin",
      "property: rotation; to: 0 0 360; loop: true; dur: 12000; easing: linear",
    );

    // Disco central sensible a la mirada (Gaze Target)
    const portalCore = document.createElement("a-circle");
    portalCore.setAttribute("radius", "0.44");
    portalCore.setAttribute("color", "#0284c7");
    portalCore.setAttribute(
      "material",
      "shader: flat; opacity: 0.65; side: double; transparent: true",
    );

    // Etiqueta indicativa 3D sobre el portal
    const portalLabel = document.createElement("a-text");
    portalLabel.setAttribute("id", "cv-portal-text");
    portalLabel.setAttribute("value", "IR A SALA 2\n(NAAYERI)");
    portalLabel.setAttribute("align", "center");
    portalLabel.setAttribute("position", "0 0 0.05");
    portalLabel.setAttribute("scale", "0.6 0.6 0.6");
    portalLabel.setAttribute("color", "#ffffff");

    portal.append(portalFrame, portalCore, portalLabel);

    // Evento de activación por click o mirada fija (gaze trigger)
    const handlePortalActivation = async () => {
      if (this.isTransitioning) {
        return;
      }
      this.isTransitioning = true;

      const nextRoom = this.currentRoom === "sala1" ? "sala2" : "sala1";
      const targetTexture =
        nextRoom === "sala2"
          ? ROOM_ASSETS.SALA_2_NAAYERI
          : ROOM_ASSETS.SALA_1_WIXARIKA;

      // Ejecutar fundido a negro (500ms fade out + 500ms fade in)
      await ScenePreloadManager.transitionSky(scene, targetTexture, () => {
        this.currentRoom = nextRoom;

        // Actualizar textos informativos 3D y HUD
        if (nextRoom === "sala2") {
          portalLabel.setAttribute("value", "VOLVER A SALA 1\n(WIXARIKA)");
          const badge = document.querySelector("#cv-current-room-badge");
          if (badge) {
            badge.textContent = `${UI_TEXT.EXPERIENCE_SCENE_LABEL} • Sala 2 (Náayeri)`;
          }
        } else {
          portalLabel.setAttribute("value", "IR A SALA 2\n(NAAYERI)");
          const badge = document.querySelector("#cv-current-room-badge");
          if (badge) {
            badge.textContent = `${UI_TEXT.EXPERIENCE_SCENE_LABEL} • Sala 1 (Wixárika)`;
          }
        }
      });

      this.isTransitioning = false;
    };

    portal.addEventListener("click", handlePortalActivation);

    scene.appendChild(portal);
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
      this.setupMultiRoomPortal(scene);

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
    if (typeof document === "undefined" || this.exitVRHandler) {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene || typeof scene.addEventListener !== "function") {
      return;
    }
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

  private teardownSceneListeners(): void {
    if (this.exitVRHandler && typeof document !== "undefined") {
      const scene = document.querySelector<AFrameSceneElement>("a-scene");
      if (scene && typeof scene.removeEventListener === "function") {
        scene.removeEventListener("exit-vr", this.exitVRHandler);
      }
      this.exitVRHandler = null;
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