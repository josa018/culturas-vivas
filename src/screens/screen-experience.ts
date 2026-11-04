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
    setSize?: (width: number, height: number) => void;
  };
  camera?: {
    el?: HTMLElement;
    matrixAutoUpdate?: boolean;
    updateMatrixWorld?: (force?: boolean) => void;
    updateProjectionMatrix?: () => void;
  };
}

interface ExhibitHotspotData {
  id: string;
  category: string;
  title: string;
  description: string;
  whyText: string;
  position: string;
  color: string;
}

const EXHIBIT_HOTSPOTS: ExhibitHotspotData[] = [
  {
    id: "vestimenta",
    category: "Vestimenta Sagrada",
    title: "Kutuni y Xikuri",
    description: "Traje tradicional de manta blanca bordado en punto de cruz.",
    whyText: "¿Por qué visten así? Los bordados de venados y peyote son rezos visuales que comunican y protegen ante las deidades de la naturaleza.",
    position: "-2.6 1.4 -3.2",
    color: "#e11d48",
  },
  {
    id: "alimentacion",
    category: "Alimentación Ancestral",
    title: "Maíz Sagrado de la Sierra",
    description: "Gorditas de maíz de cinco colores, atole blanco y quelites.",
    whyText: "¿Por qué comen así? El maíz es considerado su hermano espiritual; nutre la vida cotidiana y renueva el lazo sagrado comunitario.",
    position: "2.6 1.3 -3.0",
    color: "#059669",
  },
  {
    id: "tradiciones",
    category: "Tradición y Ceremonia",
    title: "Peregrinación a Wirikuta",
    description: "Cantos del Marakame, sonajas y ofrendas en el patio ceremonial.",
    whyText: "¿Por qué lo celebran? Para agradecer las lluvias, regenerar las fuerzas del cosmos y mantener vivos los acuerdos con sus antepasados.",
    position: "0 1.2 -3.8",
    color: "#d97706",
  },
];

export class ExperienceScreenView implements ScreenView {
  public readonly id = ScreenId.EXPERIENCE_3D;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private viewMode: string = "vr";
  private isProgrammaticExit: boolean = false;
  private exitVRHandler: (() => void) | null = null;

  // Estado Multi-Sala
  private currentRoom: "sala1" | "sala2" = "sala1";
  private isTransitioning: boolean = false;

  constructor(dispatch: NavigationDispatcher, viewMode: string = "vr") {
    this.dispatch = dispatch;
    this.viewMode = viewMode;
  }

  public setViewMode(viewMode: string): void {
    this.viewMode = viewMode;
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (scene) {
      this.configureGazerForMode(scene);
    }
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
    badge.textContent = `${UI_TEXT.EXPERIENCE_SCENE_LABEL}Sala 1 (Wixárika)`;

    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.className = `${UI_CLASSES.BUTTON_OUTLINE} cv-hud-exit-btn`;
    exitButton.setAttribute("data-action", "request-exit");

    const exitLabel = document.createElement("span");
    exitLabel.textContent = `✕ ${UI_TEXT.EXPERIENCE_EXIT_HUD}`;
    exitButton.appendChild(exitLabel);

    exitButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.dispatch(NavigationAction.REQUEST_EXIT);
    });

    topBar.append(badge, exitButton);
    hudOverlay.appendChild(topBar);

    parent.appendChild(hudOverlay);
    this.container = hudOverlay;
    this.setupSceneListeners();

    // Precarga diferida de Sala 2
    ScenePreloadManager.lazyPreloadRoom(ROOM_ASSETS.SALA_2_NAAYERI).catch(
      (err) => {
        console.warn("[ExperienceScreenView] Falló la precarga de Sala 2:", err);
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
      this.container.style.removeProperty("display");
      this.container.style.display = "flex";
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
    this.setupInteractiveExhibits(scene);

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
      this.container.style.display = "none";
    }
    this.toggleSceneLifecycle(false);
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  /**
   * Configura el Gazer (cursor de mirada) según el modo:
   * - En VR: fuse automático para visores cardboard (apuntas y se acciona).
   * - En Táctil (2D): touch/clic habilitado para explorar con dedos o mouse.
   */
  private configureGazerForMode(scene: AFrameSceneElement): void {
    const cursor = scene.querySelector("[cursor]");
    if (!cursor) return;

    if (this.viewMode === "vr") {
      cursor.setAttribute("cursor", "fuse: true; fuseTimeout: 1200");
      cursor.setAttribute("visible", "true");
    } else {
      // En táctil permitimos tocar directamente en pantalla o mirar
      cursor.setAttribute("cursor", "fuse: false; rayOrigin: mouse");
    }
  }

  /**
   * Genera los puntos de interés 3D (Vestuario, Comida, Tradición)
   * y el Lienzo 2D flotante interactivo.
   */
  private setupInteractiveExhibits(scene: HTMLElement): void {
    if (scene.querySelector("#cv-exhibits-group")) {
      return;
    }

    const exhibitsGroup = document.createElement("a-entity");
    exhibitsGroup.setAttribute("id", "cv-exhibits-group");

    // 1. Lienzo 2D flotante en el espacio 3D
    const infoPanel = document.createElement("a-entity");
    infoPanel.setAttribute("id", "cv-floating-canvas-2d");
    infoPanel.setAttribute("position", "0 1.6 -2.4");
    infoPanel.setAttribute("visible", "false");

    // Fondo del lienzo
    const panelBg = document.createElement("a-plane");
    panelBg.setAttribute("width", "2.1");
    panelBg.setAttribute("height", "1.4");
    panelBg.setAttribute(
      "material",
      "color: #0b0f17; opacity: 0.94; shader: flat; transparent: true",
    );

    // Marco exterior con greca/color
    const panelBorder = document.createElement("a-ring");
    panelBorder.setAttribute("radius-inner", "1.05");
    panelBorder.setAttribute("radius-outer", "1.08");
    panelBorder.setAttribute("material", "color: #f59e0b; shader: flat");

    // Encabezado Categoría
    const catLabel = document.createElement("a-text");
    catLabel.setAttribute("id", "cv-canvas-category");
    catLabel.setAttribute("value", "VESTIMENTA SAGRADA");
    catLabel.setAttribute("color", "#f59e0b");
    catLabel.setAttribute("align", "center");
    catLabel.setAttribute("position", "0 0.5 0.02");
    catLabel.setAttribute("scale", "0.55 0.55 0.55");

    // Título del elemento
    const titleLabel = document.createElement("a-text");
    titleLabel.setAttribute("id", "cv-canvas-title");
    titleLabel.setAttribute("value", "Kutuni y Xikuri");
    titleLabel.setAttribute("color", "#ffffff");
    titleLabel.setAttribute("align", "center");
    titleLabel.setAttribute("position", "0 0.3 0.02");
    titleLabel.setAttribute("scale", "0.75 0.75 0.75");

    // Breve descripción
    const descLabel = document.createElement("a-text");
    descLabel.setAttribute("id", "cv-canvas-desc");
    descLabel.setAttribute(
      "value",
      "Traje tradicional de manta blanca bordado en punto de cruz.",
    );
    descLabel.setAttribute("color", "#cbd5e1");
    descLabel.setAttribute("align", "center");
    descLabel.setAttribute("position", "0 0.05 0.02");
    descLabel.setAttribute("width", "1.9");
    descLabel.setAttribute("wrap-count", "32");
    descLabel.setAttribute("scale", "0.5 0.5 0.5");

    // Explicación de "Por qué visten/comen así"
    const whyBox = document.createElement("a-plane");
    whyBox.setAttribute("width", "1.85");
    whyBox.setAttribute("height", "0.4");
    whyBox.setAttribute("position", "0 -0.32 0.01");
    whyBox.setAttribute(
      "material",
      "color: #1e293b; opacity: 0.9; shader: flat",
    );

    const whyLabel = document.createElement("a-text");
    whyLabel.setAttribute("id", "cv-canvas-why");
    whyLabel.setAttribute(
      "value",
      "¿Por qué visten así? Los bordados no son adorno; son rezos y visiones protectoras que comunican con las deidades.",
    );
    whyLabel.setAttribute("color", "#fde047");
    whyLabel.setAttribute("align", "center");
    whyLabel.setAttribute("position", "0 0 0.02");
    whyLabel.setAttribute("width", "1.75");
    whyLabel.setAttribute("wrap-count", "34");
    whyLabel.setAttribute("scale", "0.42 0.42 0.42");

    whyBox.appendChild(whyLabel);

    // Botón de cierre en el lienzo
    const closeBtn = document.createElement("a-circle");
    closeBtn.setAttribute("id", "cv-canvas-close-btn");
    closeBtn.setAttribute("class", "clickable");
    closeBtn.setAttribute("radius", "0.1");
    closeBtn.setAttribute("position", "0.9 0.55 0.02");
    closeBtn.setAttribute("material", "color: #e11d48; shader: flat");

    const closeText = document.createElement("a-text");
    closeText.setAttribute("value", "✕");
    closeText.setAttribute("align", "center");
    closeText.setAttribute("position", "0 0 0.01");
    closeText.setAttribute("scale", "0.6 0.6 0.6");
    closeText.setAttribute("color", "#ffffff");
    closeBtn.appendChild(closeText);

    closeBtn.addEventListener("click", () => {
      infoPanel.setAttribute("visible", "false");
    });

    infoPanel.append(panelBg, panelBorder, catLabel, titleLabel, descLabel, whyBox, closeBtn);
    exhibitsGroup.appendChild(infoPanel);

    // 2. Crear los Stands/Hotspots en la sala para Vestimenta, Comida y Tradición
    EXHIBIT_HOTSPOTS.forEach((data) => {
      const stand = document.createElement("a-entity");
      stand.setAttribute("id", `hotspot-${data.id}`);
      stand.setAttribute("class", "clickable");
      stand.setAttribute("position", data.position);

      // Pedestal / Base
      const base = document.createElement("a-cylinder");
      base.setAttribute("radius", "0.42");
      base.setAttribute("height", "0.18");
      base.setAttribute("position", "0 0 0");
      base.setAttribute("material", `color: ${data.color}; opacity: 0.85; shader: flat`);

      // Anillo decorativo giratorio sobre el stand
      const ring = document.createElement("a-ring");
      ring.setAttribute("radius-inner", "0.48");
      ring.setAttribute("radius-outer", "0.54");
      ring.setAttribute("position", "0 0.15 0");
      ring.setAttribute("rotation", "-90 0 0");
      ring.setAttribute("material", "color: #f59e0b; shader: flat");
      ring.setAttribute(
        "animation__spin",
        "property: rotation; to: -90 0 360; loop: true; dur: 8000; easing: linear",
      );

      // Icono / Rótulo flotante
      const label = document.createElement("a-text");
      label.setAttribute("value", `${data.category}\n[MIRA AQUÍ]`);
      label.setAttribute("align", "center");
      label.setAttribute("position", "0 0.7 0");
      label.setAttribute("scale", "0.55 0.55 0.55");
      label.setAttribute("color", "#ffffff");

      stand.append(base, ring, label);

      // Al apuntar con el Gazer o hacer clic con el dedo/mouse:
      const showExhibitInfo = () => {
        catLabel.setAttribute("value", data.category.toUpperCase());
        titleLabel.setAttribute("value", data.title);
        descLabel.setAttribute("value", data.description);
        whyLabel.setAttribute("value", data.whyText);

        // Posicionar el panel frente a donde está el hotspot
        const coords = data.position.split(" ");
        infoPanel.setAttribute(
          "position",
          `${parseFloat(coords[0]) * 0.7} 1.6 ${parseFloat(coords[2]) * 0.7}`,
        );
        infoPanel.setAttribute("visible", "true");
      };

      stand.addEventListener("click", showExhibitInfo);
      exhibitsGroup.appendChild(stand);
    });

    scene.appendChild(exhibitsGroup);
  }
private setupMultiRoomPortal(scene: HTMLElement): void {
    if (scene.querySelector("#cv-room-portal")) {
      return;
    }

    const portal = document.createElement("a-entity");
    portal.setAttribute("id", "cv-room-portal");
    portal.setAttribute("position", "0 1.6 3.2");
    portal.setAttribute("rotation", "0 180 0");

    // 1. Marco exterior animado
    const portalFrame = document.createElement("a-ring");
    portalFrame.setAttribute("class", "clickable");
    portalFrame.setAttribute("radius-inner", "0.45");
    portalFrame.setAttribute("radius-outer", "0.58");
    portalFrame.setAttribute("color", "#38bdf8");
    portalFrame.setAttribute(
      "material",
      "shader: flat; opacity: 0.9; side: double; transparent: true",
    );
    portalFrame.setAttribute(
      "animation__spin",
      "property: rotation; to: 0 0 360; loop: true; dur: 10000; easing: linear",
    );

    // 2. Núcleo central interactivo (este recibe el clic/gazer)
    const portalCore = document.createElement("a-circle");
    portalCore.setAttribute("class", "clickable");
    portalCore.setAttribute("radius", "0.46");
    portalCore.setAttribute("color", "#0284c7");
    portalCore.setAttribute(
      "material",
      "shader: flat; opacity: 0.85; side: double; transparent: true",
    );

    // 3. Texto del portal visible por ambos lados
    const portalLabel = document.createElement("a-text");
    portalLabel.setAttribute("id", "cv-portal-text");
    portalLabel.setAttribute("value", "IR A SALA 2\n(NAAYERI)");
    portalLabel.setAttribute("align", "center");
    portalLabel.setAttribute("position", "0 0 0.05");
    portalLabel.setAttribute("scale", "0.6 0.6 0.6");
    portalLabel.setAttribute("color", "#ffffff");
    portalLabel.setAttribute("side", "double");

    portal.append(portalFrame, portalCore, portalLabel);

    const handlePortalActivation = async (evt?: Event) => {
      if (evt) {
        evt.stopPropagation();
      }
      if (this.isTransitioning) {
        return;
      }
      this.isTransitioning = true;

      const nextRoom = this.currentRoom === "sala1" ? "sala2" : "sala1";
      const targetTexture =
        nextRoom === "sala2"
          ? ROOM_ASSETS.SALA_2_NAAYERI
          : ROOM_ASSETS.SALA_1_WIXARIKA;

      try {
        await ScenePreloadManager.transitionSky(scene, targetTexture, () => {
          this.currentRoom = nextRoom;

          const badge = document.querySelector("#cv-current-room-badge");
          if (nextRoom === "sala2") {
            portalLabel.setAttribute("value", "VOLVER A SALA 1\n(WIXARIKA)");
            if (badge) {
              badge.textContent = `${UI_TEXT.EXPERIENCE_SCENE_LABEL}Sala 2 (Náayeri)`;
            }
          } else {
            portalLabel.setAttribute("value", "IR A SALA 2\n(NAAYERI)");
            if (badge) {
              badge.textContent = `${UI_TEXT.EXPERIENCE_SCENE_LABEL}Sala 1 (Wixárika)`;
            }
          }
        });
      } catch (err) {
        console.error("[ExperienceScreenView] Error cambiando de sala:", err);
      } finally {
        this.isTransitioning = false;
      }
    };

    // Escuchar el clic y gazer en el contenedor y en el disco interactivo
    portal.addEventListener("click", handlePortalActivation);
    portalCore.addEventListener("click", handlePortalActivation);
    portalFrame.addEventListener("click", handlePortalActivation);

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
      scene.style.removeProperty("display");
      scene.style.display = "block";
      if (scene.classList && typeof scene.classList.add === "function") {
        scene.classList.add(UI_CLASSES.SCENE_ACTIVE);
      }
      ExhibitRoomBuilder.ensureRoom(scene, this.viewMode);
      this.setupMultiRoomPortal(scene);
      this.setupInteractiveExhibits(scene);
      this.configureGazerForMode(scene);

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

      this.synchronizeViewport(scene);
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
      if (scene.renderer && typeof scene.renderer.setSize === "function") {
        scene.renderer.setSize(window.innerWidth, window.innerHeight);
      }

      const canvas = scene.querySelector<HTMLCanvasElement>("canvas.a-canvas");
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
      }

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
          // Ignorar fuera de entorno de navegador
        }
      }
    };

    triggerResize();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(triggerResize);
      setTimeout(triggerResize, 100);
    }
  }
}