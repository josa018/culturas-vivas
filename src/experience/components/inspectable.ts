import type { Vector3D } from "../constants";
import {
  EXHIBIT_DICTIONARY,
  EXHIBIT_DIMENSIONS,
  INSPECTION_TARGET_TOKENS,
  INSPECTION_TIMINGS,
  InspectionState,
  METADATA_BILLBOARD_OFFSET,
  ExhibitMediaType,
  RENDERER_QUALITY_TOKENS,
  ROOM_CENTER_COORDINATE,
  STATION_ARCHITECTURE_TOKENS,
} from "../constants";
import { ExhibitInspectionController } from "../inspection-controller";
import { createContactShadowDecal } from "../shadow-baker";
import { createCanvasTextPlane } from "./canvas-text";

let sharedInspectionController: ExhibitInspectionController | null = null;

export function getSharedInspectionController(): ExhibitInspectionController {
  if (!sharedInspectionController) {
    sharedInspectionController = new ExhibitInspectionController();
  }
  return sharedInspectionController;
}

export function setSharedInspectionController(
  controller: ExhibitInspectionController | null,
): void {
  sharedInspectionController = controller;
}

export interface InspectableComponentData {
  id: string;
  focalDistance: number;
  autoRotate: boolean;
  rotationSpeed: number;
  title: string;
  creatorName?: string;
  description: string;
  mediaType: string;
}

export interface InspectableEntity extends HTMLElement {
  object3D: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
  sceneEl?: HTMLElement;
  querySelector: <T extends HTMLElement = HTMLElement>(
    selector: string,
  ) => T | null;
}

export interface InspectableComponentInstance {
  el: InspectableEntity;
  data: InspectableComponentData;
  state: InspectionState;
  galleryPosition: Vector3D;
  galleryRotation: Vector3D;
  billboardEl: HTMLElement | null;
  returnBtnEl: HTMLElement | null;
  unsubscribeController: (() => void) | null;
  transitionEpoch: number;
  panelDelayTimer: ReturnType<typeof setTimeout> | null;
  hideBillboardTimer: ReturnType<typeof setTimeout> | null;
  inspectCompleteHandler: (() => void) | null;
  returnCompleteHandler: (() => void) | null;
  panelInCompleteHandler: (() => void) | null;
  panelOutCompleteHandler: (() => void) | null;
  init: () => void;
  inspect: () => void;
  returnToGallery: () => void;
  tick: (time: number, timeDelta: number) => void;
  remove: () => void;
}

export function computeModelTurntableDeltaRad(
  timeDeltaMs: number,
  rotationSpeedRadPerSec: number,
  maxStepMs: number = INSPECTION_TIMINGS.MODEL_ROTATION_MAX_STEP_MS,
): number {
  if (
    !Number.isFinite(timeDeltaMs) ||
    timeDeltaMs <= 0 ||
    !Number.isFinite(rotationSpeedRadPerSec) ||
    rotationSpeedRadPerSec === 0
  ) {
    return 0;
  }
  const clampedMs = Math.min(timeDeltaMs, maxStepMs);
  return (clampedMs / 1000) * rotationSpeedRadPerSec;
}

function isAFrameActive(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME)
  );
}

function setClickableState(el: HTMLElement | null, enabled: boolean): void {
  if (!el) {
    return;
  }
  const current = el.getAttribute("class") ?? "";
  const classes = current.split(/\s+/).filter(Boolean);
  const filtered = classes.filter((cls) => cls !== "clickable");
  if (enabled) {
    filtered.push("clickable");
  }
  el.setAttribute("class", filtered.join(" "));
}

function clearPendingTimersAndListeners(
  instance: InspectableComponentInstance,
): void {
  if (instance.panelDelayTimer !== null) {
    clearTimeout(instance.panelDelayTimer);
    instance.panelDelayTimer = null;
  }
  if (instance.hideBillboardTimer !== null) {
    clearTimeout(instance.hideBillboardTimer);
    instance.hideBillboardTimer = null;
  }
  if (instance.inspectCompleteHandler) {
    instance.el.removeEventListener?.(
      "animationcomplete__inspect",
      instance.inspectCompleteHandler,
    );
    instance.inspectCompleteHandler = null;
  }
  if (instance.returnCompleteHandler) {
    instance.el.removeEventListener?.(
      "animationcomplete__return",
      instance.returnCompleteHandler,
    );
    instance.returnCompleteHandler = null;
  }
  if (instance.billboardEl && instance.panelInCompleteHandler) {
    instance.billboardEl.removeEventListener?.(
      "animationcomplete__panel_in",
      instance.panelInCompleteHandler,
    );
    instance.panelInCompleteHandler = null;
  }
  if (instance.billboardEl && instance.panelOutCompleteHandler) {
    instance.billboardEl.removeEventListener?.(
      "animationcomplete__panel_out",
      instance.panelOutCompleteHandler,
    );
    instance.panelOutCompleteHandler = null;
  }
}

export function createInspectableComponentDefinition() {
  return {
    schema: {
      id: { type: "string", default: "" },
      focalDistance: {
        type: "number",
        default: INSPECTION_TARGET_TOKENS.MODEL_FOCAL_DISTANCE_M,
      },
      autoRotate: { type: "boolean", default: false },
      rotationSpeed: {
        type: "number",
        default: INSPECTION_TIMINGS.DEFAULT_ROTATION_SPEED,
      },
      title: { type: "string", default: "" },
      creatorName: { type: "string", default: "" },
      description: { type: "string", default: "" },
      mediaType: { type: "string", default: ExhibitMediaType.IMAGE_2D },
    },

    init: function (this: InspectableComponentInstance) {
      this.state = InspectionState.IDLE;
      this.unsubscribeController = null;
      this.returnBtnEl = null;
      this.transitionEpoch = 0;
      this.panelDelayTimer = null;
      this.hideBillboardTimer = null;
      this.inspectCompleteHandler = null;
      this.returnCompleteHandler = null;
      this.panelInCompleteHandler = null;
      this.panelOutCompleteHandler = null;
      const initialPos = this.el.getAttribute("position");
      const initialRot = this.el.getAttribute("rotation");

      const parseCoord = (attr: unknown): Vector3D => {
        if (typeof attr === "string") {
          const parts = attr.trim().split(/\s+/).map(Number);
          return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
        }
        if (attr && typeof attr === "object") {
          const obj = attr as Record<string, number>;
          return { x: obj.x || 0, y: obj.y || 0, z: obj.z || 0 };
        }
        return { x: 0, y: 0, z: 0 };
      };

      this.galleryPosition = parseCoord(initialPos);
      this.galleryRotation = parseCoord(initialRot);

      // Create sub-exhibit in-world 3D billboard entity
      const billboard = document.createElement("a-entity");
      billboard.setAttribute("class", "cv-billboard");
      billboard.setAttribute(
        "position",
        `${METADATA_BILLBOARD_OFFSET.x} ${METADATA_BILLBOARD_OFFSET.y} ${METADATA_BILLBOARD_OFFSET.z}`,
      );
      billboard.setAttribute(
        "rotation",
        `${INSPECTION_TARGET_TOKENS.BILLBOARD_TILT_X_DEG} 0 0`,
      );
      billboard.setAttribute("scale", INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE);
      billboard.setAttribute("visible", "false");

      const plane = document.createElement("a-plane");
      plane.setAttribute("width", String(EXHIBIT_DIMENSIONS.BILLBOARD_WIDTH));
      plane.setAttribute("height", String(EXHIBIT_DIMENSIONS.BILLBOARD_HEIGHT));
      plane.setAttribute("color", "#0f172a");
      plane.setAttribute("material", "shader: flat; side: double");

      const trimmedCreator = (this.data.creatorName ?? "").trim();
      const hasCreator = trimmedCreator.length > 0;
      const estimatedTitleLines = (this.data.title ?? "").trim().length > 34 ? 2 : 1;
      const estimatedCreatorLines =
        hasCreator && (`${EXHIBIT_DICTIONARY.CREATOR_PREFIX}${trimmedCreator}`).length > 42
          ? 2
          : 1;

      const creatorTop = estimatedTitleLines > 1 ? 0.11 : 0.165;
      const creatorCenterY = creatorTop - 0.055;
      const descTop = hasCreator
        ? creatorTop - (estimatedCreatorLines > 1 ? 0.12 : 0.085)
        : estimatedTitleLines > 1
          ? 0.105
          : 0.16;
      const descCenterY = descTop - 0.14;

      const titleEl = createCanvasTextPlane({
        className: "cv-billboard-title",
        value: this.data.title,
        color: "#38bdf8",
        align: "left",
        baseline: "top",
        width: EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WIDTH,
        height: 0.16,
        fontSizePx: 40,
        fontWeight: "700",
        canvasWidth: 800,
        canvasHeight: 112,
        maxLines: 2,
        paddingX: 20,
        paddingY: 12,
        position: "-0.12 0.21 0.03",
      });

      const creatorEl = createCanvasTextPlane({
        className: "cv-billboard-creator",
        value: hasCreator
          ? `${EXHIBIT_DICTIONARY.CREATOR_PREFIX}${trimmedCreator}`
          : "",
        visible: hasCreator ? "true" : "false",
        color: "#D99B26",
        align: "left",
        baseline: "top",
        width: 1.46,
        height: 0.11,
        fontSizePx: 32,
        fontWeight: "600",
        canvasWidth: 936,
        canvasHeight: 84,
        maxLines: 2,
        paddingX: 20,
        paddingY: 8,
        position: `0 ${creatorCenterY} 0.035`,
      });

      const descEl = createCanvasTextPlane({
        className: "cv-billboard-description",
        value: this.data.description,
        color: "#f1f5f9",
        align: "left",
        baseline: "top",
        width: 1.46,
        height: 0.28,
        fontSizePx: 34,
        fontWeight: "400",
        canvasWidth: 936,
        canvasHeight: 212,
        maxLines: 5,
        paddingX: 20,
        paddingY: 10,
        position: `0 ${descCenterY} 0.04`,
      });

      // Top-right circular close button (becomes .clickable only when billboard is open)
      const returnBtn = document.createElement("a-entity");
      returnBtn.setAttribute("class", "cv-return-btn");
      returnBtn.setAttribute(
        "geometry",
        `primitive: circle; radius: ${EXHIBIT_DIMENSIONS.CLOSE_BUTTON_RADIUS}; segments: ${RENDERER_QUALITY_TOKENS.CIRCLE_SEGMENTS}`,
      );
      returnBtn.setAttribute("material", "color: #e11d48; shader: flat");
      returnBtn.setAttribute("position", "0.68 0.21 0.05");
      returnBtn.setAttribute("data-action", "return-exhibit");

      const returnText = createCanvasTextPlane({
        value: EXHIBIT_DICTIONARY.CLOSE_ICON,
        color: "#ffffff",
        align: "center",
        baseline: "middle",
        width: 0.11,
        height: 0.11,
        fontSizePx: 64,
        fontWeight: "700",
        canvasWidth: 128,
        canvasHeight: 128,
        maxLines: 1,
        position: "0 0 0.01",
      });
      returnBtn.appendChild(returnText);

      returnBtn.addEventListener?.("click", (evt) => {
        if (
          evt &&
          typeof (evt as { stopPropagation?: () => void }).stopPropagation ===
            "function"
        ) {
          (evt as { stopPropagation: () => void }).stopPropagation();
        }
        this.returnToGallery();
      });

      plane.appendChild(titleEl);
      plane.appendChild(creatorEl);
      plane.appendChild(descEl);
      plane.appendChild(returnBtn);
      billboard.appendChild(plane);

      this.el.appendChild(billboard);
      this.billboardEl = billboard;
      this.returnBtnEl = returnBtn;

      if (
        this.data.mediaType === ExhibitMediaType.MODEL_3D &&
        !this.el.querySelector(".cv-contact-shadow")
      ) {
        this.el.appendChild(
          createContactShadowDecal({
            width: 0.95,
            depth: 0.95,
            yOffset: -1.18,
          }),
        );
      }

      // Subscribe to controller for mutual exclusivity / auto-return
      this.unsubscribeController = getSharedInspectionController().subscribe(
        (_state, active) => {
          if (
            (this.state === InspectionState.INSPECTING ||
              this.state === InspectionState.FOCUSING) &&
            active?.id !== this.data.id
          ) {
            this.returnToGallery();
          }
        },
      );

      // Handle focus trigger on exhibit click
      this.el.addEventListener?.("click", () => {
        if (this.state === InspectionState.IDLE) {
          this.inspect();
        }
      });
    },

    inspect: function (this: InspectableComponentInstance) {
      if (this.state !== InspectionState.IDLE) {
        return;
      }
      clearPendingTimersAndListeners(this);
      const epoch = ++this.transitionEpoch;
      this.state = InspectionState.FOCUSING;

      const controller = getSharedInspectionController();
      if (controller.getExhibit(this.data.id)) {
        if (!controller.focus(this.data.id)) {
          this.state = InspectionState.IDLE;
          return;
        }
      } else {
        controller.abortActiveInspection();
      }

      // Compute dynamic ergonomic radial target position
      const targetPos = controller.calculateErgonomicInspectionTarget(
        this.galleryPosition,
        ROOM_CENTER_COORDINATE,
        this.data.focalDistance || INSPECTION_TARGET_TOKENS.MODEL_FOCAL_DISTANCE_M,
        INSPECTION_TARGET_TOKENS.MODEL_INSPECTION_Y_M,
      );

      const curX = this.el.object3D?.position?.x ?? this.galleryPosition.x;
      const curY = this.el.object3D?.position?.y ?? this.galleryPosition.y;
      const curZ = this.el.object3D?.position?.z ?? this.galleryPosition.z;
      const fromPos = `${Number(curX.toFixed(3))} ${Number(curY.toFixed(3))} ${Number(curZ.toFixed(3))}`;
      const toPos = `${targetPos.x} ${targetPos.y} ${targetPos.z}`;

      // Smooth A-Frame animation without synchronous position snapping to prevent flicker
      this.el.removeAttribute("animation__return");
      this.el.setAttribute(
        "animation__inspect",
        `property: position; from: ${fromPos}; to: ${toPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
      );

      const hasAFrame = isAFrameActive();

      if (!hasAFrame) {
        // Direct attribute update for headless test runners where anime.js RAF does not run
        this.el.setAttribute("position", toPos);
      } else if (typeof this.el.addEventListener === "function") {
        const onComplete = () => {
          if (this.transitionEpoch !== epoch) {
            return;
          }
          this.el.setAttribute("position", toPos);
          this.el.removeEventListener?.("animationcomplete__inspect", onComplete);
          this.inspectCompleteHandler = null;
        };
        this.inspectCompleteHandler = onComplete;
        this.el.addEventListener("animationcomplete__inspect", onComplete);
      }

      // Counter-translate pedestal if present so it remains grounded at gallery coords
      const pedestal =
        this.el.querySelector(".cv-model-pedestal") ??
        this.el.querySelector("a-cylinder");
      if (pedestal) {
        const restY = pedestal.classList.contains("cv-model-pedestal")
          ? STATION_ARCHITECTURE_TOKENS.PEDESTAL_REST_Y
          : -0.4;
        const dx = targetPos.x - this.galleryPosition.x;
        const dy = targetPos.y - this.galleryPosition.y;
        const dz = targetPos.z - this.galleryPosition.z;
        const pedX = Number((-dx).toFixed(3));
        const pedY = Number((restY - dy).toFixed(3));
        const pedZ = Number((-dz).toFixed(3));
        pedestal.removeAttribute("animation__pedestal_return");
        pedestal.setAttribute(
          "animation__pedestal",
          `property: position; from: 0 ${restY} 0; to: ${pedX} ${pedY} ${pedZ}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
        );
        pedestal.setAttribute("position", `${pedX} ${pedY} ${pedZ}`);
      }

      // Sub-exhibit billboard animated entrance (cancelable delay avoids A-Frame delay timer leak)
      if (this.billboardEl) {
        this.billboardEl.removeAttribute("animation__panel_out");
        this.billboardEl.setAttribute("scale", INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE);
        this.billboardEl.setAttribute("visible", "true");
        setClickableState(this.returnBtnEl, true);

        const panelInAttr = `property: scale; from: ${INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE}; to: ${INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE}; dur: ${INSPECTION_TIMINGS.PANEL_ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.PANEL_ANIMATION_EASING}`;

        if (!hasAFrame) {
          // Synchronous fallback for headless test runners
          this.billboardEl.setAttribute("animation__panel_in", panelInAttr);
          this.billboardEl.setAttribute("scale", INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE);
        } else {
          if (typeof this.billboardEl.addEventListener === "function") {
            const onPanelInComplete = () => {
              if (
                this.transitionEpoch === epoch &&
                this.state === InspectionState.INSPECTING
              ) {
                this.billboardEl?.setAttribute(
                  "scale",
                  INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE,
                );
              }
              this.panelInCompleteHandler = null;
            };
            this.panelInCompleteHandler = onPanelInComplete;
            this.billboardEl.addEventListener(
              "animationcomplete__panel_in",
              onPanelInComplete,
              { once: true },
            );
          }

          this.panelDelayTimer = setTimeout(() => {
            this.panelDelayTimer = null;
            if (
              this.transitionEpoch !== epoch ||
              !this.billboardEl ||
              this.state !== InspectionState.INSPECTING
            ) {
              return;
            }
            this.billboardEl.setAttribute("animation__panel_in", panelInAttr);
          }, INSPECTION_TIMINGS.PANEL_ENTRANCE_DELAY_MS);
        }
      }

      // If exhibit has a video element, trigger play
      if (
        this.data.mediaType === ExhibitMediaType.VIDEO_2D ||
        this.data.mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
      ) {
        const video = this.el.querySelector("video") as
          | (HTMLVideoElement & { play?: () => void })
          | null;
        if (video && typeof video.play === "function") {
          video.play();
        }
      }

      this.state = InspectionState.INSPECTING;
      controller.completeFocus();
    },

    returnToGallery: function (this: InspectableComponentInstance) {
      if (this.state === InspectionState.IDLE) {
        return;
      }
      clearPendingTimersAndListeners(this);
      const epoch = ++this.transitionEpoch;
      this.state = InspectionState.RETURNING;
      setClickableState(this.returnBtnEl, false);

      // Animate billboard panel scale out with deferred visibility teardown
      if (this.billboardEl) {
        this.billboardEl.removeAttribute("animation__panel_in");
        this.billboardEl.setAttribute(
          "animation__panel_out",
          `property: scale; from: ${INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE}; to: ${INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE}; dur: ${INSPECTION_TIMINGS.PANEL_EXIT_DURATION_MS}; easing: ${INSPECTION_TIMINGS.PANEL_EXIT_EASING}`,
        );

        const hasAFrame = isAFrameActive();

        if (!hasAFrame) {
          this.billboardEl.setAttribute("scale", INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE);
          this.billboardEl.setAttribute("visible", "false");
        } else {
          const hideBillboard = () => {
            if (this.transitionEpoch !== epoch || !this.billboardEl) {
              return;
            }
            if (this.hideBillboardTimer !== null) {
              clearTimeout(this.hideBillboardTimer);
              this.hideBillboardTimer = null;
            }
            if (this.panelOutCompleteHandler) {
              this.billboardEl.removeEventListener?.(
                "animationcomplete__panel_out",
                this.panelOutCompleteHandler,
              );
              this.panelOutCompleteHandler = null;
            }
            this.billboardEl.setAttribute(
              "scale",
              INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE,
            );
            this.billboardEl.setAttribute("visible", "false");
          };
          if (typeof this.billboardEl.addEventListener === "function") {
            this.panelOutCompleteHandler = hideBillboard;
            this.billboardEl.addEventListener(
              "animationcomplete__panel_out",
              hideBillboard,
              { once: true },
            );
          }
          this.hideBillboardTimer = setTimeout(
            hideBillboard,
            INSPECTION_TIMINGS.PANEL_EXIT_DURATION_MS +
              INSPECTION_TIMINGS.PANEL_EXIT_TIMEOUT_BUFFER_MS,
          );
        }
      }

      // If video, pause
      if (
        this.data.mediaType === ExhibitMediaType.VIDEO_2D ||
        this.data.mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
      ) {
        const video = this.el.querySelector("video") as
          | (HTMLVideoElement & { pause?: () => void })
          | null;
        if (video && typeof video.pause === "function") {
          video.pause();
        }
      }

      // Restore pedestal grounded position
      const pedestal =
        this.el.querySelector(".cv-model-pedestal") ??
        this.el.querySelector("a-cylinder");
      if (pedestal) {
        const restY = pedestal.classList.contains("cv-model-pedestal")
          ? STATION_ARCHITECTURE_TOKENS.PEDESTAL_REST_Y
          : -0.4;
        const restPos = `0 ${restY} 0`;
        const currentPedPos = pedestal.getAttribute("position");
        const pedFrom =
          typeof currentPedPos === "string" ? currentPedPos : restPos;
        pedestal.removeAttribute("animation__pedestal");
        pedestal.setAttribute(
          "animation__pedestal_return",
          `property: position; from: ${pedFrom}; to: ${restPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
        );
        pedestal.setAttribute("position", restPos);
      }

      // Smooth A-Frame animation back to gallery position sampling live 3D coordinates
      const curX = this.el.object3D?.position?.x;
      const curY = this.el.object3D?.position?.y;
      const curZ = this.el.object3D?.position?.z;
      const fromPos =
        curX !== undefined && curY !== undefined && curZ !== undefined
          ? `${Number(curX.toFixed(3))} ${Number(curY.toFixed(3))} ${Number(curZ.toFixed(3))}`
          : this.el.getAttribute("position") ||
            `${this.galleryPosition.x} ${this.galleryPosition.y} ${this.galleryPosition.z}`;
      const toPos = `${this.galleryPosition.x} ${this.galleryPosition.y} ${this.galleryPosition.z}`;

      this.el.removeAttribute("animation__inspect");
      this.el.setAttribute(
        "animation__return",
        `property: position; from: ${fromPos}; to: ${toPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
      );

      if (!isAFrameActive()) {
        this.el.setAttribute("position", toPos);
      } else if (typeof this.el.addEventListener === "function") {
        const onReturnComplete = () => {
          if (this.transitionEpoch !== epoch) {
            return;
          }
          this.el.setAttribute("position", toPos);
          this.el.removeEventListener?.(
            "animationcomplete__return",
            onReturnComplete,
          );
          this.returnCompleteHandler = null;
        };
        this.returnCompleteHandler = onReturnComplete;
        this.el.addEventListener("animationcomplete__return", onReturnComplete);
      }

      const modelTarget = this.el.querySelector(".cv-inspectable-model") as
        | {
            object3D?: { rotation?: { y: number } };
            setAttribute?: (name: string, value: string) => void;
          }
        | null;
      if (modelTarget) {
        if (modelTarget.object3D?.rotation) {
          modelTarget.object3D.rotation.y = 0;
        }
        modelTarget.setAttribute?.("rotation", "0 0 0");
      }

      this.el.setAttribute(
        "rotation",
        `${this.galleryRotation.x} ${this.galleryRotation.y} ${this.galleryRotation.z}`,
      );

      this.state = InspectionState.IDLE;
      const controller = getSharedInspectionController();
      if (controller.getActiveExhibit()?.id === this.data.id) {
        controller.return();
        controller.completeReturn();
      }
    },

    tick: function (
      this: InspectableComponentInstance,
      _time: number,
      timeDelta: number,
    ) {
      if (this.state === InspectionState.INSPECTING && this.data.autoRotate) {
        const modelTarget = this.el.querySelector(".cv-inspectable-model") as
          | { object3D?: { rotation?: { y: number } } }
          | null;
        if (modelTarget?.object3D?.rotation) {
          modelTarget.object3D.rotation.y += computeModelTurntableDeltaRad(
            timeDelta,
            this.data.rotationSpeed,
          );
        }
      }
    },

    remove: function (this: InspectableComponentInstance) {
      this.transitionEpoch++;
      clearPendingTimersAndListeners(this);
      if (this.unsubscribeController) {
        this.unsubscribeController();
        this.unsubscribeController = null;
      }
      if (this.billboardEl) {
        this.billboardEl.remove();
        this.billboardEl = null;
      }
      this.returnBtnEl = null;
    },
  };
}

export function registerInspectableComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-inspectable",
      createInspectableComponentDefinition(),
    );
  }
}

// Auto-register if AFRAME is already loaded in the environment
if (typeof globalThis !== "undefined") {
  registerInspectableComponent();
}
